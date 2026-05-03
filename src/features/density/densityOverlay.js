// Density overlay implementation migrated from the legacy density filter module.
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import {
  getGreatCirclePoints,
  getMollweideLambda0
} from '../../shared/geometryUtils.js';
import { minimalRADifference } from '../../shared/geometryUtils.js';
import { lightenColor } from './densityColorScale.js';
import { populateCellDistanceCaches, sumWeightedDistancesWithinRadius } from '../../shared/cellDistanceCache.js';
import { GLOBE_RADIUS, HEATMAP_CANVAS_WIDTH, HEATMAP_CANVAS_HEIGHT, HEATMAP_PLANE_WIDTH, HEATMAP_PLANE_HEIGHT, MOLLWEIDE_MAX_ITERATIONS, EPSILON } from '../../shared/constants.js';

// Pre-allocated reusable objects to avoid per-cell allocations in hot loops.
const _tempColor = new THREE.Color();
const _tempColorA = new THREE.Color();
const _lineColor = new THREE.Color();

// Hard upper bound on the number of grid cells the density overlay may build.
// Guards against pathological combinations of maxDistance and tiny gridSize.
const DENSITY_MAX_CELLS = 4000;
const DENSITY_MIN_GRID_SIZE = 0.1;

// The previous implementation created one THREE.Line + geometry + material per
// adjacent cell pair. At default settings that was ~13k WebGL objects in one
// toggle, enough to trigger CONTEXT_LOST on Intel/ANGLE. The replacement below
// keeps adjacent pairs as plain JS data and renders all visible globe lines as
// one merged LineSegments object.
const DENSITY_MAX_ADJACENT_PAIRS = 30000;
const DENSITY_MAX_RENDERED_LINE_PAIRS = 8000;
const DENSITY_GLOBE_LINE_SEGMENTS = 8;

function clampGridSizeForBounds(gridSize, maxDistance) {
  const safeMax = Math.max(0, parseFloat(maxDistance) || 0);
  let safeGrid = Math.max(DENSITY_MIN_GRID_SIZE, parseFloat(gridSize) || DENSITY_MIN_GRID_SIZE);
  if (safeMax <= 0) return safeGrid;

  let cellsPerAxis = Math.floor((2 * safeMax) / safeGrid) + 1;
  let estimated = cellsPerAxis * cellsPerAxis * cellsPerAxis;
  while (estimated > DENSITY_MAX_CELLS && safeGrid < safeMax) {
    safeGrid *= 1.25;
    cellsPerAxis = Math.floor((2 * safeMax) / safeGrid) + 1;
    estimated = cellsPerAxis * cellsPerAxis * cellsPerAxis;
  }
  return safeGrid;
}

