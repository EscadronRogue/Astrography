import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { getGreatCirclePoints, cachedRadToMollweide, getMollweideLambda0, splitMollweideWrap, vectorToRaDecRad, radToMollweide, adjustMollweideWrap } from '../utils/geometryUtils.js';
import { minimalRADifference } from '../utils.js';

class DensityGridOverlay {
  constructor(minDistance, maxDistance, gridSize = 2) {
    this.minDistance = parseFloat(minDistance);
    this.maxDistance = parseFloat(maxDistance);
    this.gridSize = gridSize;
    this.cubesData = [];
    this.adjacentLines = [];
    this.triangleMeshes = [];
    this.maxDensity = 0;
    this.lineColor = 0xff0000;
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

            const vertsM = [
              radToMollweide(c1.raRad, c1.decRad, 100, getMollweideLambda0()),
              radToMollweide(c2.raRad, c2.decRad, 100, getMollweideLambda0()),
              radToMollweide(c3.raRad, c3.decRad, 100, getMollweideLambda0())
            ];
            const mPos = [];
            vertsM.forEach((v, idx) => {
              if (idx > 0) {
                const [adj] = adjustMollweideWrap(v, vertsM[idx - 1]);
                v = adj;
                vertsM[idx] = v;
              }
              mPos.push(v.x, v.y, 0);
            });
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
    this.adjacentLines.forEach(obj => {
      const { line, lineM, cell1, cell2 } = obj;
      line.visible = cell1.active && cell2.active;
      lineM.visible = cell1.active && cell2.active;
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
        const vertsM = [
          radToMollweide(cell1.raRad, cell1.decRad, 100, getMollweideLambda0()),
          radToMollweide(cell2.raRad, cell2.decRad, 100, getMollweideLambda0()),
          radToMollweide(cell3.raRad, cell3.decRad, 100, getMollweideLambda0())
        ];
        const mPos = [];
        vertsM.forEach((v, idx) => {
          if (idx > 0) {
            const [adj] = adjustMollweideWrap(v, vertsM[idx - 1]);
            v = adj;
            vertsM[idx] = v;
          }
          mPos.push(v.x, v.y, 0);
        });
        meshM.geometry.setAttribute('position', new THREE.Float32BufferAttribute(mPos,3));
        meshM.geometry.attributes.position.needsUpdate = true;
      }
    });
    if (sceneTC) {
      this.cubesData.forEach(c => { sceneTC.add(c.tcMesh); });
    }
    if (sceneGlobe) {
      this.adjacentLines.forEach(o => { sceneGlobe.add(o.line); });
      this.triangleMeshes.forEach(o => { sceneGlobe.add(o.meshG); });
    }
    if (sceneMoll) {
      this.adjacentLines.forEach(o => { sceneMoll.add(o.lineM); });
      this.triangleMeshes.forEach(o => { sceneMoll.add(o.meshM); });
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
      const verts = [
        radToMollweide(obj.cell1.raRad, obj.cell1.decRad, 100, lambda0),
        radToMollweide(obj.cell2.raRad, obj.cell2.decRad, 100, lambda0),
        radToMollweide(obj.cell3.raRad, obj.cell3.decRad, 100, lambda0)
      ];
      const mPos = [];
      verts.forEach((v, idx) => {
        if (idx > 0) {
          const [adj] = adjustMollweideWrap(v, verts[idx - 1]);
          v = adj;
          verts[idx] = v;
        }
        mPos.push(v.x, v.y, 0);
      });
      obj.meshM.geometry.setAttribute('position', new THREE.Float32BufferAttribute(mPos,3));
      obj.meshM.geometry.attributes.position.needsUpdate = true;
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
