// /filters/isolationFilter.js
// This module implements the Isolation Filter using a uniform grid (formerly the low density filter).
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { getDoubleSidedLabelMaterial, getBlueColor, lightenColor } from './densityColorUtils.js';
import { radToSphere, getGreatCirclePoints, cachedRadToMollweide, getMollweideLambda0, splitMollweideWrap, vectorToRaDecRad, radToMollweide } from '../utils/geometryUtils.js';
import { minimalRADifference } from '../utils.js';
import { loadConstellationCenters, getConstellationCenters, loadConstellationBoundaries, getConstellationBoundaries } from './constellationFilter.js';

// IsolationGridOverlay encapsulates the uniform grid logic for the Isolation Filter.
class IsolationGridOverlay {
  /**
   * @param {number} minDistance - Minimum distance (LY) for cells.
   * @param {number} maxDistance - Maximum distance (LY) for cells.
   * @param {number} gridSize - The size (in LY) of each cell.
   */
  constructor(minDistance, maxDistance, gridSize = 2) {
    this.minDistance = parseFloat(minDistance);
    this.maxDistance = parseFloat(maxDistance);
    this.gridSize = gridSize;
    this.cubesData = [];
    this.adjacentLines = [];
    this.triangleMeshes = [];
    this.regionClusters = [];
    this.regionLabelsGroupTC = new THREE.Group();
    this.regionLabelsGroupGlobe = new THREE.Group();
    this.regionLabelsGroupMoll = new THREE.Group();
    this.lineColor = 0x0000ff;
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
          // Only include cells within the specified distance range.
          if (distFromCenter < this.minDistance || distFromCenter > this.maxDistance) continue;
          
          // Create the True Coordinates mesh (cube)
          const geometry = new THREE.BoxGeometry(this.gridSize, this.gridSize, this.gridSize);
          const material = new THREE.MeshBasicMaterial({
            color: 0x0000ff, // Blue color for Isolation Filter
            transparent: true,
            opacity: 1.0,
            depthWrite: false
          });
          const cubeTC = new THREE.Mesh(geometry, material);
          cubeTC.position.copy(posTC);

          const planeGeom = new THREE.PlaneGeometry(this.gridSize, this.gridSize);
          const planeMat = material.clone();
          planeMat.side = THREE.DoubleSide;
          const squareGlobe = new THREE.Mesh(planeGeom, planeMat.clone());
          const squareMoll = new THREE.Mesh(planeGeom.clone(), planeMat.clone());
          let projectedPos;
          let ra, dec;
          if (distFromCenter < 1e-6) {
            projectedPos = new THREE.Vector3(0, 0, 0);
            squareMoll.position.set(0, 0, 0);
            ra = 0; dec = 0;
          } else {
            ra = Math.atan2(-posTC.z, -posTC.x);
            dec = Math.asin(posTC.y / distFromCenter);
            const radius = 100;
            projectedPos = new THREE.Vector3(
              -radius * Math.cos(dec) * Math.cos(ra),
               radius * Math.sin(dec),
              -radius * Math.cos(dec) * Math.sin(ra)
            );
            const projMoll = cachedRadToMollweide(ra, dec, 100, getMollweideLambda0());
            squareMoll.position.copy(projMoll);
          }
          let theta = dec;
          for (let i = 0; i < 10; i++) {
            const delta = (2 * theta + Math.sin(2 * theta) - Math.PI * Math.sin(dec)) /
              (2 + 2 * Math.cos(2 * theta));
            theta -= delta;
            if (Math.abs(delta) < 1e-10) break;
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
            mollweideMesh: squareMoll,
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
            mollY: mollY
          };

          cell.id = this.cubesData.length;
          this.cubesData.push(cell);
        }
      }
    }
    // Compute distances using an extended star set.
    const extendedStars = stars.filter(star => {
      const d = star.Distance_from_the_Sun;
      return d >= Math.max(0, this.minDistance - 10) && d <= this.maxDistance + 10;
    });
    this.cubesData.forEach(cell => {
      computeCellDistances(cell, extendedStars);
    });
    this.computeAdjacentLines();
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
          const colors = [];
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
          const geomM = new THREE.BufferGeometry().setFromPoints(pointsM);
          const c1 = cell.tcMesh.material.color; // use cube color
          const c2 = neighbor.tcMesh.material.color;
          for (let i = 0; i < points.length; i++) {
            positions.push(points[i].x, points[i].y, points[i].z);
            let t = i / (points.length - 1);
            colors.push(
              THREE.MathUtils.lerp(c1.r, c2.r, t),
              THREE.MathUtils.lerp(c1.g, c2.g, t),
              THREE.MathUtils.lerp(c1.b, c2.b, t)
            );
          }
          const geom = new THREE.BufferGeometry();
          geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
          const mat = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.3,
            linewidth: 2
          });
          const line = new THREE.Line(geom, mat);
          line.renderOrder = 1;
          const mollMat = new THREE.LineBasicMaterial({
            color: 0x0000ff,
            transparent: true,
            opacity: 0.9,
            linewidth: 5
          });
        const lineM = new THREE.LineSegments(geomM, mollMat);
        this.adjacentLines.push({ line, lineM, cell1: cell, cell2: neighbor });
      }
    });
  });

    this.computeTriangles();
  }

  computeTriangles() {
    this.triangleMeshes = [];
    const neighbors = new Map();
    this.adjacentLines.forEach(obj => {
      const a = obj.cell1.id;
      const b = obj.cell2.id;
      if (!neighbors.has(a)) neighbors.set(a, new Set());
      if (!neighbors.has(b)) neighbors.set(b, new Set());
      neighbors.get(a).add(b);
      neighbors.get(b).add(a);
    });

    const cells = this.cubesData;
    for (let i = 0; i < cells.length; i++) {
      const ni = neighbors.get(cells[i].id);
      if (!ni) continue;
      ni.forEach(jId => {
        if (jId <= cells[i].id) return;
        const nj = neighbors.get(jId);
        if (!nj) return;
        ni.forEach(kId => {
          if (kId <= jId) return;
          if (nj.has(kId) && neighbors.get(kId)?.has(cells[i].id)) {
            const c1 = cells[i];
            const c2 = cells.find(c => c.id === jId);
            const c3 = cells.find(c => c.id === kId);
            const vertsG = [c1.globeMesh.position, c2.globeMesh.position, c3.globeMesh.position];
            const gPos = [];
            vertsG.forEach(v => { gPos.push(v.x, v.y, v.z); });
            const geomG = new THREE.BufferGeometry();
            geomG.setAttribute('position', new THREE.Float32BufferAttribute(gPos,3));
            geomG.setIndex([0,1,2]);
            geomG.computeVertexNormals();
            const matG = new THREE.MeshBasicMaterial({ color: this.lineColor, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
            const meshG = new THREE.Mesh(geomG, matG);

            const vertsM = [c1.mollweideMesh.position, c2.mollweideMesh.position, c3.mollweideMesh.position];
            const mPos = [];
            vertsM.forEach(v => { mPos.push(v.x, v.y, 0); });
            const geomM = new THREE.BufferGeometry();
            geomM.setAttribute('position', new THREE.Float32BufferAttribute(mPos,3));
            geomM.setIndex([0,1,2]);
            geomM.computeVertexNormals();
            const matM = new THREE.MeshBasicMaterial({ color: this.lineColor, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
            const meshM = new THREE.Mesh(geomM, matM);
            this.triangleMeshes.push({ meshG, meshM, cell1: c1, cell2: c2, cell3: c3 });
          }
        });
      });
    }
  }

  // Updated update() method now accepts sceneTC, sceneGlobe, and sceneMoll to re-add new meshes.
  update(stars, sceneTC, sceneGlobe, sceneMoll) {
    // Safely obtain slider values: if not found, use defaults.
    const isolationSlider = document.getElementById('isolation-slider');
    const toleranceSlider = document.getElementById('isolation-tolerance-slider');
    const isolationVal = isolationSlider ? parseFloat(isolationSlider.value) : 7;
    const toleranceVal = toleranceSlider ? parseInt(toleranceSlider.value) : 0;

    // Recalculate distances for each cell based on an extended set of stars.
    const extendedStars = stars.filter(star => {
      const d = star.Distance_from_the_Sun;
      return d >= Math.max(0, this.minDistance - 10) && d <= this.maxDistance + 10;
    });
    this.cubesData.forEach(cell => {
      computeCellDistances(cell, extendedStars);
    });

    // Update each cell's active state based on the isolation criteria.
    this.cubesData.forEach(cell => {
      let isoDist = Infinity;
      if (cell.distances && cell.distances.length > toleranceVal) {
        isoDist = cell.distances[toleranceVal];
      }
      // Show cell if the distance to the Nth nearest star is at least the isolation threshold.
      cell.active = (isoDist >= isolationVal);
      let ratio = cell.tcPos.length() / this.maxDistance;
      if (ratio > 1) ratio = 1;
      const alpha = THREE.MathUtils.lerp(0.1, 0.3, ratio);
      // Update TrueCoordinates cube
      cell.tcMesh.visible = cell.active;
      cell.tcMesh.material.opacity = alpha;
      // For the globe projection, we only update its position and scale.
      cell.globeMesh.visible = cell.active;
      const scale = THREE.MathUtils.lerp(20.0, 0.1, ratio);
      cell.globeMesh.scale.set(scale, scale, 1);
      cell.mollweideMesh.visible = cell.active;
      cell.mollweideMesh.scale.set(scale, scale, 1);
      const lambda = minimalRADifference(cell.raRad - getMollweideLambda0());
      cell.mollweideMesh.position.set(
        cell.mollXFactor * lambda,
        cell.mollY,
        0
      );
    });

    // Update the adjacent lines.
    this.adjacentLines.forEach(obj => {
      const { line, lineM, cell1, cell2 } = obj;
      if (cell1.globeMesh.visible && cell2.globeMesh.visible) {
        const points = getGreatCirclePoints(cell1.globeMesh.position, cell2.globeMesh.position, 100, 16);
        const positions = [];
        const colors = [];
        const mollPoints = getGreatCirclePoints(cell1.globeMesh.position,
          cell2.globeMesh.position, 100, 16).map(v => {
            const { ra, dec } = vectorToRaDecRad(v, 100);
            return radToMollweide(ra, dec, 100, getMollweideLambda0());
          });
        const ptsM = [];
        for (let mi = 0; mi < mollPoints.length - 1; mi++) {
          const segs = splitMollweideWrap(mollPoints[mi], mollPoints[mi + 1]);
          segs.forEach(([s,e]) => { ptsM.push(s, e); });
        }
        const c1 = cell1.tcMesh.material.color;
        const c2 = cell2.tcMesh.material.color;
        for (let i = 0; i < points.length; i++) {
          positions.push(points[i].x, points[i].y, points[i].z);
          let t = i / (points.length - 1);
          colors.push(
            THREE.MathUtils.lerp(c1.r, c2.r, t),
            THREE.MathUtils.lerp(c1.g, c2.g, t),
            THREE.MathUtils.lerp(c1.b, c2.b, t)
          );
        }
        line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        line.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        line.geometry.attributes.position.needsUpdate = true;
        line.geometry.attributes.color.needsUpdate = true;
        const avgScale = (cell1.globeMesh.scale.x + cell2.globeMesh.scale.x) / 2;
        line.material.linewidth = avgScale;
        line.visible = true;
        lineM.geometry.setFromPoints(ptsM);
        lineM.visible = true;
      } else {
        line.visible = false;
        lineM.visible = false;
      }
    });

    this.triangleMeshes.forEach(obj => {
      const { meshG, meshM, cell1, cell2, cell3 } = obj;
      const visible = cell1.active && cell2.active && cell3.active;
      meshG.visible = visible;
      meshM.visible = visible;
      if (visible) {
        const gPos = [cell1.globeMesh.position, cell2.globeMesh.position, cell3.globeMesh.position]
          .flatMap(v => [v.x, v.y, v.z]);
        meshG.geometry.setAttribute('position', new THREE.Float32BufferAttribute(gPos,3));
        meshG.geometry.attributes.position.needsUpdate = true;
        const mPos = [cell1.mollweideMesh.position, cell2.mollweideMesh.position, cell3.mollweideMesh.position]
          .flatMap(v => [v.x, v.y, 0]);
        meshM.geometry.setAttribute('position', new THREE.Float32BufferAttribute(mPos,3));
        meshM.geometry.attributes.position.needsUpdate = true;
      }
    });

    // Re‑add the updated meshes to the scenes. Only the cubes are shown for
    // True Coordinates, while the Globe and Mollweide maps display just the
    // connecting lines.
    if (sceneTC) {
      this.cubesData.forEach(cell => {
        sceneTC.add(cell.tcMesh);
      });
    }
    if (sceneGlobe) {
      this.adjacentLines.forEach(obj => {
        sceneGlobe.add(obj.line);
      });
      this.triangleMeshes.forEach(obj => {
        sceneGlobe.add(obj.meshG);
      });
    }
    if (sceneMoll) {
      this.adjacentLines.forEach(obj => {
        sceneMoll.add(obj.lineM);
      });
      this.triangleMeshes.forEach(obj => {
        sceneMoll.add(obj.meshM);
      });
    }
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
      obj.lineM.geometry.setFromPoints(pts);
    });

    this.triangleMeshes.forEach(obj => {
      const verts = [obj.cell1.globeMesh.position, obj.cell2.globeMesh.position, obj.cell3.globeMesh.position]
        .map(v => {
          const { ra, dec } = vectorToRaDecRad(v, 100);
          return radToMollweide(ra, dec, 100, lambda0);
        });
      const pos = verts.flatMap(v => [v.x, v.y, 0]);
      obj.meshM.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos,3));
      obj.meshM.geometry.attributes.position.needsUpdate = true;
    });
  }

  async assignConstellationsToCells() {
    await loadConstellationCenters();
    await loadConstellationBoundaries();
    const centers = getConstellationCenters();
    const boundaries = getConstellationBoundaries();
    if (!boundaries.length) {
      console.warn("No constellation boundaries available!");
      return;
    }
    function minAngularDistanceToSegment(cellPos, p1, p2) {
      const angleToP1 = cellPos.angleTo(p1);
      const angleToP2 = cellPos.angleTo(p2);
      const arcAngle = p1.angleTo(p2);
      const perpAngle = Math.asin(Math.abs(cellPos.clone().normalize().dot(p1.clone().cross(p2).normalize())));
      if (angleToP1 + angleToP2 - arcAngle < 1e-3) {
        return THREE.Math.radToDeg(perpAngle);
      } else {
        return THREE.Math.radToDeg(Math.min(angleToP1, angleToP2));
      }
    }
    function vectorToRaDec(cellPos) {
      const R = 100;
      const dec = Math.asin(cellPos.y / R);
      let ra = Math.atan2(-cellPos.z, -cellPos.x);
      let raDeg = ra * 180 / Math.PI;
      if (raDeg < 0) raDeg += 360;
      return { ra: raDeg, dec: dec * 180 / Math.PI };
    }
    // Assumes loadConstellationFullNames is available.
    const namesMapping = await loadConstellationFullNames();
    
    this.cubesData.forEach(cell => {
      if (!cell.active) return;
      const cellPos = cell.globeMesh.position.clone();
      let nearestBoundary = null;
      let minBoundaryDist = Infinity;
      boundaries.forEach(boundary => {
         const p1 = radToSphere(boundary.ra1, boundary.dec1, 100);
         const p2 = radToSphere(boundary.ra2, boundary.dec2, 100);
         const angDist = minAngularDistanceToSegment(cellPos, p1, p2);
         if (angDist < minBoundaryDist) {
           minBoundaryDist = angDist;
           nearestBoundary = boundary;
         }
      });
      if (!nearestBoundary) {
        cell.constellation = "Unknown";
        return;
      }
      const abbr1 = nearestBoundary.const1.toUpperCase();
      const abbr2 = nearestBoundary.const2 ? nearestBoundary.const2.toUpperCase() : null;
      const fullName1 = namesMapping[abbr1] || toTitleCase(abbr1);
      const fullName2 = abbr2 ? (namesMapping[abbr2] || toTitleCase(abbr2)) : null;
      
      const bp1 = radToSphere(nearestBoundary.ra1, nearestBoundary.dec1, 100);
      const bp2 = radToSphere(nearestBoundary.ra2, nearestBoundary.dec2, 100);
      let normal = bp1.clone().cross(bp2).normalize();
      const center1 = centers.find(c => {
        const nameUp = c.name.toUpperCase();
        return nameUp === abbr1 || nameUp === fullName1.toUpperCase();
      });
      let center1Pos = center1 ? radToSphere(center1.ra, center1.dec, 100) : null;
      if (center1Pos && normal.dot(center1Pos) < 0) {
        normal.negate();
      }
      const cellSide = normal.dot(cellPos);
      if (cellSide >= 0) {
        cell.constellation = toTitleCase(fullName1);
      } else if (fullName2) {
        cell.constellation = toTitleCase(fullName2);
      } else {
        const { ra: cellRA, dec: cellDec } = vectorToRaDec(cellPos);
        let bestConstellation = "Unknown";
        let minAngle = Infinity;
        centers.forEach(center => {
          const centerRAdeg = THREE.Math.radToDeg(center.ra);
          const centerDecdeg = THREE.Math.radToDeg(center.dec);
          const cosDelta = Math.sin(THREE.Math.degToRad(cellDec)) * Math.sin(THREE.Math.degToRad(centerDecdeg)) +
                           Math.cos(THREE.Math.degToRad(cellDec)) * Math.cos(THREE.Math.degToRad(centerDecdeg)) *
                           Math.cos(THREE.Math.degToRad(cellRA - centerRAdeg));
          const dist = Math.acos(THREE.MathUtils.clamp(cosDelta, -1, 1));
          if (dist < minAngle) {
            minAngle = dist;
            bestConstellation = toTitleCase(center.name);
          }
        });
        cell.constellation = bestConstellation;
      }
    });
  }
}

