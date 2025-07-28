import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { cachedRadToMollweide, getMollweideLambda0 } from '../utils/geometryUtils.js';
import { minimalRADifference } from '../utils.js';
import { lightenColor } from './densityColorUtils.js';

async function loadCloudData(cloudFileUrl) {
  const response = await fetch(cloudFileUrl);
  if (!response.ok) {
    throw new Error(`Failed to load cloud data from ${cloudFileUrl}`);
  }
  return await response.json();
}

function uniqueColorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = (hash % 360 + 360) % 360;
  return new THREE.Color(`hsl(${hue}, 70%, 50%)`);
}

function getCloudNameFromFileUrl(fileUrl) {
  const parts = fileUrl.split('/');
  const filename = parts[parts.length - 1];
  return filename.replace('_cloud_data.json', '').replace('_', ' ');
}

class CloudDensityGridOverlay {
  constructor(minDistance, maxDistance, gridSize = 2, cloudName = '') {
    this.minDistance = parseFloat(minDistance);
    this.maxDistance = parseFloat(maxDistance);
    this.gridSize = gridSize;
    this.cubesData = [];
    this.color = uniqueColorFromName(cloudName);
    this.opacityFactor = 1.0;

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
    this.textureMesh = new THREE.Mesh(new THREE.PlaneGeometry(400, 200), mat);
    this.textureMesh.renderOrder = 2;
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
          const distFromCenter = posTC.length();
          if (distFromCenter < this.minDistance || distFromCenter > this.maxDistance) continue;

          const geometry = new THREE.BoxGeometry(this.gridSize, this.gridSize, this.gridSize);
          const material = new THREE.MeshBasicMaterial({
            color: this.color,
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
            active: false,
            raRad: ra,
            decRad: dec,
            mollXFactor: mollXFactor,
            mollY: mollY
          };
          this.cubesData.push(cell);
        }
      }
    }
  }

  update(positions, sceneTC, sceneGlobe, sceneMoll, radius) {
    const rad = radius;
    this.cubesData.forEach(cell => {
      let minD = Infinity;
      positions.forEach(pos => {
        const d = cell.tcPos.distanceTo(pos);
        if (d < minD) minD = d;
      });
      if (minD <= rad) {
        const t = minD / rad;
        const color = lightenColor(this.color.clone(), t * 0.5);
        const alpha = (1 - t) * this.opacityFactor;
        cell.tcMesh.material.color.copy(color);
        cell.globeMesh.material.color.copy(color);
        cell.mollweideMesh.material.color.copy(color);
        cell.tcMesh.material.opacity = alpha;
        cell.globeMesh.material.opacity = alpha;
        cell.mollweideMesh.material.opacity = alpha;
        const ratio = cell.tcPos.length() / this.maxDistance;
        const scale = THREE.MathUtils.lerp(20.0, 0.1, Math.min(1, ratio));
        cell.globeMesh.scale.set(scale, scale, 1);
        cell.mollweideMesh.scale.set(scale, scale, 1);
        cell.tcMesh.visible = true;
        cell.globeMesh.visible = true;
        cell.mollweideMesh.visible = true;
        cell.active = true;
      } else {
        cell.tcMesh.visible = false;
        cell.globeMesh.visible = false;
        cell.mollweideMesh.visible = false;
        cell.active = false;
      }
    });
    if (sceneTC) this.cubesData.forEach(c => sceneTC.add(c.tcMesh));
    if (sceneGlobe) this.cubesData.forEach(c => sceneGlobe.add(c.globeMesh));
    if (sceneMoll) {
      if (!sceneMoll.children.includes(this.textureMesh)) {
        sceneMoll.add(this.textureMesh);
      }
    }
    this.drawHeatmap(getMollweideLambda0());
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

  refreshMollweide(lambda0 = getMollweideLambda0()) {
    this.cubesData.forEach(cell => {
      const lambda = minimalRADifference(cell.raRad - lambda0);
      cell.mollweideMesh.position.set(
        cell.mollXFactor * lambda,
        cell.mollY,
        0
      );
    });
    this.drawHeatmap(lambda0);
  }
}

export async function createCloudDensityOverlay(minD, maxD, gridSize, cloudFile, allStars) {
  const data = await loadCloudData(cloudFile);
  const names = new Set(data.map(d => d['Star Name']));
  const positions = [];
  allStars.forEach(star => {
    if (names.has(star.Common_name_of_the_star)) {
      const pos = star.truePosition ? star.truePosition : new THREE.Vector3(star.x_coordinate, star.y_coordinate, star.z_coordinate);
      positions.push(pos.clone());
    }
  });
  const overlay = new CloudDensityGridOverlay(minD, maxD, gridSize, getCloudNameFromFileUrl(cloudFile));
  overlay.createGrid();
  overlay.cloudPositions = positions;
  return overlay;
}

export function updateCloudDensityOverlay(
  overlay,
  sceneTC,
  sceneGlobe,
  sceneMoll,
  radius,
  opacity = 1.0
) {
  overlay.opacityFactor = opacity;
  overlay.update(overlay.cloudPositions, sceneTC, sceneGlobe, sceneMoll, radius);
}
