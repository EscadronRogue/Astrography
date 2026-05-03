// Density overlay implementation migrated from the legacy density filter module.
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import {
  getGreatCirclePoints,
  cachedRadToMollweide,
  getMollweideLambda0,
  splitMollweideWrap,
  vectorToRaDecRad,
  radToMollweide
} from '../../shared/geometryUtils.js';
import { minimalRADifference } from '../../shared/geometryUtils.js';
import { lightenColor } from './densityColorScale.js';
import { createWideLineMaterial, buildWideLineGeometry, disposeObject3D } from '../../render/engine/renderUtils.js';
import { populateCellDistanceCaches, sumWeightedDistancesWithinRadius } from '../../shared/cellDistanceCache.js';
import { GLOBE_RADIUS, HEATMAP_CANVAS_WIDTH, HEATMAP_CANVAS_HEIGHT, HEATMAP_PLANE_WIDTH, HEATMAP_PLANE_HEIGHT, MOLLWEIDE_MAX_ITERATIONS, EPSILON } from '../../shared/constants.js';

// Pre-allocated reusable objects to avoid per-cell allocations in hot loops
const _tempColor = new THREE.Color();
const _tempColorA = new THREE.Color();

// Hard upper bound on the number of grid cells the density overlay may build.
// Guards against pathological combinations of maxDistance and a tiny gridSize,
// which would otherwise allocate millions of THREE meshes/materials/geometries
// and cause WebGL CONTEXT_LOST from GPU memory exhaustion.
const DENSITY_MAX_CELLS = 20000;
const DENSITY_MIN_GRID_SIZE = 0.1;

