import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';

export function lightenColor(color, factor) {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  const next = new THREE.Color();
  next.setHSL(hsl.h, hsl.s, Math.min(1, hsl.l + factor));
  return next;
}

export function darkenColor(color, factor) {
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  const next = new THREE.Color();
  next.setHSL(hsl.h, hsl.s, Math.max(0, hsl.l - factor));
  return next;
}

function hashString(str) {
  let hash = 0;
  const value = String(str ?? '');
  for (let i = 0; i < value.length; i++) hash = value.charCodeAt(i) + ((hash << 5) - hash);
  return hash;
}

function hslColorFromHash(str, { start, spread }) {
  const hue = start + (Math.abs(hashString(str)) % spread);
  return new THREE.Color(`hsl(${hue}, 70%, 50%)`);
}

export function getBaseColor(str) { return hslColorFromHash(str, { start: 0, spread: 360 }); }
export function getBlueColor(str) { return hslColorFromHash(str, { start: 200, spread: 41 }); }
export function getGreenColor(str) { return hslColorFromHash(str, { start: 120, spread: 41 }); }
export function getIndividualBlueColor(seedStr) {
  const normalized = (Math.abs(hashString(seedStr)) % 1000) / 1000;
  return new THREE.Color(`hsl(${180 + normalized * 80}, 70%, 50%)`);
}

export function getStableConstellationColor(str) {
  return `#${getBaseColor(String(str || 'UNKNOWN')).getHexString()}`;
}

export function getDoubleSidedLabelMaterial(texture, opacity = 1.0) {
  return new THREE.ShaderMaterial({
    uniforms: { map: { value: texture }, opacity: { value: opacity } },
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
        vec2 uvCorrected = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);
        vec4 color = texture2D(map, uvCorrected);
        gl_FragColor = vec4(color.rgb, color.a * opacity);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide
  });
}
