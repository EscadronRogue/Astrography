import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { cachedRadToMollweide, getMollweideLambda0 } from '../utils/geometryUtils.js';
import { minimalRADifference } from '../utils/geometryUtils.js';
import { lightenColor } from './densityColorUtils.js';
import { getDustCloudColor } from './dustCloudColors.js';
import { loadCachedCloudData } from './dustCloudDataCache.js';
import { uniqueColorFromName, getCloudNameFromFileUrl } from '../shared/colorUtils.js';
import { GLOBE_RADIUS, HEATMAP_CANVAS_WIDTH, HEATMAP_CANVAS_HEIGHT, HEATMAP_PLANE_WIDTH, HEATMAP_PLANE_HEIGHT, MOLLWEIDE_MAX_ITERATIONS, EPSILON } from '../shared/constants.js';

class CloudDensityGridOverlay {
  constructor(minDistance, maxDistance, gridSize = 2, cloudName = '') {
    this.minDistance = parseFloat(minDistance);
    this.maxDistance = parseFloat(maxDistance);
    this.gridSize = gridSize;
    this.cubesData = [];
    this.color = uniqueColorFromName(cloudName);
    this.opacityFactor = 1.0;

    this.canvasWidth = HEATMAP_CANVAS_WIDTH;
    this.canvasHeight = HEATMAP_CANVAS_HEIGHT;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvasWidth;
    this.canvas.height = this.canvasHeight;
    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) throw new Error('2D canvas context unavailable');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    const mat = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false
    });
    this.textureMesh = new THREE.Mesh(new THREE.PlaneGeometry(HEATMAP_PLANE_WIDTH, HEATMAP_PLANE_HEIGHT), mat);
    this.textureMesh.renderOrder = 2;
  }

  createGrid() {
    const halfExt = Math.ceil(this.maxDistance / this.gridSize) * this.gridSize;
    this.cubesData = [];
    const cubeGeometry = new THREE.BoxGeometry(this.gridSize, this.gridSize, this.gridSize);
    const planeGeometry = new THREE.PlaneGeometry(this.gridSize, this.gridSize);
    const circleGeometry = new THREE.CircleGeometry(this.gridSize / 2, 32);
    const baseMaterial = new THREE.MeshBasicMaterial({
      color: this.color,
      transparent: true,
      opacity: 0.0,
      depthWrite: false
    });
    const planeBase = baseMaterial.clone();
    planeBase.side = THREE.DoubleSide;
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

          const cubeTC = new THREE.Mesh(cubeGeometry, baseMaterial.clone());
          cubeTC.position.copy(posTC);

          const squareGlobe = new THREE.Mesh(planeGeometry, planeBase.clone());
          const circleMoll = new THREE.Mesh(circleGeometry, planeBase.clone());
          let projectedPos;
          let ra, dec;
          if (distFromCenter < 1e-6) {
            projectedPos = new THREE.Vector3(0, 0, 0);
            circleMoll.position.set(0, 0, 0);
            ra = 0; dec = 0;
          } else {
            ra = Math.atan2(-posTC.z, -posTC.x);
            dec = Math.asin(posTC.y / distFromCenter);
            projectedPos = new THREE.Vector3(
              -GLOBE_RADIUS * Math.cos(dec) * Math.cos(ra),
               GLOBE_RADIUS * Math.sin(dec),
              -GLOBE_RADIUS * Math.cos(dec) * Math.sin(ra)
            );
            const projMoll = cachedRadToMollweide(ra, dec, GLOBE_RADIUS, getMollweideLambda0());
            circleMoll.position.copy(projMoll);
          }
          let theta = dec;
          for (let i = 0; i < MOLLWEIDE_MAX_ITERATIONS; i++) {
            const delta = (2 * theta + Math.sin(2 * theta) - Math.PI * Math.sin(dec)) /
              (2 + 2 * Math.cos(2 * theta));
            theta -= delta;
            if (Math.abs(delta) < EPSILON) break;
          }
          const cosT = Math.cos(theta);
          const sinT = Math.sin(theta);
          const mollXFactor = (2 * GLOBE_RADIUS / Math.PI) * cosT;
          const mollY = GLOBE_RADIUS * sinT;
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
            mollweideMesh: circleMoll,
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
    const rad2 = radius * radius;
    this.cubesData.forEach(cell => {
      let minD2 = Infinity;
      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        const dx = cell.tcPos.x - pos.x;
        const dy = cell.tcPos.y - pos.y;
        const dz = cell.tcPos.z - pos.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < minD2) minD2 = d2;
      }
      if (minD2 <= rad2) {
        const minD = Math.sqrt(minD2);
        const t = minD / radius;
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
        cell.mollweideMesh.scale.set(scale * 2, scale * 2, 1);
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
      if (sceneTC && !cell.tcMesh.parent) sceneTC.add(cell.tcMesh);
      if (sceneGlobe && !cell.globeMesh.parent) sceneGlobe.add(cell.globeMesh);
      if (sceneMoll && !cell.mollweideMesh.parent) sceneMoll.add(cell.mollweideMesh);
    });
    if (sceneMoll && !sceneMoll.children.includes(this.textureMesh)) {
      sceneMoll.add(this.textureMesh);
    }
    this.drawHeatmap(getMollweideLambda0());
  }

  drawHeatmap(lambda0 = getMollweideLambda0()) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
    ctx.filter = 'blur(8px)';
    const xScale = this.canvasWidth / 400;
    const yScale = this.canvasHeight / 200;
    this.cubesData.forEach(cell => {
      if (!cell.active) return;
      const lambda = minimalRADifference(cell.raRad - lambda0);
      const x = cell.mollXFactor * lambda;
      const y = cell.mollY;
      const ratio = cell.tcPos.length() / this.maxDistance;
      const scale = THREE.MathUtils.lerp(20.0, 0.1, Math.min(1, ratio)) * 2;
      const width = this.gridSize * scale * xScale;
      const height = this.gridSize * scale * yScale;
      const px = (x + 200) * xScale;
      const py = (100 - y) * yScale;
      const col = cell.mollweideMesh.material.color;
      const alpha = cell.mollweideMesh.material.opacity;
      const r = Math.round(col.r * 255);
      const g = Math.round(col.g * 255);
      const b = Math.round(col.b * 255);
      const radius = Math.max(width, height);
      const grd = ctx.createRadialGradient(px, py, 0, px, py, radius);
      grd.addColorStop(0, `rgba(${r},${g},${b},${alpha})`);
      grd.addColorStop(0.7, `rgba(${r},${g},${b},${alpha * 0.3})`);
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
  const data = await loadCachedCloudData(cloudFile);
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
