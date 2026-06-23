// Density overlay implementation migrated from the legacy density filter module.
import * as THREE from '../../vendor/three.js';
import { getMollweideLambda0, minimalRADifference } from '../../shared/geometryUtils.js';
import { lightenColor } from './densityColorScale.js';
import { disposeObject3D } from '../../render/engine/renderUtils.js';
import { buildDistanceQueryIndex, populateCellDistanceCaches, sumWeightedDistancesWithinRadius } from '../../shared/cellDistanceCache.js';
import { HEATMAP_CANVAS_WIDTH, HEATMAP_CANVAS_HEIGHT, HEATMAP_PLANE_WIDTH, HEATMAP_PLANE_HEIGHT, MOLLWEIDE_MAX_ITERATIONS, EPSILON } from '../../shared/constants.js';
import { InstancedCellLayer, createCellVisualState } from '../overlays/instancedCellLayer.js';

// Pre-allocated reusable objects to avoid per-cell allocations in hot loops
const _tempColor = new THREE.Color();
const _tempColorA = new THREE.Color();

class DensityGridOverlay {
  constructor(minDistance, maxDistance, gridSize = 2) {
    this.minDistance = parseFloat(minDistance);
    this.maxDistance = parseFloat(maxDistance);
    this.gridSize = gridSize;
    this.cubesData = [];
    this.adjacentLines = [];
    this.maxDensity = 0;
    this.opacityFactor = 1.0;
    this.revision = 0;
    this.tcCellLayer = null;

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

          const cubeTC = createCellVisualState(posTC, 0xff0000, 0);
          let ra, dec;
          if (distFromCenter < 1e-6) {
            ra = 0; dec = 0;
          } else {
            ra = Math.atan2(-posTC.z, -posTC.x);
            dec = Math.asin(posTC.y / distFromCenter);
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

          const cell = {
            tcMesh: cubeTC,
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

    this.tcCellLayer = new InstancedCellLayer({
      geometry: new THREE.BoxGeometry(this.gridSize, this.gridSize, this.gridSize),
      count: this.cubesData.length
    });
    populateCellDistanceCaches(this.cubesData, this.getExtendedStars(stars));
  }

  getSceneObjects() {
    return {
      tc: this.tcCellLayer ? [this.tcCellLayer.mesh] : [],
      globe: [],
      moll: [this.textureMesh]
    };
  }

  dispose() {
    this.tcCellLayer?.dispose();
    disposeObject3D(this.textureMesh);
  }

  getExtendedStars(stars) {
    return stars.filter(star => {
      const distance = star.distance;
      return distance >= Math.max(0, this.minDistance - 10) && distance <= this.maxDistance + 10;
    });
  }

  computeCellDensity(cell, radius = 10, tolerance = 0, queryIndex = null) {
    cell.density = sumWeightedDistancesWithinRadius(cell, radius, tolerance, queryIndex);
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
      const col = cell.tcMesh.material.color;
      const alpha = cell.tcMesh.material.opacity;
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

  update(stars, sceneTC, sceneGlobe, sceneMoll, options = {}) {
    const radius = Number.isFinite(options.density) ? options.density : 10;
    const tolerance = Number.isFinite(options.densityTolerance) ? options.densityTolerance : 0;
    const bottomPct = Number.isFinite(options.densityBottomPercent) ? options.densityBottomPercent : 10;
    const topPct = Number.isFinite(options.densityTopPercent) ? options.densityTopPercent : 10;
    this.opacityFactor = Number.isFinite(options.densityOpacity) ? options.densityOpacity : 1.0;

    const queryIndex = buildDistanceQueryIndex(this.cubesData[0]?.distanceCache, radius);
    this.cubesData.forEach(cell => {
      this.computeCellDensity(cell, radius, tolerance, queryIndex);
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
      cell.tcMesh.material.color.copy(_tempColor);
      cell.tcMesh.visible = cell.active;
    });
    this.tcCellLayer?.update(this.cubesData, cell => cell.tcMesh);
    this.revision += 1;
    this.drawHeatmap(getMollweideLambda0());
  }

  refreshMollweide(lambda0 = getMollweideLambda0()) {
    this.revision += 1;
    this.drawHeatmap(lambda0, true); // force redraw since Mollweide positions changed
  }
}

export function initDensityFilter(minDistance, maxDistance, starArray, gridSize = 2) {
  const overlay = new DensityGridOverlay(minDistance, maxDistance, gridSize);
  overlay.createGrid(starArray);
  return overlay;
}

export function updateDensityFilter(starArray, overlay, sceneTC, sceneGlobe, sceneMoll, options = {}) {
  if (!overlay) return;
  overlay.update(starArray, sceneTC, sceneGlobe, sceneMoll, options);
}
