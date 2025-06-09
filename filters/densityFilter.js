// /filters/densityFilter.js
// ─────────────────────────────────────────────────────────────────────────────
// High-density filter – shows regions of ABOVE-threshold star density.
//   • Uses the same kd-tree subdivision logic you already had.
//   • The UI slider with id "density-subdivision-percent-slider" is preserved
//     but is now interpreted as a percentile (1-100) rather than a raw count.
//
// Behaviour:
//   - slider = 1   →   top 1 % densest cells            (very few cubes)
//   - slider = 50  →   top half of the density range    (crowded half)
//   - slider = 100 →   show every cube (old look)
//
// Only this file changed. Public API and all other files are untouched.

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { getGreatCirclePoints, cachedRadToMollweide, getMollweideLambda0, splitMollweideWrap } from '../utils/geometryUtils.js';

export class DensityGridOverlay {
  /**
   * @param {number} minDistance              lower distance bound (LY)
   * @param {number} maxDistance              upper distance bound (LY)
   * @param {number} kdSubdivisionThreshold   max stars per kd-tree leaf (default 10)
   */
  constructor(minDistance, maxDistance, kdSubdivisionThreshold = 10) {
    this.minDistance             = parseFloat(minDistance);
    this.maxDistance             = parseFloat(maxDistance);
    this.kdSubdivisionThreshold  = kdSubdivisionThreshold;

    this.cubesData     = [];
    this.adjacentLines = [];
  }

  /* ───────────────────────────── BUILD GRID ───────────────────────────── */

  /** Build kd-tree, create cube meshes, compute density for each leaf. */
  createGrid(stars) {
    this.cubesData = [];

    /* star shell (same heuristic as original code) */
    const shellStars = stars.filter(s => {
      const d = s.Distance_from_the_Sun;
      return d >= Math.max(0, this.minDistance - 10) && d <= this.maxDistance + 10;
    });

    /* project to Vector3 once per star */
    const points = shellStars.map(s =>
      s.truePosition
        ? s.truePosition.clone()
        : new THREE.Vector3(s.x_coordinate, s.y_coordinate, s.z_coordinate)
    );

    /* kd-tree subdivision */
    const rootBBox = this.computeBBox(points);
    const leaves   = this.subdivide(points, rootBBox,
                                    this.kdSubdivisionThreshold, 0);

    /* deepest depth (for cosmetic tint) */
    const maxDepth = leaves.reduce((m, c) => Math.max(m, c.depth), 0);

    /* build mesh pair (TrueCoordinates cube + Globe square) for each leaf */
    leaves.forEach(leaf => this.addCellMesh(leaf, maxDepth));

    /* neighbour lines (created once, toggled later) */
    this.computeAdjacentLines();
  }

