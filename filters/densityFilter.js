import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { getGreatCirclePoints, cachedRadToMollweide, getMollweideLambda0, splitMollweideWrap, vectorToRaDecRad, radToMollweide } from '../utils/geometryUtils.js';
import { minimalRADifference } from '../utils.js';

class DensityGridOverlay {
  constructor(minDistance, maxDistance, gridSize = 2) {
    this.minDistance = parseFloat(minDistance);
    this.maxDistance = parseFloat(maxDistance);
    this.gridSize = gridSize;
    this.cubesData = [];
    this.adjacentLines = [];
    this.maxDensity = 0;
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
            mollY: mollY,
            density: 0
          };
          cell.id = this.cubesData.length;
          this.cubesData.push(cell);
        }
      }
    }

    this.computeAdjacentLines();
  }

  computeCellDensity(cell, stars, radius = 10, tolerance = 0) {
    const dArr = stars.map(star => {
      const starPos = star.truePosition ? star.truePosition : new THREE.Vector3(star.x_coordinate, star.y_coordinate, star.z_coordinate);
      return cell.tcPos.distanceTo(starPos);
    });
    dArr.sort((a, b) => a - b);
    let sum = 0;
    for (let i = tolerance; i < dArr.length; i++) {
      const d = dArr[i];
      if (d > radius) continue;
      const weight = 1 - d / radius;
      sum += weight;
    }
    cell.density = sum;
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
          for (let i = 0; i < points.length; i++) {
            positions.push(points[i].x, points[i].y, points[i].z);
            colors.push(1, 0, 0);
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
            color: 0xff0000,
            transparent: true,
            opacity: 0.9,
            linewidth: 5
          });
          const lineM = new THREE.LineSegments(geomM, mollMat);
          this.adjacentLines.push({ line, lineM, cell1: cell, cell2: neighbor });
        }
      });
    });
  }

  update(stars, sceneTC, sceneGlobe, sceneMoll) {
    const radiusSlider = document.getElementById('density-slider');
    const tolSlider = document.getElementById('density-tolerance-slider');
    const radius = radiusSlider ? parseFloat(radiusSlider.value) : 10;
    const tolerance = tolSlider ? parseInt(tolSlider.value) : 0;

    const extendedStars = stars.filter(star => {
      const d = star.Distance_from_the_Sun;
      return d >= Math.max(0, this.minDistance - 10) && d <= this.maxDistance + 10;
    });

    this.cubesData.forEach(cell => {
      this.computeCellDensity(cell, extendedStars, radius, tolerance);
    });

    this.maxDensity = this.cubesData.reduce((m, c) => Math.max(m, c.density), 0);

    this.cubesData.forEach(cell => {
      const pct = this.maxDensity > 0 ? cell.density / this.maxDensity : 0;
      const ratio = cell.tcPos.length() / this.maxDistance;
      const scale = THREE.MathUtils.lerp(20.0, 0.1, Math.min(1, ratio));
      cell.active = pct >= 0.25;
      const alpha = 0.5 * pct;
      cell.tcMesh.material.opacity = alpha;
      cell.globeMesh.material.opacity = alpha;
      cell.mollweideMesh.material.opacity = alpha;
      cell.tcMesh.visible = cell.active;
      cell.globeMesh.scale.set(scale, scale, 1);
      cell.mollweideMesh.scale.set(scale, scale, 1);
    });
    // Hide connection lines and rely on square meshes to depict the surface
    this.adjacentLines.forEach(obj => {
      obj.line.visible = false;
      obj.lineM.visible = false;
    });
    if (sceneTC) {
      this.cubesData.forEach(c => { sceneTC.add(c.tcMesh); });
    }
    if (sceneGlobe) {
      this.cubesData.forEach(cell => { sceneGlobe.add(cell.globeMesh); });
    }
    if (sceneMoll) {
      this.cubesData.forEach(cell => { sceneMoll.add(cell.mollweideMesh); });
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
      obj.line.visible = false;
      obj.lineM.visible = false;
    });
  }
}

export function initDensityFilter(minDistance, maxDistance, starArray, gridSize = 2) {
  const overlay = new DensityGridOverlay(minDistance, maxDistance, gridSize);
  overlay.createGrid(starArray);
  return overlay;
}

export function updateDensityFilter(starArray, overlay, sceneTC, sceneGlobe, sceneMoll) {
  if (!overlay) return;
  overlay.update(starArray, sceneTC, sceneGlobe, sceneMoll);
}
