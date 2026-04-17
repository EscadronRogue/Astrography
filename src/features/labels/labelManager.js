import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { interpolateColor } from '../../shared/colorUtils.js';
import { getDoubleSidedLabelMaterial } from '../density/densityColorScale.js';
import { disposeObject3D, stableAngleFromString } from '../../render/engine/renderUtils.js';
import { getStarEquirectangularPosition } from '../../shared/uvUtils.js';

function getStarCacheKey(star) {
  return star.starId || star.Source_id || star.HIP_number || `${star.Common_name_of_the_star || 'star'}|${star.RA_in_degrees}|${star.DEC_in_degrees}`;
}

function getOrAssignSystemAngle(systemAngles, system, starKey) {
  let starMap = systemAngles.get(system);
  if (!starMap) {
    starMap = new Map();
    systemAngles.set(system, starMap);
  }

  let angle = starMap.get(starKey);
  if (angle !== undefined) {
    return angle;
  }

  const base = stableAngleFromString(`${system}|${starKey}`);
  const existing = Array.from(starMap.values());
  angle = base;
  for (let i = 0; i < 8; i++) {
    const candidate = (base + i * (Math.PI / 3)) % (Math.PI * 2);
    if (existing.every(existingAngle => {
      const diff = Math.abs(candidate - existingAngle) % (Math.PI * 2);
      const minDiff = Math.min(diff, Math.PI * 2 - diff);
      return minDiff > Math.PI / 4;
    })) {
      angle = candidate;
      break;
    }
  }

  starMap.set(starKey, angle);
  return angle;
}

export class LabelManager {
  constructor(mapType, scene) {
    this.mapType = mapType;
    this.scene = scene;
    this.labelOpacity = 1.0;
    this.sprites = new Map();
    this.lines = new Map();
    this.labelCache = new Map();
    this.systemAngles = new Map();
  }

