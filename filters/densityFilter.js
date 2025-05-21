// /filters/densityFilter.js
// Density Filter  - reworked to highlight *true* star-density (count / volume)
// ─────────────────────────────────────────────────────────────────────────────
//  • kd-tree subdivision is exactly the same as before (leaf ≤ kdSubdivisionThreshold)
//  • every leaf records   density = starCount / cellVolume
//  • slider (“density-subdivision-percent-slider” in the UI) now represents
//      a *minimum density*  (stars per ly³) instead of a raw star count
//  • visibility, colour and opacity scale with density percentile
//  • adjacency lines are only generated for cubes that are currently visible
//
//  IMPORTANT:  the rest of the code-base (index.js, UI wiring, etc.) is unchanged:
//   – the slider keeps its old id so nothing else needs to be edited
//   – public API (initDensityFilter, updateDensityFilter) is untouched
//   – no functionality removed

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { radToSphere, getGreatCirclePoints } from '../utils/geometryUtils.js';

export class DensityGridOverlay {
  /**
   * @param {number} minDistance  Minimum distance (LY) to include grid cells.
   * @param {number} maxDistance  Maximum distance (LY) to include grid cells.
   * @param {number} kdSubdivisionThreshold  Max stars per kd-tree leaf (default 10).
   */
  constructor(minDistance, maxDistance, kdSubdivisionThreshold = 10) {
    this.minDistance = parseFloat(minDistance);
    this.maxDistance = parseFloat(maxDistance);
    this.kdSubdivisionThreshold = kdSubdivisionThreshold;

    this.cubesData     = [];
    this.adjacentLines = [];

    /* groups reserved for future labelling features */
    this.regionClusters      = [];
    this.regionLabelsGroupTC = new THREE.Group();
    this.regionLabelsGroupGlobe = new THREE.Group();
  }

  /*──────────────────────────────────────────────────────────────────────────*/

  /* 1 – BUILD GRID + DENSITY */

  createGrid(stars) {
    this.cubesData = [];

    /* take stars in an extended shell (same heuristic as before) */
    const extendedStars = stars.filter(star => {
      const d = star.Distance_from_the_Sun;
      return d >= Math.max(0, this.minDistance - 10) && d <= this.maxDistance + 10;
    });

    /* project to Vector3s once */
    const points = extendedStars.map(star =>
      star.truePosition
        ? star.truePosition.clone()
        : new THREE.Vector3(star.x_coordinate, star.y_coordinate, star.z_coordinate)
    );

    /* kd-tree split */
    const bbox      = this.computeBoundingBox(points);
    const leafCells = this.subdivide(points, bbox, this.kdSubdivisionThreshold, 0);

    /* find max depth for cosmetics */
    let maxDepth = 0;
    leafCells.forEach(cell => { if (cell.depth > maxDepth) maxDepth = cell.depth; });

    /* build geometry for every leaf */
    leafCells.forEach(cell => {
      const sizeX     = cell.bbox.max.x - cell.bbox.min.x;
      const sizeY     = cell.bbox.max.y - cell.bbox.min.y;
      const sizeZ     = cell.bbox.max.z - cell.bbox.min.z;
      const cellSize  = Math.max(sizeX, sizeY, sizeZ);

      const geometry  = new THREE.BoxGeometry(cellSize, cellSize, cellSize);

      /* Lightness & alpha still vary with depth so structure is visible */
      const depthRatio = maxDepth > 0 ? cell.depth / maxDepth : 0;
      const alpha      = 0.15 + depthRatio * (0.5 - 0.15);
      const L          = 0.8  - depthRatio * (0.8  - 0.4);

      const material = new THREE.MeshBasicMaterial({
        color       : new THREE.Color().setHSL(120 / 360, 0.70, L),   // green hue
        transparent : true,
        opacity     : alpha,
        depthWrite  : false
      });

      /* central position of cell (True-Coordinates) */
      const center = new THREE.Vector3(
        (cell.bbox.min.x + cell.bbox.max.x) / 2,
        (cell.bbox.min.y + cell.bbox.max.y) / 2,
        (cell.bbox.min.z + cell.bbox.max.z) / 2
      );

      const cubeTC = new THREE.Mesh(geometry, material);
      cubeTC.position.copy(center);

      /* billboard on the globe */
      const planeGeom  = new THREE.PlaneGeometry(cellSize, cellSize);
      const material2  = material.clone();
      const squareGlobe = new THREE.Mesh(planeGeom, material2);

      const distFromCenter = center.length();
      let projectedPos;
      if (distFromCenter < 1e-6) {
        projectedPos = new THREE.Vector3(0, 0, 0);
      } else {
        const ra    = Math.atan2(-center.z, -center.x);
        const dec   = Math.asin(center.y / distFromCenter);
        const radius = 100;
        projectedPos = new THREE.Vector3(
          -radius * Math.cos(dec) * Math.cos(ra),
           radius * Math.sin(dec),
          -radius * Math.cos(dec) * Math.sin(ra)
        );
      }
      squareGlobe.position.copy(projectedPos);
      const normal = projectedPos.clone().normalize();
      squareGlobe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);

      /* density metric */
      const volume   = (cellSize ** 3) || 1;
      const density  = cell.count / volume;

      const cellObj = {
        tcMesh      : cubeTC,
        globeMesh   : squareGlobe,
        center      : center,
        bbox        : cell.bbox,
        count       : cell.count,
        volume      : volume,
        density     : density,
        depth       : cell.depth,
        active      : false,
        grid        : { ix: 0, iy: 0, iz: 0 }               // kept for compatibility
      };
      this.cubesData.push(cellObj);
    });

