import * as THREE from '../vendor/three.js';
import { STAR_TEXTURE_SIZE } from '../shared/constants.js';

export function createStarTexture(documentRef = globalThis.document) {
  const size = STAR_TEXTURE_SIZE;
  const canvas = documentRef.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

export function createStarMaterial(texture, opacity, _sizeAttenuation, cameraZoom) {
  return new THREE.ShaderMaterial({
    uniforms: {
      pointTexture: { value: texture },
      opacity: { value: opacity },
      cameraZoom: { value: cameraZoom ?? 1.0 }
    },
    vertexShader: `
      attribute float size;
      attribute float customOpacity;
      attribute vec3 customColor;
      varying vec3 vColor;
      varying float vOpacity;
      uniform float cameraZoom;
      void main() {
        vColor = customColor;
        vOpacity = customOpacity;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * cameraZoom;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D pointTexture;
      uniform float opacity;
      varying vec3 vColor;
      varying float vOpacity;
      void main() {
        vec4 texColor = texture2D(pointTexture, gl_PointCoord);
        if (texColor.a < 0.01) discard;
        gl_FragColor = vec4(vColor, texColor.a * opacity * vOpacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    vertexColors: true
  });
}

export function createInstancedStarMaterial(opacity) {
  return new THREE.ShaderMaterial({
    uniforms: {
      opacity: { value: opacity }
    },
    vertexShader: `
      attribute float instanceOpacity;
      varying vec3 vColor;
      varying float vOpacity;
      void main() {
        vColor = instanceColor;
        vOpacity = instanceOpacity;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float opacity;
      varying vec3 vColor;
      varying float vOpacity;
      void main() {
        gl_FragColor = vec4(vColor, opacity * vOpacity);
      }
    `,
    transparent: true,
    depthWrite: false
  });
}