  createOrUpdateLabel(star) {
    const cacheKey = getStarCacheKey(star);
    const starColor = star.displayColor || '#888888';
    const displayName = star.displayName || '';
    const cached = this.labelCache.get(cacheKey) || {};
    const labelSize = star.displayLabelSize !== undefined ? star.displayLabelSize : star.displaySize;
    const needsRebuild = !this.sprites.get(star) || cached.lastText !== displayName || cached.lastColor !== starColor || cached.lastSize !== labelSize;

    let labelObj = this.sprites.get(star);
    let lineObj = this.lines.get(star);

    if (needsRebuild) {
      if (labelObj) { this.scene.remove(labelObj); disposeObject3D(labelObj); }
      if (lineObj) { this.scene.remove(lineObj); disposeObject3D(lineObj); }

      const isGlobeLike = this.mapType === 'Globe' || this.mapType === 'UVGlobe';
      const isFlatProjected = this.mapType === 'Mollweide' || this.mapType === 'Equirectangular';
      const baseFontSize = isGlobeLike ? 64 : (isFlatProjected ? 72 : 24);
      const scaleFactor = THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(labelSize, 0.1, 8, 0.1, 5), 0.1, 5);
      const fontSize = baseFontSize * scaleFactor;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
      ctx.font = `${fontSize}px Oswald`;
      const textWidth = ctx.measureText(displayName).width;
      const paddingX = 10;
      const paddingY = 5;
      canvas.width = textWidth + paddingX * 2;
      canvas.height = fontSize + paddingY * 2;
      ctx.font = `${fontSize}px Oswald`;
      ctx.fillStyle = '#' + interpolateColor('#ffffff', starColor, 0.5).toString(16).padStart(6, '0');
      ctx.textBaseline = 'middle';
      ctx.fillText(displayName, paddingX, canvas.height / 2);

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      if (isGlobeLike) {
        labelObj = new THREE.Mesh(new THREE.PlaneGeometry((canvas.width / 100) * scaleFactor, (canvas.height / 100) * scaleFactor), getDoubleSidedLabelMaterial(texture, this.labelOpacity));
      } else {
        const isTrueCoordinates = this.mapType === 'TrueCoordinates';
        labelObj = new THREE.Sprite(new THREE.SpriteMaterial({
          map: texture,
          depthWrite: !isTrueCoordinates,
          depthTest: true,
          transparent: true,
          opacity: this.labelOpacity
        }));
        labelObj.scale.set((canvas.width / 100) * scaleFactor, (canvas.height / 100) * scaleFactor, 1);
      }
      labelObj.renderOrder = this.mapType === 'Mollweide' ? 5 : 1;
      lineObj = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({
        color: new THREE.Color(starColor),
        transparent: true,
        opacity: this.mapType === 'TrueCoordinates' ? 0.12 : 0.2,
        depthWrite: this.mapType !== 'TrueCoordinates',
        linewidth: 2
      }));
      lineObj.renderOrder = this.mapType === 'Mollweide' ? 5 : 1;
      this.sprites.set(star, labelObj);
      this.lines.set(star, lineObj);
      this.labelCache.set(cacheKey, { lastText: displayName, lastColor: starColor, lastSize: labelSize });
    }

    if (!this.scene.children.includes(labelObj)) this.scene.add(labelObj);
    if (!this.scene.children.includes(lineObj)) this.scene.add(lineObj);

    const starPos = this.mapType === 'TrueCoordinates'
      ? (star.truePosition ? new THREE.Vector3(star.truePosition.x, star.truePosition.y, star.truePosition.z) : new THREE.Vector3(star.x_coordinate, star.y_coordinate, star.z_coordinate))
      : (this.mapType === 'Globe' || this.mapType === 'UVGlobe')
        ? new THREE.Vector3(star.spherePosition.x, star.spherePosition.y, star.spherePosition.z)
        : (this.mapType === 'Equirectangular'
          ? getStarEquirectangularPosition(star)
          : new THREE.Vector3(star.mollweidePosition.x, star.mollweidePosition.y, star.mollweidePosition.z));

    const offset = this.mapType === 'Mollweide' && star.mollLabelOffset ? star.mollLabelOffset.clone() : this.computeLabelOffset(star, starPos);
    const labelPos = starPos.clone().add(offset);
    labelObj.position.copy(labelPos);

    if (this.mapType === 'Mollweide' || this.mapType === 'Equirectangular') {
      if (star.mollLabelRotation !== undefined && labelObj.material) labelObj.material.rotation = star.mollLabelRotation;
      if (star.mollLabelScale) {
        labelObj.scale.set(star.mollLabelScale.x, star.mollLabelScale.y, labelObj.scale.z);
      }
    }

    if ((this.mapType === 'Globe' || this.mapType === 'UVGlobe') && labelObj instanceof THREE.Mesh) {
      const normal = starPos.clone().normalize();
      const globalUp = new THREE.Vector3(0, 1, 0);
      let desiredUp = globalUp.clone().sub(normal.clone().multiplyScalar(globalUp.dot(normal)));
      if (desiredUp.lengthSq() < 1e-6) desiredUp = new THREE.Vector3(0, 0, 1);
      else desiredUp.normalize();
      const desiredRight = new THREE.Vector3().crossVectors(desiredUp, normal).normalize();
      labelObj.setRotationFromMatrix(new THREE.Matrix4().makeBasis(desiredRight, desiredUp, normal));
    }

    lineObj.geometry.setFromPoints([starPos, labelPos]);
    lineObj.material.color.set(star.displayColor || '#888888');
  }

  computeLabelOffset(star, starPos) {
    const labelSize = star.displayLabelSize !== undefined ? star.displayLabelSize : star.displaySize;
    if (this.mapType === 'TrueCoordinates') {
      const scaleFactor = THREE.MathUtils.clamp(labelSize / 2, 0.1, 5);
      const normal = starPos.lengthSq() > 1e-8 ? starPos.clone().normalize() : new THREE.Vector3(0, 0, 1);
      let tangent = new THREE.Vector3(0, 1, 0);
      if (Math.abs(normal.dot(tangent)) > 0.9) tangent = new THREE.Vector3(1, 0, 0);
      tangent.cross(normal).normalize();
      const bitangent = normal.clone().cross(tangent).normalize();
      const system = star.Common_name_of_the_star_system || star.Common_name_of_the_star || 'unknown';
      const angle = getOrAssignSystemAngle(this.systemAngles, system, getStarCacheKey(star));
      return tangent.multiplyScalar(Math.cos(angle)).add(bitangent.multiplyScalar(Math.sin(angle))).multiplyScalar(1.8 * scaleFactor);
    }
    if (this.mapType === 'Mollweide' || this.mapType === 'Equirectangular') {
      const scaleFactor = THREE.MathUtils.clamp(labelSize / 2, 0.1, 5);
      const dist = 2 * scaleFactor;
      const system = star.Common_name_of_the_star_system || star.Common_name_of_the_star || 'unknown';
      const angle = getOrAssignSystemAngle(this.systemAngles, system, getStarCacheKey(star));
      return new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(dist);
    }
    const normal = starPos.clone().normalize();
    let tangent = new THREE.Vector3(0, 1, 0);
    if (Math.abs(normal.dot(tangent)) > 0.9) tangent = new THREE.Vector3(1, 0, 0);
    tangent.cross(normal).normalize();
    const bitangent = normal.clone().cross(tangent).normalize();
    const angle = stableAngleFromString(getStarCacheKey(star));
    return tangent.multiplyScalar(Math.cos(angle)).add(bitangent.multiplyScalar(Math.sin(angle))).multiplyScalar(2 * THREE.MathUtils.clamp(labelSize / 2, 0.1, 5));
  }

  refreshLabels(stars) {
    const inNewSet = new Set(stars);
    stars.forEach(star => { if (star.displayVisible) this.createOrUpdateLabel(star); });
    this.sprites.forEach((labelObj, star) => {
      if (!inNewSet.has(star) || !star.displayVisible) {
        this.scene.remove(labelObj); disposeObject3D(labelObj); this.sprites.delete(star);
        const line = this.lines.get(star);
        if (line) { this.scene.remove(line); disposeObject3D(line); this.lines.delete(star); }
      }
    });
  }

  removeAllLabels() {
    this.sprites.forEach(obj => { this.scene.remove(obj); disposeObject3D(obj); });
    this.lines.forEach(obj => { this.scene.remove(obj); disposeObject3D(obj); });
    this.sprites.clear(); this.lines.clear(); this.labelCache.clear();
  }

  setLabelOpacity(opacity) {
    this.labelOpacity = opacity;
    this.sprites.forEach(sprite => {
      if (sprite.material.uniforms?.opacity) sprite.material.uniforms.opacity.value = opacity;
      else if (sprite.material.opacity !== undefined) sprite.material.opacity = opacity;
      sprite.material.needsUpdate = true;
    });
  }
}
