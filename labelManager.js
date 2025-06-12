// labelManager.js

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { hexToRGBA } from './utils.js';

/**
 * Returns a ShaderMaterial that renders a texture double‑sided without mirroring.
 */
function getDoubleSidedLabelMaterial(texture, opacity = 1.0) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      opacity: { value: opacity }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform float opacity;
      varying vec2 vUv;
      void main() {
        // Flip the UV if rendering the back face
        vec2 uvCorrected = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);
        vec4 color = texture2D(map, uvCorrected);
        gl_FragColor = vec4(color.rgb, color.a * opacity);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide
  });
}

export class LabelManager {
  constructor(mapType, scene) {
    this.mapType = mapType;
    this.scene = scene;

    // Global opacity applied to star labels
    this.labelOpacity = 1.0;

    // Keep references to label meshes (sprites or planes) and connecting lines
    this.sprites = new Map();
    this.lines = new Map();

    // Used to cache each star's last displayed label text, color, and size
    // so we only rebuild the label texture if something has changed.
    this.labelCache = new Map();

    // Track assigned label angles for each star system to avoid overlaps
    this.systemAngles = new Map();
  }

  /**
   * Creates or updates the 3D label and connecting line for a single star.
   */
  createOrUpdateLabel(star) {
    const starColor = star.displayColor || '#888888';
    const displayName = star.displayName || '';

    // Check our cache
    const cached = this.labelCache.get(star) || {};
    const textChanged = (cached.lastText !== displayName);
    const colorChanged = (cached.lastColor !== starColor);
    const sizeChanged = (cached.lastSize !== star.displaySize);

    // If label already exists but something changed, remove from scene and rebuild.
    let labelObj = this.sprites.get(star);
    let lineObj = this.lines.get(star);
    const needsRebuild = (!labelObj || textChanged || colorChanged || sizeChanged);

    if (needsRebuild) {
      // Remove old objects if present
      if (labelObj) this.scene.remove(labelObj);
      if (lineObj) this.scene.remove(lineObj);

      // Create the canvas-based label texture
      const baseFontSize = (this.mapType === 'Globe'
        ? 64
        : (this.mapType === 'Mollweide' ? 72 : 24));
      // Scale label size with the star's display size but cap the extremes
      // so small star labels remain readable and huge stars aren't
      // overwhelmingly large. Map the typical size range (1–8) to a more
      // moderate label scale.
      const scaleFactor = THREE.MathUtils.clamp(
        THREE.MathUtils.mapLinear(star.displaySize, 1, 8, 1, 5),
        1,
        5
      );
      const fontSize = baseFontSize * scaleFactor;

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.font = `${fontSize}px Arial`;

      const textMetrics = ctx.measureText(displayName);
      const textWidth = textMetrics.width;
      const textHeight = fontSize;
      const paddingX = 10;
      const paddingY = 5;
      canvas.width = textWidth + paddingX * 2;
      canvas.height = textHeight + paddingY * 2;

      // Draw background rectangle (semi-transparent) and text
      ctx.font = `${fontSize}px Arial`;
      ctx.fillStyle = hexToRGBA(starColor, 0.05);
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#ffffff';
      ctx.textBaseline = 'middle';
      ctx.fillText(displayName, paddingX, canvas.height / 2);

      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;

      // Globe -> use a plane geometry with custom shader (double-sided).
      // TrueCoordinates -> use a Sprite.
      if (this.mapType === 'Globe') {
        const planeGeom = new THREE.PlaneGeometry(
          (canvas.width / 100) * scaleFactor,
          (canvas.height / 100) * scaleFactor
        );
        const material = getDoubleSidedLabelMaterial(texture, this.labelOpacity);
        labelObj = new THREE.Mesh(planeGeom, material);
        labelObj.renderOrder = 1;
      } else {
        const spriteMaterial = new THREE.SpriteMaterial({
          map: texture,
          depthWrite: true,
          depthTest: true,
          transparent: true,
          opacity: this.labelOpacity,
        });
        labelObj = new THREE.Sprite(spriteMaterial);
        labelObj.scale.set(
          (canvas.width / 100) * scaleFactor,
          (canvas.height / 100) * scaleFactor,
          1
        );
      }

      this.sprites.set(star, labelObj);

      // Create connecting line
      const lineGeom = new THREE.BufferGeometry();
      const lineMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(starColor),
        transparent: true,
        opacity: 0.2,
        linewidth: 2,
      });
      lineObj = new THREE.Line(lineGeom, lineMat);
      lineObj.renderOrder = 1;
      this.lines.set(star, lineObj);

