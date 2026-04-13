// /filters/isolationFilter.js
// This module implements the Isolation Filter using a uniform grid (formerly the low density filter).
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { getDoubleSidedLabelMaterial, getBlueColor, lightenColor } from './densityColorUtils.js';
import { radToSphere, getGreatCirclePoints, cachedRadToMollweide, getMollweideLambda0, splitMollweideWrap, vectorToRaDecRad, radToMollweide } from '../utils/geometryUtils.js';
import { minimalRADifference } from '../utils.js';
import { loadConstellationCenters, getConstellationCenters, loadConstellationBoundaries, getConstellationBoundaries } from './constellationFilter.js';

// Helper to create line materials that support color and opacity gradients.
function createGradientLineMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    vertexColors: true,
    uniforms: {},
    vertexShader: `
      attribute float alpha;
      varying vec4 vColor;
      void main() {
        vColor = vec4(color, alpha);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec4 vColor;
      void main() {
        gl_FragColor = vColor;
      }
    `
  });
}

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
    this.regionClusters = [];
    this.regionLabelsGroupTC = new THREE.Group();
    this.regionLabelsGroupGlobe = new THREE.Group();
    this.regionLabelsGroupMoll = new THREE.Group();
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
          const alphas = [];
          const mollPts = getGreatCirclePoints(cell.globeMesh.position,
            neighbor.globeMesh.position, 100, 16).map(v => {
              const { ra, dec } = vectorToRaDecRad(v, 100);
              return radToMollweide(ra, dec, 100, getMollweideLambda0());
            });
          const pointsM = [];
          const alphasM = [];
          for (let m = 0; m < mollPts.length - 1; m++) {
            const segsM = splitMollweideWrap(mollPts[m], mollPts[m + 1]);
            segsM.forEach(([s,e]) => { pointsM.push(s, e); });
          }
          const c1 = cell.tcMesh.material.color; // use cube color
          const c2 = neighbor.tcMesh.material.color;
          const colorsM = [];
          for (let i = 0; i < pointsM.length; i++) {
            const t = i / (pointsM.length - 1);
            colorsM.push(
              THREE.MathUtils.lerp(c1.r, c2.r, t),
              THREE.MathUtils.lerp(c1.g, c2.g, t),
              THREE.MathUtils.lerp(c1.b, c2.b, t)
            );
            alphasM.push(
              THREE.MathUtils.lerp(cell.tcMesh.material.opacity, neighbor.tcMesh.material.opacity, t)
            );
          }
          const geomM = new THREE.BufferGeometry();
          geomM.setAttribute('position', new THREE.Float32BufferAttribute(pointsM.flatMap(p=>[p.x,p.y,p.z]), 3));
          geomM.setAttribute('color', new THREE.Float32BufferAttribute(colorsM,3));
          geomM.setAttribute('alpha', new THREE.Float32BufferAttribute(alphasM,1));
          for (let i = 0; i < points.length; i++) {
            positions.push(points[i].x, points[i].y, points[i].z);
            const t = i / (points.length - 1);
            colors.push(
              THREE.MathUtils.lerp(c1.r, c2.r, t),
              THREE.MathUtils.lerp(c1.g, c2.g, t),
              THREE.MathUtils.lerp(c1.b, c2.b, t)
            );
            alphas.push(
              THREE.MathUtils.lerp(cell.tcMesh.material.opacity, neighbor.tcMesh.material.opacity, t)
            );
          }
          const geom = new THREE.BufferGeometry();
          geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
          geom.setAttribute('alpha', new THREE.Float32BufferAttribute(alphas,1));

          const mat = createGradientLineMaterial();
          const line = new THREE.Line(geom, mat);
          line.renderOrder = 2;

          const mollMat = createGradientLineMaterial();
          const lineM = new THREE.LineSegments(geomM, mollMat);
          lineM.renderOrder = 2;
          this.adjacentLines.push({ line, lineM, cell1: cell, cell2: neighbor });
        }
      });
    });
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

    // Compute isolation distances and min/max for color/opacity scaling
    const isoDistances = [];
    this.cubesData.forEach(cell => {
      let isoDist = Infinity;
      if (cell.distances && cell.distances.length > toleranceVal) {
        isoDist = cell.distances[toleranceVal];
      }
      cell.isoDist = isoDist;
      isoDistances.push(isoDist);
    });

    const minIso = Math.min(...isoDistances);
    const maxIso = Math.max(...isoDistances);
    const baseBlue = new THREE.Color(0x0000ff);
    const lightBlue = lightenColor(baseBlue.clone(), 0.4);
    const brightBlue = baseBlue.clone();

    // Update each cell's visual state based on isolation
    this.cubesData.forEach(cell => {
      const isoDist = cell.isoDist;
      const isoRatio = (maxIso === minIso) ? 0 : (isoDist - minIso) / (maxIso - minIso);

      cell.active = (isoDist >= isolationVal);

      const color = lightBlue.clone().lerp(brightBlue, isoRatio);
      const alpha = THREE.MathUtils.lerp(0.1, 0.5, isoRatio);

      cell.tcMesh.visible = cell.active;
      cell.tcMesh.material.opacity = alpha;
      cell.tcMesh.material.color.copy(color);

      const distRatio = Math.min(1, cell.tcPos.length() / this.maxDistance);
      const scale = THREE.MathUtils.lerp(20.0, 0.1, distRatio);

      cell.globeMesh.visible = cell.active;
      cell.globeMesh.material.opacity = alpha;
      cell.globeMesh.material.color.copy(color);
      cell.globeMesh.scale.set(scale, scale, 1);

      cell.mollweideMesh.visible = cell.active;
      cell.mollweideMesh.material.opacity = alpha;
      cell.mollweideMesh.material.color.copy(color);
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
        const alphasLine = [];
        for (let i = 0; i < points.length; i++) {
          positions.push(points[i].x, points[i].y, points[i].z);
          const t = i / (points.length - 1);
          colors.push(
            THREE.MathUtils.lerp(c1.r, c2.r, t),
            THREE.MathUtils.lerp(c1.g, c2.g, t),
            THREE.MathUtils.lerp(c1.b, c2.b, t)
          );
          alphasLine.push(
            THREE.MathUtils.lerp(cell1.tcMesh.material.opacity, cell2.tcMesh.material.opacity, t)
          );
        }
        line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        line.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        line.geometry.setAttribute('alpha', new THREE.Float32BufferAttribute(alphasLine, 1));
        line.geometry.attributes.position.needsUpdate = true;
        line.geometry.attributes.color.needsUpdate = true;
        line.geometry.attributes.alpha.needsUpdate = true;
        const avgScale = (cell1.globeMesh.scale.x + cell2.globeMesh.scale.x) / 2;
        line.material.linewidth = avgScale;
        line.visible = true;
        const flatPtsM = ptsM.flatMap(p=>[p.x,p.y,p.z]);
        const colorsM = [];
        const alphasLineM = [];
        for (let mi = 0; mi < ptsM.length; mi++) {
          const t = mi / (ptsM.length - 1);
          colorsM.push(
            THREE.MathUtils.lerp(c1.r, c2.r, t),
            THREE.MathUtils.lerp(c1.g, c2.g, t),
            THREE.MathUtils.lerp(c1.b, c2.b, t)
          );
          alphasLineM.push(
            THREE.MathUtils.lerp(cell1.tcMesh.material.opacity, cell2.tcMesh.material.opacity, t)
          );
        }
        lineM.geometry.setAttribute('position', new THREE.Float32BufferAttribute(flatPtsM, 3));
        lineM.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorsM, 3));
        lineM.geometry.setAttribute('alpha', new THREE.Float32BufferAttribute(alphasLineM, 1));
        lineM.geometry.attributes.position.needsUpdate = true;
        lineM.geometry.attributes.color.needsUpdate = true;
        lineM.geometry.attributes.alpha.needsUpdate = true;
        lineM.visible = true;
      } else {
        line.visible = false;
        lineM.visible = false;
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
    }
    if (sceneMoll) {
      this.adjacentLines.forEach(obj => {
        sceneMoll.add(obj.lineM);
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
      const flat = pts.flatMap(p=>[p.x,p.y,p.z]);
      const c1 = obj.cell1.tcMesh.material.color;
      const c2 = obj.cell2.tcMesh.material.color;
      const cols = [];
      const alphas = [];
      for (let i = 0; i < pts.length; i++) {
        const t = i / (pts.length - 1);
        cols.push(
          THREE.MathUtils.lerp(c1.r, c2.r, t),
          THREE.MathUtils.lerp(c1.g, c2.g, t),
          THREE.MathUtils.lerp(c1.b, c2.b, t)
        );
        alphas.push(
          THREE.MathUtils.lerp(obj.cell1.tcMesh.material.opacity, obj.cell2.tcMesh.material.opacity, t)
        );
      }
      obj.lineM.geometry.setAttribute('position', new THREE.Float32BufferAttribute(flat,3));
      obj.lineM.geometry.setAttribute('color', new THREE.Float32BufferAttribute(cols,3));
      obj.lineM.geometry.setAttribute('alpha', new THREE.Float32BufferAttribute(alphas,1));
      obj.lineM.geometry.attributes.position.needsUpdate = true;
      obj.lineM.geometry.attributes.color.needsUpdate = true;
      obj.lineM.geometry.attributes.alpha.needsUpdate = true;
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
        return THREE.MathUtils.radToDeg(perpAngle);
      } else {
        return THREE.MathUtils.radToDeg(Math.min(angleToP1, angleToP2));
      }
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
          const centerRAdeg = THREE.MathUtils.radToDeg(center.ra);
          const centerDecdeg = THREE.MathUtils.radToDeg(center.dec);
          const cosDelta = Math.sin(THREE.MathUtils.degToRad(cellDec)) * Math.sin(THREE.MathUtils.degToRad(centerDecdeg)) +
                           Math.cos(THREE.MathUtils.degToRad(cellDec)) * Math.cos(THREE.MathUtils.degToRad(centerDecdeg)) *
                           Math.cos(THREE.MathUtils.degToRad(cellRA - centerRAdeg));
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