// Helper function to compute cell distances for the uniform grid.
function computeCellDistances(cell, stars) {
  const dArr = stars.map(star => {
    let starPos = star.truePosition ? star.truePosition : new THREE.Vector3(star.x_coordinate, star.y_coordinate, star.z_coordinate);
    const dx = cell.tcPos.x - starPos.x;
    const dy = cell.tcPos.y - starPos.y;
    const dz = cell.tcPos.z - starPos.z;
    return { distance: Math.sqrt(dx * dx + dy * dy + dz * dz), star };
  });
  dArr.sort((a, b) => a.distance - b.distance);
  cell.distances = dArr.map(obj => obj.distance);
  cell.nearestStar = dArr.length > 0 ? dArr[0].star : null;
}

// Helper: Convert string to Title Case.
function toTitleCase(str) {
  if (!str || typeof str !== "string") return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Exported functions for external use.
export function initIsolationFilter(minDistance, maxDistance, starArray, gridSize = 2) {
  const overlay = new IsolationGridOverlay(minDistance, maxDistance, gridSize);
  overlay.createGrid(starArray);
  return overlay;
}

export function updateIsolationFilter(starArray, overlay, sceneTC, sceneGlobe, sceneMoll) {
  if (!overlay) return;
  overlay.update(starArray, sceneTC, sceneGlobe, sceneMoll);
}