      // Update cache
      this.labelCache.set(star, {
        lastText: displayName,
        lastColor: starColor,
        lastSize: star.displaySize
      });
    }

    // Ensure both label and line are present in the scene
    if (!this.scene.children.includes(labelObj)) {
      this.scene.add(labelObj);
    }
    if (!this.scene.children.includes(lineObj)) {
      this.scene.add(lineObj);
    }

    // Update positions:
    // For TrueCoordinates map, use star.truePosition if available.
    const starPos = (this.mapType === 'TrueCoordinates')
      ? (star.truePosition
          ? new THREE.Vector3(star.truePosition.x, star.truePosition.y, star.truePosition.z)
          : new THREE.Vector3(star.x_coordinate, star.y_coordinate, star.z_coordinate))
      : (this.mapType === 'Globe'
          ? new THREE.Vector3(star.spherePosition.x, star.spherePosition.y, star.spherePosition.z)
          : new THREE.Vector3(star.mollweidePosition.x, star.mollweidePosition.y, star.mollweidePosition.z));

    let offset;
    if (this.mapType === 'Mollweide' && star.mollLabelOffset) {
      offset = star.mollLabelOffset.clone();
    } else {
      offset = this.computeLabelOffset(star, starPos);
    }
    const labelPos = starPos.clone().add(offset);
    labelObj.position.copy(labelPos);

    if (this.mapType === 'Mollweide') {
      if (star.mollLabelRotation !== undefined) {
        labelObj.material.rotation = star.mollLabelRotation;
      }
      if (star.mollLabelScale) {
        labelObj.scale.copy(star.mollLabelScale);
      }
    }

    // Globe labels: orient plane tangent to sphere
    if (this.mapType === 'Globe' && (labelObj instanceof THREE.Mesh)) {
      const normal = starPos.clone().normalize();
      const globalUp = new THREE.Vector3(0, 1, 0);
      let desiredUp = globalUp.clone().sub(normal.clone().multiplyScalar(globalUp.dot(normal)));
      if (desiredUp.lengthSq() < 1e-6) desiredUp = new THREE.Vector3(0, 0, 1);
      else desiredUp.normalize();
      const desiredRight = new THREE.Vector3().crossVectors(desiredUp, normal).normalize();
      const matrix = new THREE.Matrix4().makeBasis(desiredRight, desiredUp, normal);
      labelObj.setRotationFromMatrix(matrix);
    }

    // Update line geometry
    const points = [starPos, labelPos];
    lineObj.geometry.setFromPoints(points);
    lineObj.material.color.set(star.displayColor || '#888888');
  }

  /**
   * Simple helper to compute label offset from star position, so the label doesn't overlap the star mesh.
   */
  computeLabelOffset(star, starPos) {
    if (this.mapType === 'TrueCoordinates') {
      // Simple screen space offset scaled by star size
      const scaleFactor = THREE.MathUtils.clamp(star.displaySize / 2, 1, 5);
      const dist = 0.5 * scaleFactor;
      return new THREE.Vector3(1, 1, 0).multiplyScalar(dist);
    } else if (this.mapType === 'Mollweide') {
      // Offset labels randomly around the star. Ensure labels from the same
      // system are separated by at least 90 degrees and at most 270 degrees.
      const scaleFactor = THREE.MathUtils.clamp(star.displaySize / 2, 1, 5);
      const dist = 1 * scaleFactor * 2; // double the offset

      const system = star.Common_name_of_the_star_system || star.Common_name_of_the_star || 'unknown';
      let starMap = this.systemAngles.get(system);
      if (!starMap) {
        starMap = new Map();
        this.systemAngles.set(system, starMap);
      }

      let angle = starMap.get(star);
      if (angle === undefined) {
        const existing = Array.from(starMap.values());
        for (let attempt = 0; attempt < 10; attempt++) {
          const candidate = Math.random() * Math.PI * 2;
          const valid = existing.every(a => {
            const diff = Math.abs(candidate - a) % (Math.PI * 2);
            const minDiff = Math.min(diff, Math.PI * 2 - diff);
            return minDiff > Math.PI / 2 && minDiff < (Math.PI * 3) / 2;
          });
          if (valid) {
            angle = candidate;
            break;
          }
        }
        if (angle === undefined) angle = Math.random() * Math.PI * 2;
        starMap.set(star, angle);
      }

      return new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).multiplyScalar(dist);
    } else {
      // For the Globe, offset tangentially around the star on the sphere
      const normal = starPos.clone().normalize();
      let tangent = new THREE.Vector3(0, 1, 0);
      if (Math.abs(normal.dot(tangent)) > 0.9) {
        tangent = new THREE.Vector3(1, 0, 0);
      }
      tangent.cross(normal).normalize();
      const bitangent = normal.clone().cross(tangent).normalize();
      // Random angle around the star
      const angle = Math.random() * Math.PI * 2;
      const baseDistance = 2;
      const scaleFactor = THREE.MathUtils.clamp(star.displaySize / 2, 1, 5);
      return tangent.clone().multiplyScalar(Math.cos(angle))
        .add(bitangent.clone().multiplyScalar(Math.sin(angle)))
        .multiplyScalar(baseDistance * scaleFactor);
    }
  }

  /**
   * Called once every time the filter changes or the star set is replaced.
   * We create/update labels for the new star list, and remove any labels for stars no longer present.
   */
  refreshLabels(stars) {
    const inNewSet = new Set(stars);

    // Create or update labels for every (visible) star in the new set
    stars.forEach(star => {
      if (star.displayVisible) {
        this.createOrUpdateLabel(star);
      }
    });

    // Remove labels for stars not in the new set or no longer visible
    this.sprites.forEach((labelObj, star) => {
      if (!inNewSet.has(star) || !star.displayVisible) {
        this.scene.remove(labelObj);
        this.sprites.delete(star);
        const line = this.lines.get(star);
        if (line) {
          this.scene.remove(line);
          this.lines.delete(star);
        }
        this.labelCache.delete(star);
      }
    });
  }

  /**
   * Removes all labels from the scene.
   */
  removeAllLabels() {
    this.sprites.forEach(obj => this.scene.remove(obj));
    this.lines.forEach(obj => this.scene.remove(obj));
    this.sprites.clear();
    this.lines.clear();
    this.labelCache.clear();
  }

  setLabelOpacity(opacity) {
    this.labelOpacity = opacity;
    this.sprites.forEach(sprite => {
      if (sprite.material.uniforms && sprite.material.uniforms.opacity) {
        sprite.material.uniforms.opacity.value = opacity;
      } else if (sprite.material.opacity !== undefined) {
        sprite.material.opacity = opacity;
      }
      sprite.material.needsUpdate = true;
    });
  }
}