  /** Create meshes for one kd-tree leaf. */
  addCellMesh(cell, maxDepth) {
    /* cube size = longest edge of bbox */
    const sx   = cell.bbox.max.x - cell.bbox.min.x;
    const sy   = cell.bbox.max.y - cell.bbox.min.y;
    const sz   = cell.bbox.max.z - cell.bbox.min.z;
    const size = Math.max(sx, sy, sz);

    const geometry = new THREE.BoxGeometry(size, size, size);

    /* cosmetic tint / alpha from depth (keeps original visual layering) */
    const dRatio = maxDepth ? cell.depth / maxDepth : 0;
    const baseL  = THREE.MathUtils.lerp(0.8, 0.4, dRatio);  // 0.8→0.4
    const baseA  = THREE.MathUtils.lerp(0.15, 0.5, dRatio); // 0.15→0.5

    const material = new THREE.MeshBasicMaterial({
      color       : new THREE.Color().setHSL(120 / 360, 0.7, baseL),  // green range
      transparent : true,
      opacity     : baseA,
      depthWrite  : false
    });

    /* centre of bbox */
    const center = new THREE.Vector3(
      (cell.bbox.min.x + cell.bbox.max.x) / 2,
      (cell.bbox.min.y + cell.bbox.max.y) / 2,
      (cell.bbox.min.z + cell.bbox.max.z) / 2
    );

    const cubeTC = new THREE.Mesh(geometry, material);
    cubeTC.position.copy(center);

    /* flat square projected on 100-LY globe */
    const plane     = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
                                     material.clone());
    const r         = center.length();
    const projPos   = r < 1e-6
      ? new THREE.Vector3(0, 0, 0)
      : new THREE.Vector3(
          -100 * center.x / r,
           100 * center.y / r,
          -100 * center.z / r
        );
    plane.position.copy(projPos);
    plane.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1),
                                        projPos.clone().normalize());

    /* density = star count / volume (≈ ly³) */
    const volume  = Math.max(size ** 3, 1e-9);
    const density = cell.count / volume;

    this.cubesData.push({
      tcMesh    : cubeTC,
      globeMesh : plane,
      mollweideMesh : (() => {
        const ra = Math.atan2(-center.z, -center.x);
        const dec = Math.asin(center.y / r);
        const p = cachedRadToMollweide(ra, dec, 100, getMollweideLambda0());
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material.clone());
        mesh.position.copy(p);
        return mesh;
      })(),
      center    : center,
      bbox      : cell.bbox,
      count     : cell.count,
      volume    : volume,
      density   : density,
      depth     : cell.depth,
      active    : false
    });
  }

  /* ───────────────────────────── UPDATE LOOP ──────────────────────────── */

  /**
   * Re-apply threshold & update visibility.  
   * Re-creates grid each call (same as original design). */
  update(stars, sceneTC, sceneGlobe, sceneMoll) {
    /* remove previous meshes from scenes */
    this.cubesData.forEach(c => {
      c.tcMesh.parent?.remove(c.tcMesh);
      c.globeMesh.parent?.remove(c.globeMesh);
      c.mollweideMesh.parent?.remove(c.mollweideMesh);
    });
    this.adjacentLines.forEach(o => {
      o.line.parent?.remove(o.line);
      o.lineM?.parent?.remove(o.lineM);
    });

    /* rebuild grid */
    this.createGrid(stars);

    /* sorted density list to compute percentiles */
    const densities = this.cubesData.map(c => c.density).sort((a, b) => a - b);

    /* UI slider (1-100) = percentile cut */
    const sliderVal = parseFloat(
      document.getElementById('density-subdivision-percent-slider').value
    ) || 5;                           // default 5 %

    const pct       = THREE.MathUtils.clamp(sliderVal, 1, 100) / 100;
    const cutIndex  = Math.floor((1 - pct) * (densities.length - 1));
    const cutoff    = densities[cutIndex] ?? 0;

    /* prepare colour scaling helper */
    const percentile = v => {
      let lo = 0, hi = densities.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (densities[mid] < v) lo = mid + 1;
        else hi = mid - 1;
      }
      return lo / densities.length;      // 0→1
    };

    /* iterate cells */
    this.cubesData.forEach(cell => {
      cell.active = cell.density >= cutoff;

      /* colour/opacity from own percentile */
      const p = percentile(cell.density);                 // 0→1
      const L = THREE.MathUtils.lerp(0.40, 0.15, p);      // darker when denser
      const A = THREE.MathUtils.lerp(0.15, 0.60, p);      // more opaque

      cell.tcMesh.material.color.setHSL(120 / 360, 0.7, L);
      cell.globeMesh.material.color.copy(cell.tcMesh.material.color);

      cell.tcMesh.material.opacity    = A;
      cell.globeMesh.material.opacity = A;

      cell.tcMesh.visible   = cell.active;
      cell.globeMesh.visible = cell.active;
      cell.mollweideMesh.visible = cell.active;

      /* globe square scale = distance-based (unchanged) */
      const ratio = Math.min(1, cell.center.length() / this.maxDistance);
      const scl   = THREE.MathUtils.lerp(20, 0.1, ratio);
      cell.globeMesh.scale.set(scl, scl, 1);
      cell.mollweideMesh.scale.set(scl, scl, 1);
    });

    /* neighbour lines: only between visible cells + colour gradient */
    this.adjacentLines.forEach(obj => {
      const { line, lineM, cell1, cell2 } = obj;
      if (!(cell1.active && cell2.active)) {
        line.visible = false;
        lineM.visible = false;
        return;
      }
      const pts  = getGreatCirclePoints(cell1.globeMesh.position,
                                        cell2.globeMesh.position, 100, 16);
      const pos  = [];
      const col  = [];
      for (let i = 0; i < pts.length; i++) {
        pos.push(pts[i].x, pts[i].y, pts[i].z);
        const t = i / (pts.length - 1);
        col.push(
          THREE.MathUtils.lerp(cell1.globeMesh.material.color.r,
                               cell2.globeMesh.material.color.r, t),
          THREE.MathUtils.lerp(cell1.globeMesh.material.color.g,
                               cell2.globeMesh.material.color.g, t),
          THREE.MathUtils.lerp(cell1.globeMesh.material.color.b,
                               cell2.globeMesh.material.color.b, t)
        );
      }
      line.geometry.setAttribute('position',
        new THREE.Float32BufferAttribute(pos, 3));
      line.geometry.setAttribute('color',
        new THREE.Float32BufferAttribute(col, 3));
      line.geometry.attributes.position.needsUpdate = true;
      line.geometry.attributes.color.needsUpdate    = true;
      line.visible = true;
      const p1 = cell1.mollweideMesh.position.clone();
      const p2 = cell2.mollweideMesh.position.clone();
      const segs = splitMollweideWrap(p1, p2);
      const ptsM = [];
      segs.forEach(([s, e]) => { ptsM.push(s, e); });
      lineM.geometry.setFromPoints(ptsM);
      lineM.visible = true;
    });

    /* push meshes back into scenes */
    this.cubesData.forEach(c => {
      sceneTC.add(c.tcMesh);
      sceneGlobe.add(c.globeMesh);
      sceneMoll.add(c.mollweideMesh);
    });
    this.adjacentLines.forEach(o => { sceneGlobe.add(o.line); sceneMoll.add(o.lineM); });
  }

  refreshMollweide(lambda0 = getMollweideLambda0()) {
    this.cubesData.forEach(cell => {
      const ra = Math.atan2(-cell.center.z, -cell.center.x);
      const dec = Math.asin(cell.center.y / cell.center.length());
      const p = cachedRadToMollweide(ra, dec, 100, lambda0);
      cell.mollweideMesh.position.copy(p);
    });
    this.adjacentLines.forEach(obj => {
      const p1 = obj.cell1.mollweideMesh.position.clone();
      const p2 = obj.cell2.mollweideMesh.position.clone();
      const segs = splitMollweideWrap(p1, p2);
      const pts = [];
      segs.forEach(([s, e]) => { pts.push(s, e); });
      obj.lineM.geometry.setFromPoints(pts);
    });
  }

  /* ───────────────────────────── HELPERS ─────────────────────────────── */

  /** Axis-aligned bounding box of an array of Vector3s. */
  computeBBox(points) {
    const min = points[0].clone(), max = points[0].clone();
    points.forEach(p => {
      min.min(p);
      max.max(p);
    });
    return { min, max };
  }

  /**
   * Brute-force kd-tree subdivision (same as your original algorithm).
   * Returns array of leaf objects { bbox, count, depth }.
   */
  subdivide(points, bbox, threshold, depth) {
    if (points.length <= threshold || points.length <= 1) {
      return [{ bbox, count: points.length, depth }];
    }

    /* split along longest axis at median */
    const sx = bbox.max.x - bbox.min.x;
    const sy = bbox.max.y - bbox.min.y;
    const sz = bbox.max.z - bbox.min.z;
    const axis = sx >= sy && sx >= sz ? 'x' : sy >= sz ? 'y' : 'z';

    points.sort((a, b) => a[axis] - b[axis]);
    const mid = Math.floor(points.length / 2);
    const split = points[mid][axis];

    const leftBBox  = { min: bbox.min.clone(), max: bbox.max.clone() };
    const rightBBox = { min: bbox.min.clone(), max: bbox.max.clone() };
    leftBBox.max[axis]  = split;
    rightBBox.min[axis] = split;

    return [
      ...this.subdivide(points.slice(0, mid), leftBBox,  threshold, depth + 1),
      ...this.subdivide(points.slice(mid),   rightBBox, threshold, depth + 1)
    ];
  }

  /** True if bounding boxes overlap (within tolerance). */
  areAdjacent(c1, c2, tol = 1e-3) {
    const a = c1.bbox, b = c2.bbox;
    const ox = !(a.max.x < b.min.x - tol || a.min.x > b.max.x + tol);
    const oy = !(a.max.y < b.min.y - tol || a.min.y > b.max.y + tol);
    const oz = !(a.max.z < b.min.z - tol || a.min.z > b.max.z + tol);
    return ox && oy && oz;
  }

  /** Build neighbour line objects once (turned on/off later). */
  computeAdjacentLines() {
    this.adjacentLines = [];
    for (let i = 0; i < this.cubesData.length; i++) {
      for (let j = i + 1; j < this.cubesData.length; j++) {
        const a = this.cubesData[i], b = this.cubesData[j];
        if (!this.areAdjacent(a, b)) continue;

        /* straight line initialised with dummy colours (updated each frame) */
        const pts = getGreatCirclePoints(a.center, b.center, 100, 16);
        const pos = [], col = [];
        pts.forEach(p => {
          pos.push(p.x, p.y, p.z);
          col.push(0, 1, 0);          // placeholder
        });

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position',
          new THREE.Float32BufferAttribute(pos, 3));
        geom.setAttribute('color',
          new THREE.Float32BufferAttribute(col, 3));
        const ra1 = Math.atan2(-a.center.z, -a.center.x);
        const dec1 = Math.asin(a.center.y / a.center.length());
        const ra2 = Math.atan2(-b.center.z, -b.center.x);
        const dec2 = Math.asin(b.center.y / b.center.length());
        const pM1 = cachedRadToMollweide(ra1, dec1, 100, getMollweideLambda0());
        const pM2 = cachedRadToMollweide(ra2, dec2, 100, getMollweideLambda0());
        const segsM = splitMollweideWrap(pM1, pM2);
        const pointsM = [];
        segsM.forEach(([s, e]) => { pointsM.push(s, e); });
        const geomM = new THREE.BufferGeometry().setFromPoints(pointsM);

        const mat = new THREE.LineBasicMaterial({
          vertexColors : true,
          transparent  : true,
          opacity      : 0.3,
          linewidth    : 1
        });

        this.adjacentLines.push({
          line  : new THREE.Line(geom, mat),
          lineM : new THREE.LineSegments(geomM, mat.clone()),
          cell1 : a,
          cell2 : b
        });
      }
    }
  }
}

/* ─────────────────────── Public wrapper helpers ─────────────────────── */

export function initDensityFilter(minDistance, maxDistance,
                                  starArray,
                                  kdSubdivisionThreshold = 10) {
  const overlay = new DensityGridOverlay(minDistance,
                                         maxDistance,
                                         kdSubdivisionThreshold);
  overlay.createGrid(starArray);
  return overlay;
}

export function updateDensityFilter(starArray, overlay,
                                    sceneTC, sceneGlobe, sceneMoll) {
  if (!overlay) return;
  overlay.update(starArray, sceneTC, sceneGlobe, sceneMoll);
}