class DensityGridOverlay {
  constructor(minDistance, maxDistance, gridSize = 2) {
    this.minDistance = parseFloat(minDistance);
    this.maxDistance = parseFloat(maxDistance);
    const clampedGrid = clampGridSizeForBounds(gridSize, this.maxDistance);
    if (clampedGrid !== gridSize) {
      console.warn(
        `[DensityGridOverlay] gridSize ${gridSize} would produce too many cells for maxDistance ${this.maxDistance}; clamped to ${clampedGrid.toFixed(3)} (cap: ${DENSITY_MAX_CELLS} cells).`
      );
    }

    this.gridSize = clampedGrid;
    this.cubesData = [];
    this.adjacentLines = []; // data only: { cell1, cell2, points }
    this.maxDensity = 0;
    this.mollLineWidth = 30;
    this.opacityFactor = 1.0;
    this.fadePower = 1.0;
    this.revision = 0;

    this.cellGeometry = new THREE.BoxGeometry(this.gridSize, this.gridSize, this.gridSize);

    this.globeLines = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
        linewidth: 1
      })
    );
    this.globeLines.renderOrder = 2;
    this.globeLines.visible = false;

    // Off-screen canvas for smooth Mollweide heatmap.
    this.canvasWidth = HEATMAP_CANVAS_WIDTH;
    this.canvasHeight = HEATMAP_CANVAS_HEIGHT;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvasWidth;
    this.canvas.height = this.canvasHeight;
    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) throw new Error('2D canvas context unavailable');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    const mat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false
    });
    this.textureMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(HEATMAP_PLANE_WIDTH, HEATMAP_PLANE_HEIGHT),
      mat
    );
    this.textureMesh.renderOrder = 2;
    this._heatmapRevision = -1;
  }

  createGrid(stars) {
    const halfExt = Math.ceil(this.maxDistance / this.gridSize) * this.gridSize;
    this.cubesData = [];

    for (let x = -halfExt; x <= halfExt; x += this.gridSize) {
      for (let y = -halfExt; y <= halfExt; y += this.gridSize) {
        for (let z = -halfExt; z <= halfExt; z += this.gridSize) {
          const posTC = new THREE.Vector3(
            x + this.gridSize / 2,
            y + this.gridSize / 2,
            z + this.gridSize / 2
          );
          const distFromCenter = posTC.length();
          if (distFromCenter < this.minDistance || distFromCenter > this.maxDistance) continue;

          const material = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.0,
            depthWrite: false
          });
          const cubeTC = new THREE.Mesh(this.cellGeometry, material);
          cubeTC.position.copy(posTC);
          cubeTC.visible = false;

          let globePos;
          let ra;
          let dec;
          if (distFromCenter < 1e-6) {
            globePos = new THREE.Vector3(0, 0, 0);
            ra = 0;
            dec = 0;
          } else {
            ra = Math.atan2(-posTC.z, -posTC.x);
            dec = Math.asin(posTC.y / distFromCenter);
            globePos = new THREE.Vector3(
              -GLOBE_RADIUS * Math.cos(dec) * Math.cos(ra),
               GLOBE_RADIUS * Math.sin(dec),
              -GLOBE_RADIUS * Math.cos(dec) * Math.sin(ra)
            );
          }

          let theta = dec;
          for (let i = 0; i < MOLLWEIDE_MAX_ITERATIONS; i++) {
            const delta = (2 * theta + Math.sin(2 * theta) - Math.PI * Math.sin(dec)) /
              (2 + 2 * Math.cos(2 * theta));
            theta -= delta;
            if (Math.abs(delta) < EPSILON) break;
          }

          const cell = {
            tcMesh: cubeTC,
            tcPos: posTC,
            globePos,
            grid: {
              ix: Math.round(x / this.gridSize),
              iy: Math.round(y / this.gridSize),
              iz: Math.round(z / this.gridSize)
            },
            active: false,
            color: new THREE.Color(0xffffff),
            opacity: 0,
            raRad: ra,
            decRad: dec,
            mollXFactor: (2 * 100 / Math.PI) * Math.cos(theta),
            mollY: 100 * Math.sin(theta),
            density: 0
          };
          cell.id = this.cubesData.length;
          this.cubesData.push(cell);
        }
      }
    }

    this.computeAdjacentLines();
    populateCellDistanceCaches(this.cubesData, this.getExtendedStars(stars));
  }

  getExtendedStars(stars) {
    return stars.filter(star => {
      const distance = star.distance;
      return distance >= Math.max(0, this.minDistance - 10) && distance <= this.maxDistance + 10;
    });
  }

  computeCellDensity(cell, radius = 10, tolerance = 0) {
    cell.density = sumWeightedDistancesWithinRadius(cell, radius, tolerance);
  }

  computeAdjacentLines() {
    this.adjacentLines = [];
    const cellMap = new Map();
    this.cubesData.forEach(cell => {
      cellMap.set(`${cell.grid.ix},${cell.grid.iy},${cell.grid.iz}`, cell);
    });

    const directions = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          if (dx > 0 || (dx === 0 && dy > 0) || (dx === 0 && dy === 0 && dz > 0)) {
            directions.push({ dx, dy, dz });
          }
        }
      }
    }

    const estimatedPairs = directions.length * this.cubesData.length;
    if (estimatedPairs > DENSITY_MAX_ADJACENT_PAIRS) {
      console.warn(
        `[DensityGridOverlay] Skipping adjacent-line generation: estimated ${estimatedPairs} pair lines exceeds cap ${DENSITY_MAX_ADJACENT_PAIRS}.`
      );
      return;
    }

    for (const dir of directions) {
      for (const cell of this.cubesData) {
        const neighbor = cellMap.get(`${cell.grid.ix + dir.dx},${cell.grid.iy + dir.dy},${cell.grid.iz + dir.dz}`);
        if (!neighbor) continue;
        const points = getGreatCirclePoints(cell.globePos, neighbor.globePos, GLOBE_RADIUS, DENSITY_GLOBE_LINE_SEGMENTS);
        this.adjacentLines.push({ cell1: cell, cell2: neighbor, points });
      }
    }
  }

  updateGlobeLines() {
    const positions = [];
    const colors = [];
    let renderedPairs = 0;

    for (const obj of this.adjacentLines) {
      const { cell1, cell2, points } = obj;
      if (!cell1.active || !cell2.active) continue;
      if (renderedPairs >= DENSITY_MAX_RENDERED_LINE_PAIRS) break;

      _lineColor.copy(cell1.color).lerp(cell2.color, 0.5);
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        colors.push(_lineColor.r, _lineColor.g, _lineColor.b, _lineColor.r, _lineColor.g, _lineColor.b);
      }
      renderedPairs += 1;
    }

    const oldGeometry = this.globeLines.geometry;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.globeLines.geometry = geometry;
    oldGeometry?.dispose?.();

    this.globeLines.material.opacity = 0.3 * this.opacityFactor;
    this.globeLines.material.linewidth = Math.max(1, this.mollLineWidth / 15);
    this.globeLines.visible = positions.length > 0;
  }

  drawHeatmap(lambda0 = getMollweideLambda0(), force = false) {
    if (!force && this._heatmapRevision === this.revision) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    ctx.filter = 'blur(8px)';

    const xScale = this.canvasWidth / 400;
    const yScale = this.canvasHeight / 200;
    const safeMaxDistance = Math.max(EPSILON, this.maxDistance);

    this.cubesData.forEach(cell => {
      if (!cell.active) return;
      const lambda = minimalRADifference(cell.raRad - lambda0);
      const x = cell.mollXFactor * lambda;
      const y = cell.mollY;
      const ratio = cell.tcPos.length() / safeMaxDistance;
      const scale = THREE.MathUtils.lerp(20.0, 0.1, Math.min(1, ratio));
      const width = this.gridSize * scale * xScale;
      const height = this.gridSize * scale * yScale;
      const px = (x + 200) * xScale;
      const py = (100 - y) * yScale;
      const col = cell.color;
      const alpha = cell.opacity;
      const r = Math.round(col.r * 255);
      const g = Math.round(col.g * 255);
      const b = Math.round(col.b * 255);
      const radius = Math.max(width, height);
      const grd = ctx.createRadialGradient(px, py, 0, px, py, radius);
      grd.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
      grd.addColorStop(0.7, `rgba(${r},${g},${b},${alpha * 0.3})`);
      grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.filter = 'none';
    this.texture.needsUpdate = true;
    this._heatmapRevision = this.revision;
  }

  update(stars, sceneTC, sceneGlobe, sceneMoll) {
    const radiusSlider = document.getElementById('density-slider');
    const tolSlider = document.getElementById('density-tolerance-slider');
    const bottomSlider = document.getElementById('density-bottom-slider');
    const topSlider = document.getElementById('density-top-slider');
    const opacitySlider = document.getElementById('density-opacity-slider');
    const widthSlider = document.getElementById('density-line-width-slider');
    const fadeSlider = document.getElementById('density-fade-slider');

    const radius = radiusSlider ? parseFloat(radiusSlider.value) : 10;
    const tolerance = tolSlider ? parseInt(tolSlider.value) : 0;
    const bottomPct = bottomSlider ? parseFloat(bottomSlider.value) : 10;
    const topPct = topSlider ? parseFloat(topSlider.value) : 10;
    this.opacityFactor = opacitySlider ? parseFloat(opacitySlider.value) / 100 : 1.0;
    if (widthSlider) this.mollLineWidth = parseFloat(widthSlider.value);
    if (fadeSlider) this.fadePower = parseFloat(fadeSlider.value);

    if (this.cubesData.length === 0) {
      this.updateGlobeLines();
      this.drawHeatmap(getMollweideLambda0(), true);
      return;
    }

    this.cubesData.forEach(cell => {
      this.computeCellDensity(cell, radius, tolerance);
    });

    const sorted = this.cubesData.map(c => c.density).sort((a, b) => a - b);
    const bottomIdx = Math.floor(sorted.length * (bottomPct / 100));
    const topIdx = Math.floor(sorted.length * (1 - topPct / 100));
    const minD = sorted[0];
    const maxD = sorted[sorted.length - 1];
    const bottomThr = sorted[Math.min(bottomIdx, sorted.length - 1)];
    const topThr = sorted[Math.max(topIdx, 0)];
    const safeMaxDistance = Math.max(EPSILON, this.maxDistance);
    const lightRedBase = lightenColor(new THREE.Color(0xff0000), 0.4);

    this.cubesData.forEach(cell => {
      const ratio = cell.tcPos.length() / safeMaxDistance;
      const scale = THREE.MathUtils.lerp(20.0, 0.1, Math.min(1, ratio));
      let alpha = 0;

      if (cell.density <= bottomThr) {
        const t = bottomThr === minD ? 0 : (cell.density - minD) / (bottomThr - minD);
        _tempColor.set(0x0000ff).lerp(_tempColorA.set(0xffffff), t);
        alpha = 0.5 * (1 - t);
        cell.active = true;
      } else if (cell.density >= topThr) {
        const t = topThr === maxD ? 0 : (cell.density - topThr) / (maxD - topThr);
        _tempColor.copy(lightRedBase).lerp(_tempColorA.set(0xff0000), t);
        alpha = 0.5 * t;
        cell.active = true;
      } else {
        _tempColor.set(0xffffff);
        cell.active = false;
      }

      const finalAlpha = alpha * this.opacityFactor;
      cell.color.copy(_tempColor);
      cell.opacity = finalAlpha;
      cell.tcMesh.material.opacity = finalAlpha;
      cell.tcMesh.material.color.copy(_tempColor);
      cell.tcMesh.visible = cell.active;
      cell.tcMesh.scale.set(scale, scale, scale);
    });

    this.updateGlobeLines();
    this.revision += 1;
    this.drawHeatmap(getMollweideLambda0());
  }

  refreshMollweide(lambda0 = getMollweideLambda0()) {
    this.revision += 1;
    this.drawHeatmap(lambda0, true);
  }
}

export function initDensityFilter(minDistance, maxDistance, starArray, gridSize = 2) {
  const overlay = new DensityGridOverlay(minDistance, maxDistance, gridSize);
  overlay.createGrid(starArray);
  return overlay;
}

export function getEffectiveDensityGridSize(gridSize, maxDistance) {
  return clampGridSizeForBounds(gridSize, maxDistance);
}

export function updateDensityFilter(starArray, overlay, sceneTC, sceneGlobe, sceneMoll) {
  if (!overlay) return;
  overlay.update(starArray, sceneTC, sceneGlobe, sceneMoll);
}
