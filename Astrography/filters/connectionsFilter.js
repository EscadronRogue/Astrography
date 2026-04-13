// filters/connectionsFilter.js

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import {
  splitMollweideWrap,
  greatCircleToMollweide,
  getMollweideLambda0,
  getGreatCirclePoints
} from '../utils/geometryUtils.js';
import { getStarVector } from '../utils/starData.js';

let connectionMaxWidth = 5;
let connectionFadePower = 1.0;
let connectionLabelSize = 1.0;

export function setConnectionLineParams(maxWidth, fadePower, labelSize = 1.0) {
  connectionMaxWidth = maxWidth;
  connectionFadePower = fadePower;
  connectionLabelSize = labelSize;
}

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
        if (alpha <= 0.0) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `
  });
}

export function buildWideLineGeometry(points, width) {
  const vertices = [];
  const sides = [];
  const along = [];
  const safeWidth = Math.max(0.0001, Number.isFinite(width) ? width : 1);
  for (let i = 0; i + 1 < points.length; i += 2) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (!p1 || !p2) continue;
    const values = [p1.x, p1.y, p1.z, p2.x, p2.y, p2.z];
    if (values.some(v => !Number.isFinite(v))) continue;

    const rawDir = new THREE.Vector2(p2.x - p1.x, p2.y - p1.y);
    if (rawDir.lengthSq() < 1e-12) continue;
    const dir = rawDir.normalize();
    const perp = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(safeWidth / 2);
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
  if (vertices.length === 0) {
    geom.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
    geom.setAttribute('side', new THREE.Float32BufferAttribute([0], 1));
    geom.setAttribute('along', new THREE.Float32BufferAttribute([0], 1));
    geom.setDrawRange(0, 0);
    return geom;
  }

  geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geom.setAttribute('side', new THREE.Float32BufferAttribute(sides, 1));
  geom.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  return geom;
}

const GC_SEGMENTS = 32;

function getPosition(star) {
  return getStarVector(star);
}

export function computeConnectionPairs(stars, maxDistance) {
  const pairs = [];
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const starA = stars[i];
      const starB = stars[j];
      const posA = getPosition(starA);
      const posB = getPosition(starB);
      const distance = posA.distanceTo(posB);
      if (distance > 0 && distance <= maxDistance) {
        pairs.push({ starA, starB, distance });
      }
    }
  }
  return pairs;
}

export function mergeConnectionLines(connectionObjs, mapType = 'TrueCoordinates', opacity = 0.5) {
  const positions = [];
  const colors = [];

  connectionObjs.forEach(pair => {
    const { starA, starB } = pair;
    let posA;
    let posB;
    if (mapType === 'Globe') {
      posA = starA.spherePosition;
      posB = starB.spherePosition;
    } else if (mapType === 'Mollweide') {
      const segments = splitMollweideWrap(starA.mollweidePosition, starB.mollweidePosition);
      segments.forEach(([s1, s2]) => {
        positions.push(s1.x, s1.y, s1.z, s2.x, s2.y, s2.z);
        const cA = new THREE.Color(starA.displayColor || '#ffffff');
        const cB = new THREE.Color(starB.displayColor || '#ffffff');
        colors.push(cA.r, cA.g, cA.b, cB.r, cB.g, cB.b);
      });
      return;
    } else {
      posA = getPosition(starA);
      posB = getPosition(starB);
    }

    positions.push(posA.x, posA.y, posA.z);
    positions.push(posB.x, posB.y, posB.z);
    const cA = new THREE.Color(starA.displayColor || '#ffffff');
    const cB = new THREE.Color(starB.displayColor || '#ffffff');
    colors.push(cA.r, cA.g, cA.b, cB.r, cB.g, cB.b);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity,
    linewidth: 1
  });

  return new THREE.LineSegments(geometry, material);
}

export function createMollweideConnectionSegments(pairs, opacity = 0.5) {
  const segCount = pairs.length * GC_SEGMENTS * 2;
  const positions = new Float32Array(segCount * 2 * 3);
  const colors = new Float32Array(segCount * 2 * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity,
    linewidth: 1
  });
  const lineSegs = new THREE.LineSegments(geometry, material);
  lineSegs.userData = { pairs, segments: GC_SEGMENTS };
  updateMollweideConnectionSegments(lineSegs);
  return lineSegs;
}

export function updateMollweideConnectionSegments(lineSegs) {
  const pairs = lineSegs.userData.pairs || [];
  const segsCount = lineSegs.userData.segments || GC_SEGMENTS;
  const posAttr = lineSegs.geometry.getAttribute('position');
  const colorAttr = lineSegs.geometry.getAttribute('color');
  let idx = 0;
  pairs.forEach(pair => {
    const p1 = pair.starA.spherePosition;
    const p2 = pair.starB.spherePosition;
    if (!p1 || !p2) return;
    const pts = greatCircleToMollweide(p1, p2, 100, segsCount, getMollweideLambda0());
    const cA = new THREE.Color(pair.starA.displayColor || '#ffffff');
    const cB = new THREE.Color(pair.starB.displayColor || '#ffffff');
    for (let j = 0; j < pts.length - 1; j++) {
      const segs = splitMollweideWrap(pts[j], pts[j + 1]);
      segs.forEach(([s, e]) => {
        if (idx + 6 > posAttr.array.length) return;
        posAttr.array[idx] = s.x;
        posAttr.array[idx + 1] = s.y;
        posAttr.array[idx + 2] = s.z;
        posAttr.array[idx + 3] = e.x;
        posAttr.array[idx + 4] = e.y;
        posAttr.array[idx + 5] = e.z;
        const t1 = j / (pts.length - 1);
        const t2 = (j + 1) / (pts.length - 1);
        colorAttr.array[idx] = THREE.MathUtils.lerp(cA.r, cB.r, t1);
        colorAttr.array[idx + 1] = THREE.MathUtils.lerp(cA.g, cB.g, t1);
        colorAttr.array[idx + 2] = THREE.MathUtils.lerp(cA.b, cB.b, t1);
        colorAttr.array[idx + 3] = THREE.MathUtils.lerp(cA.r, cB.r, t2);
        colorAttr.array[idx + 4] = THREE.MathUtils.lerp(cA.g, cB.g, t2);
        colorAttr.array[idx + 5] = THREE.MathUtils.lerp(cA.b, cB.b, t2);
        idx += 6;
      });
    }
  });
  for (; idx < posAttr.array.length; idx++) {
    posAttr.array[idx] = 0;
    colorAttr.array[idx] = 0;
  }
  posAttr.needsUpdate = true;
  colorAttr.needsUpdate = true;
  lineSegs.computeLineDistances();
}

export function createConnectionLines(stars, pairs, mapType, opacityFactor = 0.5) {
  if (!pairs || pairs.length === 0) return [];

  const distances = pairs.map(p => p.distance);
  const largestPairDistance = Math.max(...distances);
  const smallestPairDistance = Math.min(...distances);
  const lines = [];

  pairs.forEach(pair => {
    const { starA, starB, distance } = pair;
    let posA;
    let posB;
    const c1 = new THREE.Color(starA.displayColor || '#ffffff');
    const c2 = new THREE.Color(starB.displayColor || '#ffffff');
    if (mapType === 'Globe') {
      if (!starA.spherePosition || !starB.spherePosition) return;
      posA = new THREE.Vector3(starA.spherePosition.x, starA.spherePosition.y, starA.spherePosition.z);
      posB = new THREE.Vector3(starB.spherePosition.x, starB.spherePosition.y, starB.spherePosition.z);
    } else if (mapType === 'Mollweide') {
      if (!starA.mollweidePosition || !starB.mollweidePosition) return;
      const normDist = (distance - smallestPairDistance) / (largestPairDistance - smallestPairDistance || 1);
      const width = THREE.MathUtils.lerp(connectionMaxWidth, 1, normDist);
      const opacity = THREE.MathUtils.lerp(1.0, 0.3, normDist) * opacityFactor;
      const segments = splitMollweideWrap(starA.mollweidePosition, starB.mollweidePosition);
      const group = new THREE.Group();
      segments.forEach(([s1, s2]) => {
        const pts = [s1, s2];
        const geom = buildWideLineGeometry(pts, width);
        const mat = createWideLineMaterial(c1.clone().lerp(c2, 0.5));
        mat.uniforms.opacityFactor.value = opacity;
        mat.uniforms.fadePower.value = connectionFadePower;
        const mesh = new THREE.Mesh(geom, mat);
        mesh.renderOrder = 3;
        mesh.userData = { baseWidth: width, points: pts };
        group.add(mesh);
      });

      let totalLen = 0;
      const segLens = segments.map(([a, b]) => {
        const len = a.clone().sub(b).length();
        totalLen += len;
        return len;
      });
      let acc = 0;
      let mid = segments[0][0].clone();
      let tangent = new THREE.Vector3(1, 0, 0);
      const halfLen = totalLen / 2;
      for (let i = 0; i < segments.length; i++) {
        const [a, b] = segments[i];
        const len = segLens[i];
        if (acc + len >= halfLen) {
          const t = (halfLen - acc) / (len || 1);
          mid = a.clone().lerp(b, t);
          tangent = b.clone().sub(a);
          break;
        }
        acc += len;
      }
      let rot = Math.atan2(tangent.y, tangent.x);
      if (rot > Math.PI / 2) rot -= Math.PI;
      if (rot < -Math.PI / 2) rot += Math.PI;

      const distanceText = `${distance < 10 ? distance.toFixed(1) : distance.toFixed(0)} ly`;
      const baseFontSize = 72;
      const fontSize = baseFontSize * connectionLabelSize;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.font = `${fontSize}px Oswald`;
      const metrics = ctx.measureText(distanceText);
      const padX = 10;
      const padY = 5;
      canvas.width = metrics.width + padX * 2;
      canvas.height = fontSize + padY * 2;
      ctx.font = `${fontSize}px Oswald`;
      const labelColor = c1.clone().lerp(c2, 0.5);
      ctx.fillStyle = `#${labelColor.getHexString()}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(distanceText, padX, canvas.height / 2);
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        depthWrite: true,
        depthTest: true,
        transparent: true,
        opacity
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.renderOrder = 5;
      sprite.scale.set(canvas.width / 100, canvas.height / 100, 1);
      sprite.position.copy(mid);
      sprite.material.rotation = rot;
      group.add(sprite);

      lines.push(group);
      return;
    } else {
      posA = getPosition(starA).clone();
      posB = getPosition(starB).clone();
    }

    const gradientColor = c1.clone().lerp(c2, 0.5);
    const normDist = (distance - smallestPairDistance) / (largestPairDistance - smallestPairDistance || 1);
    const lineThickness = THREE.MathUtils.lerp(connectionMaxWidth, 1, normDist);
    const lineOpacity = THREE.MathUtils.lerp(1.0, 0.3, normDist) * opacityFactor;

    let points;
    if (mapType === 'Globe') {
      const curve = new THREE.CatmullRomCurve3(getGreatCirclePoints(posA, posB, 100, 32));
      points = curve.getPoints(32);
    } else {
      points = [posA, posB];
    }

    const geometryLine = new THREE.BufferGeometry().setFromPoints(points);
    const materialLine = new THREE.LineBasicMaterial({
      color: gradientColor,
      transparent: true,
      opacity: lineOpacity,
      linewidth: lineThickness
    });
    const line = new THREE.Line(geometryLine, materialLine);
    line.userData = { baseLineWidth: lineThickness };
    if (mapType === 'Globe') {
      line.renderOrder = 1;
    } else if (mapType === 'Mollweide') {
      line.renderOrder = 3;
    }
    lines.push(line);
  });
  return lines;
}
