import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import {
  getGreatCirclePoints,
  cachedRadToMollweide,
  getMollweideLambda0,
  splitMollweideWrap,
  vectorToRaDecRad,
  radToMollweide
} from '../utils/geometryUtils.js';
import { minimalRADifference } from '../utils.js';
import { lightenColor } from './densityColorUtils.js';

// Helper material and geometry builders for wide fading lines on the Mollweide map
function createWideLineMaterial(color, fadePower = 1.0) {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      opacityFactor: { value: 1.0 },
      fadePower: { value: fadePower }
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      attribute float side;
      attribute float along;
      varying float vSide;
      varying float vAlong;
      void main() {
        vSide = side;
        vAlong = along;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float opacityFactor;
      uniform float fadePower;
      varying float vSide;
      varying float vAlong;
      void main() {
        float dist = length(vec2(vSide, vAlong));
        float alpha = pow(max(0.0, 1.0 - dist), fadePower) * opacityFactor;
        if(alpha <= 0.0) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `
  });
}

function buildWideLineGeometry(points, width) {
  const vertices = [];
  const sides = [];
  const along = [];
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
    along.push(-1, -1, 1);
    vertices.push(a1.x, a1.y, a1.z, b2.x, b2.y, b2.z, b1.x, b1.y, b1.z);
    sides.push(1, -1, 1);
    along.push(-1, 1, 1);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geom.setAttribute('side', new THREE.Float32BufferAttribute(sides, 1));
  geom.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  return geom;
}

class DensityGridOverlay {
  constructor(minDistance, maxDistance, gridSize = 2) {
    this.minDistance = parseFloat(minDistance);
    this.maxDistance = parseFloat(maxDistance);
    this.gridSize = gridSize;
    this.cubesData = [];
    this.adjacentLines = [];
    this.maxDensity = 0;
    this.mollLineWidth = 30; // width of connection lines on the Mollweide map
    this.opacityFactor = 1.0;
    this.fadePower = 1.0;

    // Off-screen canvas for smooth Mollweide heatmap
    this.canvasWidth = 1024;
    this.canvasHeight = 512;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvasWidth;
    this.canvas.height = this.canvasHeight;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    const mat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false
    });
    this.textureMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(400, 200),
      mat
    );
    this.textureMesh.renderOrder = 2;
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
          const geomM = buildWideLineGeometry(pointsM, this.mollLineWidth);
          for (let i = 0; i < points.length; i++) {
            positions.push(points[i].x, points[i].y, points[i].z);
          }
          const geom = new THREE.BufferGeometry();
          geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
          const mat = new THREE.LineBasicMaterial({
            color: 0xff0000,
            transparent: true,
            opacity: 0.3,
            linewidth: 2
          });
          const line = new THREE.Line(geom, mat);
          line.renderOrder = 2;
          const mollMat = createWideLineMaterial(0xff0000, this.fadePower);
          const lineM = new THREE.Mesh(geomM, mollMat);
          lineM.renderOrder = 2;
          this.adjacentLines.push({ line, lineM, cell1: cell, cell2: neighbor });
        }
      });
    });
  }

  drawHeatmap(lambda0 = getMollweideLambda0()) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    ctx.filter = 'blur(4px)';
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
      const col = cell.mollweideMesh.material.color;
      const alpha = cell.mollweideMesh.material.opacity;
      const r = Math.round(col.r * 255);
      const g = Math.round(col.g * 255);
      const b = Math.round(col.b * 255);
      const radius = Math.max(width, height) * 0.6;
      const grd = ctx.createRadialGradient(px, py, 0, px, py, radius);
      grd.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
      grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.filter = 'none';
    this.texture.needsUpdate = true;
  }

  update(stars, sceneTC, sceneGlobe, sceneMoll) {
    const radiusSlider = document.getElementById('density-slider');
    const tolSlider = document.getElementById('density-tolerance-slider');
    const bottomSlider = document.getElementById('density-bottom-slider');
    const topSlider = document.getElementById('density-top-slider');
    const opacitySlider = document.getElementById('density-opacity-slider');
    const widthSlider = document.getElementById('density-line-width-slider');
    const fadeSlider = document.getElementById('density-fade-slider');
    const radius = radiusSlider ? parseFloat(radiusSlider.value) : 10;
    const tolerance = tolSlider ? parseInt(tolSlider.value) : 0;
    const bottomPct = bottomSlider ? parseFloat(bottomSlider.value) : 10;
    const topPct = topSlider ? parseFloat(topSlider.value) : 10;
    this.opacityFactor = opacitySlider ? parseFloat(opacitySlider.value) / 100 : 1.0;
    let newWidth = this.mollLineWidth;
    if (widthSlider) newWidth = parseFloat(widthSlider.value);
    if (fadeSlider) this.fadePower = parseFloat(fadeSlider.value);

    if (newWidth !== this.mollLineWidth) {
      this.mollLineWidth = newWidth;
      this.refreshMollweide();
    }

    const extendedStars = stars.filter(star => {
      const d = star.Distance_from_the_Sun;
      return d >= Math.max(0, this.minDistance - 10) && d <= this.maxDistance + 10;
    });

    this.cubesData.forEach(cell => {
      this.computeCellDensity(cell, extendedStars, radius, tolerance);
    });

    const densities = this.cubesData.map(c => c.density);
    const sorted = densities.slice().sort((a, b) => a - b);
    const bottomIdx = Math.floor(sorted.length * (bottomPct / 100));
    const topIdx = Math.floor(sorted.length * (1 - topPct / 100));
    const minD = sorted[0];
    const maxD = sorted[sorted.length - 1];
    const bottomThr = sorted[Math.min(bottomIdx, sorted.length - 1)];
    const topThr = sorted[Math.max(topIdx, 0)];

    this.cubesData.forEach(cell => {
      const ratio = cell.tcPos.length() / this.maxDistance;
      const scale = THREE.MathUtils.lerp(20.0, 0.1, Math.min(1, ratio));
      let color = new THREE.Color(0xffffff);
      let alpha = 0;
      if (cell.density <= bottomThr) {
        const t = bottomThr === minD ? 0 : (cell.density - minD) / (bottomThr - minD);
        color = new THREE.Color(0x0000ff).lerp(new THREE.Color(0xffffff), t);
        alpha = 0.5 * (1 - t);
        cell.active = true;
      } else if (cell.density >= topThr) {
        const t = topThr === maxD ? 0 : (cell.density - topThr) / (maxD - topThr);
        const baseRed = new THREE.Color(0xff0000);
        const lightRed = lightenColor(baseRed.clone(), 0.4);
        color = lightRed.lerp(baseRed, t);
        alpha = 0.5 * t;
        cell.active = true;
      } else {
        cell.active = false;
      }

      const finalAlpha = alpha * this.opacityFactor;
      cell.tcMesh.material.opacity = finalAlpha;
      cell.globeMesh.material.opacity = finalAlpha;
      cell.mollweideMesh.material.opacity = finalAlpha;
      cell.tcMesh.material.color.copy(color);
      cell.globeMesh.material.color.copy(color);
      cell.mollweideMesh.material.color.copy(color);
      cell.tcMesh.visible = cell.active;
      cell.globeMesh.scale.set(scale, scale, 1);
      cell.mollweideMesh.scale.set(scale, scale, 1);
    });
    this.adjacentLines.forEach(obj => {
      const { line, lineM, cell1, cell2 } = obj;
      const visible = cell1.active && cell2.active;
      line.visible = visible;
      lineM.visible = visible;
      if (visible) {
        const c1 = cell1.tcMesh.material.color;
        const c2 = cell2.tcMesh.material.color;
        const avgColor = c1.clone().lerp(c2, 0.5);
        const avgOpacity = (cell1.tcMesh.material.opacity + cell2.tcMesh.material.opacity) / 2;
        line.material.color.copy(avgColor);
        line.material.opacity = avgOpacity;
        line.material.vertexColors = false;
        line.material.needsUpdate = true;
        lineM.material.uniforms.color.value.copy(avgColor);
        lineM.material.uniforms.opacityFactor.value = avgOpacity;
        lineM.material.uniforms.fadePower.value = this.fadePower;
        lineM.material.needsUpdate = true;
      }
    });
    if (sceneTC) {
      this.cubesData.forEach(c => { sceneTC.add(c.tcMesh); });
    }
    if (sceneGlobe) {
      this.adjacentLines.forEach(o => { sceneGlobe.add(o.line); });
    }
    if (sceneMoll) {
      if (!sceneMoll.children.includes(this.textureMesh)) {
        sceneMoll.add(this.textureMesh);
      }
    }
    this.drawHeatmap(getMollweideLambda0());
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
      obj.lineM.geometry.dispose();
      obj.lineM.geometry = buildWideLineGeometry(pts, this.mollLineWidth);
      if (obj.lineM.material.uniforms.fadePower) {
        obj.lineM.material.uniforms.fadePower.value = this.fadePower;
      }
    });
    this.drawHeatmap(lambda0);
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
