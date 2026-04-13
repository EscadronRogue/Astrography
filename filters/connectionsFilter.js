// filters/connectionsFilter.js

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { splitMollweideWrap, greatCircleToMollweide, getMollweideLambda0, getGreatCirclePoints } from '../utils/geometryUtils.js';
import { getStarVector } from '../utils/starData.js';

// Tunable parameters for the connections lines
let connectionMaxWidth = 5;
let connectionFadePower = 1.0;
let connectionLabelSize = 1.0;

export function setConnectionLineParams(maxWidth, fadePower, labelSize = 1.0) {
  connectionMaxWidth = maxWidth;
  connectionFadePower = fadePower;
  connectionLabelSize = labelSize;
}

// Helper material and geometry builders for wide fading lines on the Mollweide map
function createWideLineMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      opacityFactor: { value: 1.0 },
      fadePower: { value: connectionFadePower }
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

export function buildWideLineGeometry(points, width) {
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

const GC_SEGMENTS = 32;


