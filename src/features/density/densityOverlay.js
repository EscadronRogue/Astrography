import * as THREE from '../../vendor/three.js';
import { lightenColor } from './densityColorScale.js';
import { buildDistanceQueryIndex, populateCellDistanceCaches, sumWeightedDistancesWithinRadius } from '../../shared/cellDistanceCache.js';
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
          const cell = {
            tcMesh: cubeTC,
            tcPos: posTC,
            grid: {
              ix: Math.round(x / this.gridSize),
              iy: Math.round(y / this.gridSize),
              iz: Math.round(z / this.gridSize)
            },
            active: false,
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
      globe: []
    };
  }

  dispose() {
    this.tcCellLayer?.dispose();
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

  update(stars, sceneTC, sceneGlobe, options = {}) {
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
  }
}

export function initDensityFilter(minDistance, maxDistance, starArray, gridSize = 2) {
  const overlay = new DensityGridOverlay(minDistance, maxDistance, gridSize);
  overlay.createGrid(starArray);
  return overlay;
}

export function updateDensityFilter(starArray, overlay, sceneTC, sceneGlobe, options = {}) {
  if (!overlay) return;
  overlay.update(starArray, sceneTC, sceneGlobe, options);
}
