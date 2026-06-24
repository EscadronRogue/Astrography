import * as THREE from '../vendor/three.js';

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
