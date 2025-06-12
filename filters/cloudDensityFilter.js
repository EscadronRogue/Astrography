import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { getGreatCirclePoints, cachedRadToMollweide, getMollweideLambda0, splitMollweideWrap } from '../utils/geometryUtils.js';
import { lightenColor } from './densityColorUtils.js';

function createWideLineMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, opacityFactor: { value: 1.0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      attribute float side;
      varying float vSide;
      void main() {
        vSide = side;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 color;
      uniform float opacityFactor;
      varying float vSide;
      void main() {
        float alpha = 0.5 * (1.0 - abs(vSide)) * opacityFactor;
        if(alpha <= 0.0) discard;
        gl_FragColor = vec4(color, alpha);
      }`
  });
}

function buildWideLineGeometry(points, width) {
  const vertices = [];
  const sides = [];
  for (let i = 0; i < points.length; i += 2) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dir = new THREE.Vector2(p2.x - p1.x, p2.y - p1.y).normalize();
    const perp = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(width / 2);
    const a1 = new THREE.Vector3(p1.x + perp.x, p1.y + perp.y, p1.z);
    const a2 = new THREE.Vector3(p1.x - perp.x, p1.y - perp.y, p1.z);
    const b1 = new THREE.Vector3(p2.x + perp.x, p2.y + perp.y, p2.z);
    const b2 = new THREE.Vector3(p2.x - perp.x, p2.y - perp.y, p2.z);
    vertices.push(a1.x, a1.y, a1.z, a2.x, a2.y, a2.z, b2.x, b2.y, b2.z);
    sides.push(1, -1, -1);
    vertices.push(a1.x, a1.y, a1.z, b2.x, b2.y, b2.z, b1.x, b1.y, b1.z);
    sides.push(1, -1, 1);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geom.setAttribute('side', new THREE.Float32BufferAttribute(sides, 1));
  return geom;
}

class CloudDensityGridOverlay {
  constructor(minDistance, maxDistance, gridSize = 2) {
    this.minDistance = parseFloat(minDistance);
    this.maxDistance = parseFloat(maxDistance);
    this.gridSize = gridSize;
    this.cubesData = [];
    this.adjacentLines = [];
    this.mollLineWidth = 30;
    this.opacityFactor = 1.0;
  }

  createGrid() {
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
          const dist = posTC.length();
          if (dist < this.minDistance || dist > this.maxDistance) continue;
          const geometry = new THREE.BoxGeometry(this.gridSize, this.gridSize, this.gridSize);
          const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.0, depthWrite: false });
          const cubeTC = new THREE.Mesh(geometry, material);
          cubeTC.position.copy(posTC);

          const planeGeom = new THREE.PlaneGeometry(this.gridSize, this.gridSize);
          const planeMat = material.clone();
          planeMat.side = THREE.DoubleSide;
          const squareGlobe = new THREE.Mesh(planeGeom, planeMat.clone());
          const squareMoll = new THREE.Mesh(planeGeom.clone(), planeMat.clone());

          let ra = 0, dec = 0;
          if (dist >= 1e-6) {
            ra = Math.atan2(-posTC.z, -posTC.x);
            dec = Math.asin(posTC.y / dist);
            const projM = cachedRadToMollweide(ra, dec, 100, getMollweideLambda0());
            squareMoll.position.copy(projM);
            const R = 100;
            const proj = new THREE.Vector3(
              -R * Math.cos(dec) * Math.cos(ra),
               R * Math.sin(dec),
              -R * Math.cos(dec) * Math.sin(ra)
            );
            squareGlobe.position.copy(proj);
            const nrm = proj.clone().normalize();
            let right = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), nrm);
            if (right.lengthSq() < 1e-6) right.set(1,0,0);
            right.normalize();
            const upVec = new THREE.Vector3().crossVectors(nrm, right).normalize();
            const mat4 = new THREE.Matrix4().makeBasis(right, upVec, nrm);
            squareGlobe.setRotationFromMatrix(mat4);
          }
          let theta = dec;
          for (let i = 0; i < 10; i++) {
            const delta = (2 * theta + Math.sin(2 * theta) - Math.PI * Math.sin(dec)) /(2 + 2 * Math.cos(2 * theta));
            theta -= delta;
            if (Math.abs(delta) < 1e-10) break;
          }
          const cosT = Math.cos(theta);
          const mollXFactor = (2 * 100 / Math.PI) * cosT;
          const mollY = 100 * Math.sin(theta);

          const cell = {
            tcMesh: cubeTC,
            globeMesh: squareGlobe,
            mollweideMesh: squareMoll,
            tcPos: posTC,
            grid: { ix: Math.round(x / this.gridSize), iy: Math.round(y / this.gridSize), iz: Math.round(z / this.gridSize) },
            raRad: ra,
            decRad: dec,
            mollXFactor,
            mollY,
            scores: {}
          };
          cell.id = this.cubesData.length;
          this.cubesData.push(cell);
        }
      }
    }
    this.computeAdjacentLines();
  }

  computeAdjacentLines() {
    this.adjacentLines = [];
    const cellMap = new Map();
    this.cubesData.forEach(cell => {
      const key = `${cell.grid.ix},${cell.grid.iy},${cell.grid.iz}`;
      cellMap.set(key, cell);
    });
    const dirs = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          if (dx > 0 || (dx === 0 && dy > 0) || (dx === 0 && dy === 0 && dz > 0)) dirs.push({dx,dy,dz});
        }
      }
    }
    dirs.forEach(dir => {
      this.cubesData.forEach(cell => {
        const nbKey = `${cell.grid.ix + dir.dx},${cell.grid.iy + dir.dy},${cell.grid.iz + dir.dz}`;
        if (cellMap.has(nbKey)) {
          const neighbor = cellMap.get(nbKey);
          const pts = getGreatCirclePoints(cell.globeMesh.position, neighbor.globeMesh.position, 100, 16);
          const positions = [];
          const mollPts = getGreatCirclePoints(cell.globeMesh.position, neighbor.globeMesh.position, 100, 16).map(v => {
            const raDec = {
              ra: Math.atan2(-v.z, -v.x),
              dec: Math.asin(v.y / 100)
            };
            return cachedRadToMollweide(raDec.ra, raDec.dec, 100, getMollweideLambda0());
          });
          const ptsM = [];
          for (let m = 0; m < mollPts.length - 1; m++) {
            const segs = splitMollweideWrap(mollPts[m], mollPts[m+1]);
            segs.forEach(([s,e]) => { ptsM.push(s,e); });
          }
          const geomM = buildWideLineGeometry(ptsM, this.mollLineWidth);
          for (let i = 0; i < pts.length; i++) positions.push(pts[i].x, pts[i].y, pts[i].z);
          const geom = new THREE.BufferGeometry();
          geom.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
          const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent:true, opacity:0.3, linewidth:2 });
          const line = new THREE.Line(geom, mat); line.renderOrder=1;
          const mollMat = createWideLineMaterial(0xffffff); const lineM=new THREE.Mesh(geomM, mollMat); lineM.renderOrder=1;
          this.adjacentLines.push({ line, lineM, cell1: cell, cell2: neighbor });
        }
      });
    });
  }

  computeCellScores(cell, cloudMap, radius) {
    for (const [name, points] of cloudMap.entries()) {
      let sum = 0;
      points.forEach(p => {
        const d = cell.tcPos.distanceTo(p);
        if (d > radius) return;
        const w = 1 - d / radius;
        sum += w;
      });
      cell.scores[name] = sum;
    }
  }

  update(cloudMap, sceneTC, sceneGlobe, sceneMoll, topPercent, radius, colors) {
    const opacitySlider = document.getElementById('cloud-density-opacity-slider');
    this.opacityFactor = opacitySlider ? parseFloat(opacitySlider.value)/100 : 1.0;
    this.cubesData.forEach(c => this.computeCellScores(c, cloudMap, radius));
    const thresholds = new Map();
    const maxScores = new Map();
    cloudMap.forEach((_, name) => {
      const arr = this.cubesData.map(c => c.scores[name] || 0);
      const sorted = arr.slice().sort((a,b)=>a-b);
      const idx = Math.floor(sorted.length * (1 - topPercent/100));
      thresholds.set(name, sorted[Math.max(idx,0)] || 0);
      maxScores.set(name, sorted[sorted.length-1] || 0);
    });
    this.cubesData.forEach(cell => {
      const ratio = cell.tcPos.length()/this.maxDistance;
      const scale = THREE.MathUtils.lerp(20.0,0.1,Math.min(1,ratio));
      let finalColor = new THREE.Color(1,1,1);
      let totalW = 0;
      colors.forEach((color,name) => {
        const score = cell.scores[name]||0;
        const thr = thresholds.get(name)||0;
        const max = maxScores.get(name)||1;
        if (score >= thr && max>thr) {
          const w = (score - thr)/(max - thr);
          finalColor = finalColor.lerp(color, w);
          totalW += w;
        }
      });
      const alpha = 0.5 * Math.min(1,totalW) * this.opacityFactor;
      cell.tcMesh.material.opacity = alpha;
      cell.globeMesh.material.opacity = alpha;
      cell.mollweideMesh.material.opacity = alpha;
      cell.tcMesh.material.color.copy(finalColor);
      cell.globeMesh.material.color.copy(finalColor);
      cell.mollweideMesh.material.color.copy(finalColor);
      cell.tcMesh.visible = alpha > 0;
      cell.globeMesh.scale.set(scale,scale,1);
      cell.mollweideMesh.scale.set(scale,scale,1);
    });
    this.adjacentLines.forEach(obj => {
      const { line, lineM, cell1, cell2 } = obj;
      const visible = cell1.tcMesh.visible && cell2.tcMesh.visible;
      line.visible = visible;
      lineM.visible = visible;
      if (visible) {
        const c1 = cell1.tcMesh.material.color;
        const c2 = cell2.tcMesh.material.color;
        const avgColor = c1.clone().lerp(c2,0.5);
        const avgOpacity = (cell1.tcMesh.material.opacity + cell2.tcMesh.material.opacity)/2;
        line.material.color.copy(avgColor);
        line.material.opacity = avgOpacity;
        lineM.material.uniforms.color.value.copy(avgColor);
        lineM.material.uniforms.opacityFactor.value = avgOpacity;
      }
    });
    if (sceneTC) this.cubesData.forEach(c=>{ sceneTC.add(c.tcMesh); });
    if (sceneGlobe) this.adjacentLines.forEach(o=>{ sceneGlobe.add(o.line); });
    if (sceneMoll) this.adjacentLines.forEach(o=>{ sceneMoll.add(o.lineM); });
  }

  refreshMollweide(lambda0=getMollweideLambda0()) {
    this.cubesData.forEach(cell => {
      const lambda = cell.raRad - lambda0;
      cell.mollweideMesh.position.set(cell.mollXFactor*lambda, cell.mollY, 0);
    });
    this.adjacentLines.forEach(obj => {
      const gcPts = getGreatCirclePoints(obj.cell1.globeMesh.position, obj.cell2.globeMesh.position, 100, 16).map(v => {
        const ra = Math.atan2(-v.z, -v.x);
        const dec = Math.asin(v.y / 100);
        return cachedRadToMollweide(ra, dec, 100, lambda0);
      });
      const pts = [];
      for (let i=0;i<gcPts.length-1;i++) {
        const segs = splitMollweideWrap(gcPts[i], gcPts[i+1]);
        segs.forEach(([s,e])=>{ pts.push(s,e); });
      }
      obj.lineM.geometry.dispose();
      obj.lineM.geometry = buildWideLineGeometry(pts, this.mollLineWidth);
    });
  }
}

export function initCloudDensityFilter(minDistance, maxDistance, gridSize=2) {
  const overlay = new CloudDensityGridOverlay(minDistance, maxDistance, gridSize);
  overlay.createGrid();
  return overlay;
}

export function updateCloudDensityFilter(overlay, cloudMap, sceneTC, sceneGlobe, sceneMoll, topPercent, radius, colors) {
  if (!overlay) return;
  overlay.update(cloudMap, sceneTC, sceneGlobe, sceneMoll, topPercent, radius, colors);
}