function clampGridSizeForBounds(gridSize, maxDistance) {
  const safeMax = Math.max(0, parseFloat(maxDistance) || 0);
  let safeGrid = Math.max(DENSITY_MIN_GRID_SIZE, parseFloat(gridSize) || DENSITY_MIN_GRID_SIZE);
  if (safeMax <= 0) return safeGrid;
  // Estimate cell count from a cubic bounding region of side 2*halfExt.
  // We progressively double gridSize until the estimated total fits the cap.
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
    this.adjacentLines = [];
    this.maxDensity = 0;
    this.mollLineWidth = 30; // width of connection lines on the Mollweide map
    this.opacityFactor = 1.0;
    this.fadePower = 1.0;
    this.revision = 0;

    // Off-screen canvas for smooth Mollweide heatmap
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
    this._heatmapRevision = -1; // tracks last drawn revision to avoid redundant redraws
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

          const geometry = new THREE.BoxGeometry(this.gridSize, this.gridSize, this.gridSize);
          const material = new THREE.MeshBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.0,
            depthWrite: false
          });
          const cubeTC = new THREE.Mesh(geometry, material);
          cubeTC.position.copy(posTC);

          const planeGeom = new THREE.PlaneGeometry(this.gridSize, this.gridSize);
          const circleGeom = new THREE.CircleGeometry(this.gridSize / 2, 32);
          const planeMat = material.clone();
          planeMat.side = THREE.DoubleSide;
          const squareGlobe = new THREE.Mesh(planeGeom, planeMat.clone());
          const circleMoll = new THREE.Mesh(circleGeom, planeMat.clone());

          let projectedPos;
          let ra, dec;
          if (distFromCenter < 1e-6) {
            projectedPos = new THREE.Vector3(0, 0, 0);
            circleMoll.position.set(0, 0, 0);
            ra = 0; dec = 0;
          } else {
            ra = Math.atan2(-posTC.z, -posTC.x);
            dec = Math.asin(posTC.y / distFromCenter);
            const radius = GLOBE_RADIUS;
            projectedPos = new THREE.Vector3(
              -radius * Math.cos(dec) * Math.cos(ra),
               radius * Math.sin(dec),
              -radius * Math.cos(dec) * Math.sin(ra)
            );
            const projMoll = cachedRadToMollweide(ra, dec, GLOBE_RADIUS, getMollweideLambda0());
            circleMoll.position.copy(projMoll);
          }
          let theta = dec;
          for (let i = 0; i < MOLLWEIDE_MAX_ITERATIONS; i++) {
            const delta = (2 * theta + Math.sin(2 * theta) - Math.PI * Math.sin(dec)) /
              (2 + 2 * Math.cos(2 * theta));
            theta -= delta;
            if (Math.abs(delta) < EPSILON) break;
          }
          const cosT = Math.cos(theta);
          const sinT = Math.sin(theta);
          const mollXFactor = (2 * 100 / Math.PI) * cosT;
          const mollY = 100 * sinT;
          squareGlobe.position.copy(projectedPos);
          const nrm = projectedPos.clone().normalize();
          let right = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), nrm);
          if (right.lengthSq() < 1e-6) right.set(1,0,0);
          right.normalize();
          const upVec = new THREE.Vector3().crossVectors(nrm, right).normalize();
          const mat4 = new THREE.Matrix4().makeBasis(right, upVec, nrm);
          squareGlobe.setRotationFromMatrix(mat4);

          const cell = {
            tcMesh: cubeTC,
            globeMesh: squareGlobe,
            mollweideMesh: circleMoll,
            tcPos: posTC,
            grid: {
              ix: Math.round(x / this.gridSize),
              iy: Math.round(y / this.gridSize),
              iz: Math.round(z / this.gridSize)
            },
            active: false,
            raRad: ra,
            decRad: dec,
            mollXFactor: mollXFactor,
            mollY: mollY,
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
      const key = `${cell.grid.ix},${cell.grid.iy},${cell.grid.iz}`;
      cellMap.set(key, cell);
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
    directions.forEach(dir => {
      this.cubesData.forEach(cell => {
        const neighborKey = `${cell.grid.ix + dir.dx},${cell.grid.iy + dir.dy},${cell.grid.iz + dir.dz}`;
        if (cellMap.has(neighborKey)) {
          const neighbor = cellMap.get(neighborKey);
          const points = getGreatCirclePoints(cell.globeMesh.position, neighbor.globeMesh.position, 100, 16);
          const positions = [];
          const mollPts = getGreatCirclePoints(cell.globeMesh.position,
            neighbor.globeMesh.position, 100, 16).map(v => {
              const { ra, dec } = vectorToRaDecRad(v, 100);
              return radToMollweide(ra, dec, 100, getMollweideLambda0());
            });
          const pointsM = [];
          for (let m = 0; m < mollPts.length - 1; m++) {
            const segsM = splitMollweideWrap(mollPts[m], mollPts[m + 1]);
            segsM.forEach(([s,e]) => { pointsM.push(s, e); });
          }
          const geomM = buildWideLineGeometry(pointsM, this.mollLineWidth);
          for (let i = 0; i < points.length; i++) {
            positions.push(points[i].x, points[i].y, points[i].z);
          }
          const geom = new THREE.BufferGeometry();
          geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          const mat = new THREE.LineBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.3,
            linewidth: 2
          });
          const line = new THREE.Line(geom, mat);
          line.renderOrder = 2;
          const mollMat = createWideLineMaterial(0xff0000, { fadePower: this.fadePower });
          const lineM = new THREE.Mesh(geomM, mollMat);
          lineM.renderOrder = 2;
          this.adjacentLines.push({ line, lineM, cell1: cell, cell2: neighbor });
        }
      });
    });
  }

  drawHeatmap(lambda0 = getMollweideLambda0(), force = false) {
    if (!force && this._heatmapRevision === this.revision) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    ctx.filter = 'blur(8px)';
    const xScale = this.canvasWidth / 400;
    const yScale = this.canvasHeight / 200;
    this.cubesData.forEach(cell => {
      if (!cell.active) return;
      const lambda = minimalRADifference(cell.raRad - lambda0);
      const x = cell.mollXFactor * lambda;
      const y = cell.mollY;
      const ratio = cell.tcPos.length() / this.maxDistance;
      const scale = THREE.MathUtils.lerp(20.0, 0.1, Math.min(1, ratio));
      const width = this.gridSize * scale * xScale;
      const height = this.gridSize * scale * yScale;
      const px = (x + 200) * xScale;
      const py = (100 - y) * yScale;
      const col = cell.mollweideMesh.material.color;
      const alpha = cell.mollweideMesh.material.opacity;
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
    let newWidth = this.mollLineWidth;
    if (widthSlider) newWidth = parseFloat(widthSlider.value);
    if (fadeSlider) this.fadePower = parseFloat(fadeSlider.value);

    if (newWidth !== this.mollLineWidth) {
      this.mollLineWidth = newWidth;
      this.refreshMollweide();
    }

    this.cubesData.forEach(cell => {
      this.computeCellDensity(cell, radius, tolerance);
    });

    const densities = this.cubesData.map(c => c.density);
    const sorted = densities.slice().sort((a, b) => a - b);
    const bottomIdx = Math.floor(sorted.length * (bottomPct / 100));
    const topIdx = Math.floor(sorted.length * (1 - topPct / 100));
    const minD = sorted[0];
    const maxD = sorted[sorted.length - 1];
    const bottomThr = sorted[Math.min(bottomIdx, sorted.length - 1)];
    const topThr = sorted[Math.max(topIdx, 0)];

    // Pre-compute the lightened red color once for the top-density branch
    const _lightRedBase = lightenColor(new THREE.Color(0xff0000), 0.4);

    this.cubesData.forEach(cell => {
      const ratio = cell.tcPos.length() / this.maxDistance;
      const scale = THREE.MathUtils.lerp(20.0, 0.1, Math.min(1, ratio));
      let alpha = 0;
      if (cell.density <= bottomThr) {
        const t = bottomThr === minD ? 0 : (cell.density - minD) / (bottomThr - minD);
        _tempColor.set(0x0000ff).lerp(_tempColorA.set(0xffffff), t);
        alpha = 0.5 * (1 - t);
        cell.active = true;
      } else if (cell.density >= topThr) {
        const t = topThr === maxD ? 0 : (cell.density - topThr) / (maxD - topThr);
        _tempColor.copy(_lightRedBase).lerp(_tempColorA.set(0xff0000), t);
        alpha = 0.5 * t;
        cell.active = true;
      } else {
        _tempColor.set(0xffffff);
        cell.active = false;
      }

      const finalAlpha = alpha * this.opacityFactor;
      cell.tcMesh.material.opacity = finalAlpha;
      cell.globeMesh.material.opacity = finalAlpha;
      cell.mollweideMesh.material.opacity = finalAlpha;
      cell.tcMesh.material.color.copy(_tempColor);
      cell.globeMesh.material.color.copy(_tempColor);
      cell.mollweideMesh.material.color.copy(_tempColor);
      cell.tcMesh.visible = cell.active;
      cell.globeMesh.scale.set(scale, scale, 1);
      cell.mollweideMesh.scale.set(scale * 2, scale * 2, 1);
    });
    this.adjacentLines.forEach(obj => {
      const { line, lineM, cell1, cell2 } = obj;
      const visible = cell1.active && cell2.active;
      line.visible = visible;
      lineM.visible = visible;
      if (visible) {
        _tempColor.copy(cell1.tcMesh.material.color).lerp(cell2.tcMesh.material.color, 0.5);
        const avgOpacity = (cell1.tcMesh.material.opacity + cell2.tcMesh.material.opacity) / 2;
        line.material.color.copy(_tempColor);
        line.material.opacity = avgOpacity;
        line.material.vertexColors = false;
        line.material.needsUpdate = true;
        lineM.material.uniforms.color.value.copy(_tempColor);
        lineM.material.uniforms.opacityFactor.value = avgOpacity;
        lineM.material.uniforms.fadePower.value = this.fadePower;
        lineM.material.needsUpdate = true;
      }
    });
    this.revision += 1;
    this.drawHeatmap(getMollweideLambda0());
  }

  refreshMollweide(lambda0 = getMollweideLambda0()) {
    this.cubesData.forEach(cell => {
      const lambda = minimalRADifference(cell.raRad - lambda0);
      cell.mollweideMesh.position.set(
        cell.mollXFactor * lambda,
        cell.mollY,
        0
      );
    });
    this.adjacentLines.forEach(obj => {
      const gcPts = getGreatCirclePoints(obj.cell1.globeMesh.position,
        obj.cell2.globeMesh.position, 100, 16).map(v => {
          const { ra, dec } = vectorToRaDecRad(v, 100);
          return radToMollweide(ra, dec, 100, lambda0);
        });
      const pts = [];
      for (let i = 0; i < gcPts.length - 1; i++) {
        const segs = splitMollweideWrap(gcPts[i], gcPts[i + 1]);
        segs.forEach(([s,e]) => { pts.push(s, e); });
      }
      obj.lineM.geometry.dispose();
      obj.lineM.geometry = buildWideLineGeometry(pts, this.mollLineWidth);
      if (obj.lineM.material.uniforms.fadePower) {
        obj.lineM.material.uniforms.fadePower.value = this.fadePower;
      }
    });
    this.revision += 1;
    this.drawHeatmap(lambda0, true); // force redraw since Mollweide positions changed
  }
}

export function initDensityFilter(minDistance, maxDistance, starArray, gridSize = 2) {
  const overlay = new DensityGridOverlay(minDistance, maxDistance, gridSize);
  overlay.createGrid(starArray);
  return overlay;
}

/**
 * Returns the gridSize the DensityGridOverlay would actually use given the
 * requested gridSize and maxDistance, after applying the cell-count safety cap.
 * Callers (e.g. needsRebuild) can use this to compare apples-to-apples and
 * avoid triggering perpetual rebuilds when the constructor clamps the value.
 */
export function getEffectiveDensityGridSize(gridSize, maxDistance) {
  return clampGridSizeForBounds(gridSize, maxDistance);
}

export function updateDensityFilter(starArray, overlay, sceneTC, sceneGlobe, sceneMoll) {
  if (!overlay) return;
  overlay.update(starArray, sceneTC, sceneGlobe, sceneMoll);
}