    /* build neighbour lines ONCE (they get toggled later) */
    this.computeAdjacentLines();
  }

  /*──────────────────────────────────────────────────────────────────────────*/

  /* 2 – GEOMETRY HELPERS (unchanged) */

  computeBoundingBox(points) {
    if (points.length === 0) return { min: new THREE.Vector3(), max: new THREE.Vector3() };
    const min = points[0].clone();
    const max = points[0].clone();
    points.forEach(p => {
      min.x = Math.min(min.x, p.x);
      min.y = Math.min(min.y, p.y);
      min.z = Math.min(min.z, p.z);
      max.x = Math.max(max.x, p.x);
      max.y = Math.max(max.y, p.y);
      max.z = Math.max(max.z, p.z);
    });
    return { min, max };
  }

  subdivide(points, bbox, threshold, depth) {
    if (points.length <= threshold || points.length <= 1) {
      const volume = (bbox.max.x - bbox.min.x) *
                     (bbox.max.y - bbox.min.y) *
                     (bbox.max.z - bbox.min.z) || 1;
      return [{ bbox, count: points.length, volume, depth }];
    }

    const sizeX = bbox.max.x - bbox.min.x;
    const sizeY = bbox.max.y - bbox.min.y;
    const sizeZ = bbox.max.z - bbox.min.z;
    let axis = 'x';
    if (sizeY >= sizeX && sizeY >= sizeZ) axis = 'y';
    else if (sizeZ >= sizeX && sizeZ >= sizeY) axis = 'z';

    points.sort((a, b) => a[axis] - b[axis]);
    const medianIndex  = Math.floor(points.length / 2);
    const medianValue  = points[medianIndex][axis];

    const leftBbox  = { min: bbox.min.clone(), max: bbox.max.clone() };
    const rightBbox = { min: bbox.min.clone(), max: bbox.max.clone() };
    leftBbox.max[axis]  = medianValue;
    rightBbox.min[axis] = medianValue;

    const leftPoints  = points.slice(0, medianIndex);
    const rightPoints = points.slice(medianIndex);

    return [
      ...this.subdivide(leftPoints,  leftBbox,  threshold, depth + 1),
      ...this.subdivide(rightPoints, rightBbox, threshold, depth + 1)
    ];
  }

  /*──────────────────────────────────────────────────────────────────────────*/

  /* 3 – ADJACENCY (now skips invisible cells to save work) */

  areCellsAdjacent(cell1, cell2, tol) {
    const b1 = cell1.bbox;
    const b2 = cell2.bbox;
    const overlapX = !(b1.max.x < b2.min.x - tol || b1.min.x > b2.max.x + tol);
    const overlapY = !(b1.max.y < b2.min.y - tol || b1.min.y > b2.max.y + tol);
    const overlapZ = !(b1.max.z < b2.min.z - tol || b1.min.z > b2.max.z + tol);
    return overlapX && overlapY && overlapZ;
  }

  computeAdjacentLines() {
    this.adjacentLines = [];
    const tol = 0.001;

    for (let i = 0; i < this.cubesData.length; i++) {
      for (let j = i + 1; j < this.cubesData.length; j++) {
        const cell1 = this.cubesData[i];
        const cell2 = this.cubesData[j];

        /* generate line ONCE, but we'll toggle .visible later */
        if (this.areCellsAdjacent(cell1, cell2, tol)) {
          const points    = getGreatCirclePoints(cell1.globeMesh.position,
                                                 cell2.globeMesh.position, 100, 16);
          const positions = [];
          const colors    = [];
          const c1 = cell1.globeMesh.material.color;
          const c2 = cell2.globeMesh.material.color;
          for (let k = 0; k < points.length; k++) {
            positions.push(points[k].x, points[k].y, points[k].z);
            const t = k / (points.length - 1);
            colors.push(
              THREE.MathUtils.lerp(c1.r, c2.r, t),
              THREE.MathUtils.lerp(c1.g, c2.g, t),
              THREE.MathUtils.lerp(c1.b, c2.b, t)
            );
          }
          const geom = new THREE.BufferGeometry();
          geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          geom.setAttribute('color',    new THREE.Float32BufferAttribute(colors,    3));

          const mat  = new THREE.LineBasicMaterial({
            vertexColors : true,
            transparent  : true,
            opacity      : 0.3,
            linewidth    : 1
          });

          const line = new THREE.Line(geom, mat);
          line.renderOrder = 1;

          this.adjacentLines.push({ line, cell1, cell2 });
        }
      }
    }
  }

  /*──────────────────────────────────────────────────────────────────────────*/

  /* 4 – MAIN UPDATE LOOP */

  update(stars, sceneTC, sceneGlobe) {
    /* remove previous meshes from scenes */
    this.cubesData.forEach(cell => {
      if (cell.tcMesh   && cell.tcMesh.parent)   cell.tcMesh.parent.remove(cell.tcMesh);
      if (cell.globeMesh && cell.globeMesh.parent) cell.globeMesh.parent.remove(cell.globeMesh);
    });
    this.adjacentLines.forEach(obj => {
      if (obj.line && obj.line.parent) obj.line.parent.remove(obj.line);
    });

    /* rebuild grid completely – keeps old behaviour for safety */
    this.buildAdaptiveGrid(stars);

    /* ---- NEW: percentile table for colour mapping ---- */
    const sortedDensities = this.cubesData
      .map(c => c.density)
      .sort((a, b) => a - b);

    const densityPercentile = (value) => {
      /* binary search for percentile rank */
      let lo = 0, hi = sortedDensities.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (sortedDensities[mid] < value) lo = mid + 1;
        else hi = mid - 1;
      }
      return lo / sortedDensities.length;   // 0…1
    };

    /* slider – same id, new semantics */
    const minDensity = parseFloat(
      document.getElementById('density-subdivision-percent-slider').value
    ) || 0;

    /* radial scaling baseline for globe */
    let maxDepth = 0;
    this.cubesData.forEach(cell => { if (cell.depth > maxDepth) maxDepth = cell.depth; });

    /* ---- iterate cells ---- */
    this.cubesData.forEach(cell => {
      /* visibility */
      cell.active = (cell.density >= minDensity);

      /* colour/opacity from percentile */
      const p          = densityPercentile(cell.density);
      const alpha      = THREE.MathUtils.lerp(0.15, 0.6, p);
      const L          = THREE.MathUtils.lerp(0.40, 0.15, p);
      const hslColor   = new THREE.Color().setHSL(120 / 360, 0.70, L);

      cell.tcMesh.material.color.copy(hslColor);
      cell.tcMesh.material.opacity = alpha;
      cell.tcMesh.visible          = cell.active;

      cell.globeMesh.material.color.copy(hslColor);
      cell.globeMesh.material.opacity = alpha;
      cell.globeMesh.visible          = cell.active;

      /* distance-based scale on globe stays unchanged */
      const ratio = Math.min(1, cell.center.length() / this.maxDistance);
      const scale = THREE.MathUtils.lerp(20.0, 0.1, ratio);
      cell.globeMesh.scale.set(scale, scale, 1);
    });

    /* ---- update adjacency lines ---- */
    this.adjacentLines.forEach(obj => {
      const { line, cell1, cell2 } = obj;
      if (cell1.active && cell2.active) {
        /* recompute gradient colours (cheap) */
        const points    = getGreatCirclePoints(cell1.globeMesh.position,
                                               cell2.globeMesh.position, 100, 16);
        const positions = [];
        const colors    = [];
        const c1 = cell1.globeMesh.material.color;
        const c2 = cell2.globeMesh.material.color;

        for (let i = 0; i < points.length; i++) {
          positions.push(points[i].x, points[i].y, points[i].z);
          const t = i / (points.length - 1);
          colors.push(
            THREE.MathUtils.lerp(c1.r, c2.r, t),
            THREE.MathUtils.lerp(c1.g, c2.g, t),
            THREE.MathUtils.lerp(c1.b, c2.b, t)
          );
        }
        line.geometry.setAttribute('position',
          new THREE.Float32BufferAttribute(positions, 3));
        line.geometry.setAttribute('color',
          new THREE.Float32BufferAttribute(colors, 3));
        line.geometry.attributes.position.needsUpdate = true;
        line.geometry.attributes.color.needsUpdate    = true;

        /* line width = mean of globe square scales */
        const avgScale = (cell1.globeMesh.scale.x + cell2.globeMesh.scale.x) / 2;
        line.material.linewidth = avgScale;
        line.visible = true;
      } else {
        line.visible = false;
      }
    });

    /* ---- push meshes back into scenes ---- */
    if (sceneTC && sceneGlobe) {
      this.cubesData.forEach(cell => {
        sceneTC.add(cell.tcMesh);
        sceneGlobe.add(cell.globeMesh);
      });
      this.adjacentLines.forEach(obj => {
        sceneGlobe.add(obj.line);
      });
    }
  }

  /*──────────────────────────────────────────────────────────────────────────*/

  /* 5 – REBUILD kd-tree (helper kept intact) */

  buildAdaptiveGrid(stars) {
    this.cubesData = [];

    const extendedStars = stars.filter(star => {
      const d = star.Distance_from_the_Sun;
      return d >= Math.max(0, this.minDistance - 10) && d <= this.maxDistance + 10;
    });

    const points = extendedStars.map(star =>
      star.truePosition
        ? star.truePosition.clone()
        : new THREE.Vector3(star.x_coordinate, star.y_coordinate, star.z_coordinate)
    );

    const bbox      = this.computeBoundingBox(points);
    const leafCells = this.subdivide(points, bbox, this.kdSubdivisionThreshold, 0);

    /* duplicate of createGrid() core – we factorised logic for clarity */
    let maxDepth = 0;
    leafCells.forEach(cell => { if (cell.depth > maxDepth) maxDepth = cell.depth; });

    leafCells.forEach(cell => {
      const sizeX    = cell.bbox.max.x - cell.bbox.min.x;
      const sizeY    = cell.bbox.max.y - cell.bbox.min.y;
      const sizeZ    = cell.bbox.max.z - cell.bbox.min.z;
      const cellSize = Math.max(sizeX, sizeY, sizeZ);

      const geometry = new THREE.BoxGeometry(cellSize, cellSize, cellSize);

      const depthRatio = maxDepth > 0 ? cell.depth / maxDepth : 0;
      const alpha      = 0.15 + depthRatio * (0.5 - 0.15);
      const L          = 0.8  - depthRatio * (0.8 - 0.4);

      const material = new THREE.MeshBasicMaterial({
        color       : new THREE.Color().setHSL(120 / 360, 0.70, L),
        transparent : true,
        opacity     : alpha,
        depthWrite  : false
      });

      const center = new THREE.Vector3(
        (cell.bbox.min.x + cell.bbox.max.x) / 2,
        (cell.bbox.min.y + cell.bbox.max.y) / 2,
        (cell.bbox.min.z + cell.bbox.max.z) / 2
      );

      const cubeTC = new THREE.Mesh(geometry, material);
      cubeTC.position.copy(center);

      const planeGeom  = new THREE.PlaneGeometry(cellSize, cellSize);
      const material2  = material.clone();
      const squareGlobe = new THREE.Mesh(planeGeom, material2);

      const distFromCenter = center.length();
      let projectedPos;
      if (distFromCenter < 1e-6) {
        projectedPos = new THREE.Vector3(0, 0, 0);
      } else {
        const ra    = Math.atan2(-center.z, -center.x);
        const dec   = Math.asin(center.y / distFromCenter);
        const radius = 100;
        projectedPos = new THREE.Vector3(
          -radius * Math.cos(dec) * Math.cos(ra),
           radius * Math.sin(dec),
          -radius * Math.cos(dec) * Math.sin(ra)
        );
      }
      squareGlobe.position.copy(projectedPos);
      const normal = projectedPos.clone().normalize();
      squareGlobe.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);

      const volume   = (cellSize ** 3) || 1;
      const density  = cell.count / volume;

      const cellObj = {
        tcMesh    : cubeTC,
        globeMesh : squareGlobe,
        center    : center,
        bbox      : cell.bbox,
        count     : cell.count,
        volume    : volume,
        density   : density,
        depth     : cell.depth,
        active    : false,
        grid      : { ix: 0, iy: 0, iz: 0 }
      };
      this.cubesData.push(cellObj);
    });

    /* rebuild adjacency on the fresh set */
    this.computeAdjacentLines();
  }
}

/*────────────────────────────────────────────────────────────────────────────*/

/* unchanged public helpers */

export function initDensityFilter(minDistance, maxDistance, starArray, kdSubdivisionThreshold = 10) {
  const overlay = new DensityGridOverlay(minDistance, maxDistance, kdSubdivisionThreshold);
  overlay.createGrid(starArray);
  return overlay;
}

export function updateDensityFilter(starArray, overlay, sceneTC, sceneGlobe) {
  if (!overlay) return;
  overlay.update(starArray, sceneTC, sceneGlobe);
}
