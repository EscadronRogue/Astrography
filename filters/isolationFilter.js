// /filters/isolationFilter.js
// This module implements the Isolation Filter using a uniform grid.
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { getDoubleSidedLabelMaterial, getBlueColor, lightenColor } from './densityColorUtils.js';
import { radToSphere, getGreatCirclePoints } from '../utils/geometryUtils.js';
import { loadConstellationCenters, getConstellationCenters, loadConstellationBoundaries, getConstellationBoundaries } from './constellationFilter.js';

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

          // Create the TrueCoordinates cell (a cube)
          const geometry = new THREE.BoxGeometry(this.gridSize, this.gridSize, this.gridSize);
          const material = new THREE.MeshBasicMaterial({
            color: 0x0000ff,
            transparent: true,
            opacity: 1.0,
            depthWrite: false
          });
          const cubeTC = new THREE.Mesh(geometry, material);
          cubeTC.position.copy(posTC);

          // Compute projected position on the globe.
          let projectedPos;
          if (distFromCenter < 1e-6) {
            projectedPos = new THREE.Vector3(0, 0, 0);
          } else {
            const ra = Math.atan2(-posTC.z, -posTC.x);
            const dec = Math.asin(posTC.y / distFromCenter);
            const radius = 100;
            projectedPos = new THREE.Vector3(
              -radius * Math.cos(dec) * Math.cos(ra),
               radius * Math.sin(dec),
              -radius * Math.cos(dec) * Math.sin(ra)
            );
          }
          // Instead of creating a square mesh, create an empty Object3D to hold the position.
          const globeHolder = new THREE.Object3D();
          globeHolder.position.copy(projectedPos);
          // (No geometry or material is assigned, so nothing will be rendered.)

          const cell = {
            tcMesh: cubeTC,
            globeMesh: globeHolder, // holds projected position for connecting lines
            tcPos: posTC,
            grid: {
              ix: Math.round(x / this.gridSize),
              iy: Math.round(y / this.gridSize),
              iz: Math.round(z / this.gridSize)
            },
            active: false
          };

          const cellRa = ((posTC.x + halfExt) / (2 * halfExt)) * 360;
          const cellDec = ((posTC.y + halfExt) / (2 * halfExt)) * 180 - 90;
          cell.ra = cellRa;
          cell.dec = cellDec;
          cell.id = this.cubesData.length;
          this.cubesData.push(cell);
        }
      }
    }
    // Compute distances using an extended set of stars.
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
          // We'll derive colors from the TrueCoordinates cell material.
          const c1 = cell.tcMesh.material.color;
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
            linewidth: 1
          });
          const line = new THREE.Line(geom, mat);
          line.renderOrder = 1;
          this.adjacentLines.push({ line, cell1: cell, cell2: neighbor });
        }
      });
    });
  }

  // Updated update() method: update true-coordinate mesh and connecting lines.
  update(stars, sceneTC, sceneGlobe) {
    const isolationSlider = document.getElementById('isolation-slider');
    const toleranceSlider = document.getElementById('isolation-tolerance-slider');
    const isolationVal = isolationSlider ? parseFloat(isolationSlider.value) : 7;
    const toleranceVal = toleranceSlider ? parseInt(toleranceSlider.value) : 0;

    const extendedStars = stars.filter(star => {
      const d = star.Distance_from_the_Sun;
      return d >= Math.max(0, this.minDistance - 10) && d <= this.maxDistance + 10;
    });
    this.cubesData.forEach(cell => {
      computeCellDistances(cell, extendedStars);
    });

    // Update cell active state and compute a derived color (for connecting lines)
    this.cubesData.forEach(cell => {
      let isoDist = Infinity;
      if (cell.distances && cell.distances.length > toleranceVal) {
        isoDist = cell.distances[toleranceVal];
      }
      cell.active = (isoDist >= isolationVal);
      let ratio = cell.tcPos.length() / this.maxDistance;
      if (ratio > 1) ratio = 1;
      const alpha = THREE.MathUtils.lerp(0.1, 0.3, ratio);
      // Update the TrueCoordinates cell.
      cell.tcMesh.visible = cell.active;
      cell.tcMesh.material.opacity = alpha;
      // Compute and store a color value for the globe (without displaying a square).
      cell.globeColor = new THREE.Color().setHSL(120 / 360, 0.7, THREE.MathUtils.lerp(0.8, 0.4, ratio));
      // The globeMesh remains an empty holder with its position fixed.
    });

    this.computeAdjacentLines();
    this.adjacentLines.forEach(obj => {
      const { line, cell1, cell2 } = obj;
      if (cell1.active && cell2.active) {
        const points = getGreatCirclePoints(cell1.globeMesh.position, cell2.globeMesh.position, 100, 16);
        const positions = [];
        const colors = [];
        for (let i = 0; i < points.length; i++) {
          positions.push(points[i].x, points[i].y, points[i].z);
          let t = i / (points.length - 1);
          let r = THREE.MathUtils.lerp(cell1.globeColor.r, cell2.globeColor.r, t);
          let g = THREE.MathUtils.lerp(cell1.globeColor.g, cell2.globeColor.g, t);
          let b = THREE.MathUtils.lerp(cell1.globeColor.b, cell2.globeColor.b, t);
          colors.push(r, g, b);
        }
        line.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        line.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        line.geometry.attributes.position.needsUpdate = true;
        line.geometry.attributes.color.needsUpdate = true;
        line.material.linewidth = 1;
        line.visible = true;
      } else {
        line.visible = false;
      }
    });

    if (sceneTC && sceneGlobe) {
      this.cubesData.forEach(cell => {
        sceneTC.add(cell.tcMesh);
        // Do NOT add cell.globeMesh to the scene so that no square is rendered.
      });
      this.adjacentLines.forEach(obj => {
        sceneGlobe.add(obj.line);
      });
    }
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
      const cellSide = normal.dot(cell.globeMesh.position);
      if (cellSide >= 0) {
        cell.constellation = toTitleCase(fullName1);
      } else if (fullName2) {
        cell.constellation = toTitleCase(fullName2);
      } else {
        const { ra: cellRA, dec: cellDec } = vectorToRaDec(cell.globeMesh.position);
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

function toTitleCase(str) {
  if (!str || typeof str !== "string") return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function initIsolationFilter(minDistance, maxDistance, starArray, gridSize = 2) {
  const overlay = new IsolationGridOverlay(minDistance, maxDistance, gridSize);
  overlay.createGrid(starArray);
  return overlay;
}

export function updateIsolationFilter(starArray, overlay, sceneTC, sceneGlobe) {
  if (!overlay) return;
  overlay.update(starArray, sceneTC, sceneGlobe);
}

export { scGenerate as generateStellarClassFilters };
