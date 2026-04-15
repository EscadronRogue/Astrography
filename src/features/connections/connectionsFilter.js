// filters/connectionsFilter.js

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { splitMollweideWrap, greatCircleToMollweide, getMollweideLambda0 } from '../../shared/geometryUtils.js';
import { createWideLineMaterial, buildWideLineGeometry } from '../../render/engine/renderUtils.js';
import { getStarTruePosition } from '../../shared/starUtils.js';
import { GLOBE_RADIUS, DEFAULT_STAR_COLOR } from '../../shared/constants.js';
import { getConnectionLineParams, setConnectionLineParams } from './connectionSettings.js';

const GC_SEGMENTS = 32;
const STAR_POSITION_CACHE_KEY = Symbol('connectionPositionCache');

function getPosition(star) {
  if (star[STAR_POSITION_CACHE_KEY]) {
    return star[STAR_POSITION_CACHE_KEY];
  }
  const position = getStarTruePosition(star);
  star[STAR_POSITION_CACHE_KEY] = position;
  return position;
}

function getGridKey(position, cellSize) {
  return [
    Math.floor(position.x / cellSize),
    Math.floor(position.y / cellSize),
    Math.floor(position.z / cellSize)
  ].join(',');
}

/**
 * Computes connection pairs between stars that are within maxDistance.
 * Uses a uniform spatial hash to avoid the prior O(n²) all-pairs scan.
 */
export function computeConnectionPairs(stars, maxDistance) {
  if (!Array.isArray(stars) || stars.length < 2 || !(maxDistance > 0)) {
    return [];
  }

  const pairs = [];
  const cellSize = maxDistance;
  const spatialGrid = new Map();
  const preparedStars = stars.map(star => ({ star, position: getPosition(star) }));

  preparedStars.forEach(entry => {
    const key = getGridKey(entry.position, cellSize);
    let bucket = spatialGrid.get(key);
    if (!bucket) {
      bucket = [];
      spatialGrid.set(key, bucket);
    }
    bucket.push(entry);
  });

  const neighborOffsets = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        neighborOffsets.push([dx, dy, dz]);
      }
    }
  }

  const visitedBuckets = new Set();
  for (const [key, bucket] of spatialGrid.entries()) {
    const [ix, iy, iz] = key.split(',').map(Number);
    for (const [dx, dy, dz] of neighborOffsets) {
      const neighborKey = `${ix + dx},${iy + dy},${iz + dz}`;
      const neighborBucket = spatialGrid.get(neighborKey);
      if (!neighborBucket) continue;

      const pairBucketKey = key < neighborKey ? `${key}|${neighborKey}` : `${neighborKey}|${key}`;
      if (visitedBuckets.has(pairBucketKey)) continue;
      visitedBuckets.add(pairBucketKey);

      for (let i = 0; i < bucket.length; i++) {
        const startJ = key === neighborKey ? i + 1 : 0;
        for (let j = startJ; j < neighborBucket.length; j++) {
          const starA = bucket[i];
          const starB = neighborBucket[j];
          const distance = starA.position.distanceTo(starB.position);
          if (distance > 0 && distance <= maxDistance) {
            pairs.push({ starA: starA.star, starB: starB.star, distance });
          }
        }
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
    let posA, posB;
    if (mapType === 'Globe') {
      posA = starA.spherePosition;
      posB = starB.spherePosition;
    } else if (mapType === 'Mollweide') {
      const segments = splitMollweideWrap(
        starA.mollweidePosition,
        starB.mollweidePosition
      );
      segments.forEach(([s1, s2]) => {
        positions.push(s1.x, s1.y, s1.z, s2.x, s2.y, s2.z);
        const cA = new THREE.Color(starA.displayColor || DEFAULT_STAR_COLOR);
        const cB = new THREE.Color(starB.displayColor || DEFAULT_STAR_COLOR);
        colors.push(cA.r, cA.g, cA.b, cB.r, cB.g, cB.b);
      });
      return;
    } else {
      posA = getPosition(starA);
      posB = getPosition(starB);
    }
    if (!posA || !posB) return;
    positions.push(posA.x, posA.y, posA.z);
    positions.push(posB.x, posB.y, posB.z);

    const cA = new THREE.Color(starA.displayColor || DEFAULT_STAR_COLOR);
    const cB = new THREE.Color(starB.displayColor || DEFAULT_STAR_COLOR);
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
    const pts = greatCircleToMollweide(p1, p2, GLOBE_RADIUS, segsCount, getMollweideLambda0());
    const cA = new THREE.Color(pair.starA.displayColor || DEFAULT_STAR_COLOR);
    const cB = new THREE.Color(pair.starB.displayColor || DEFAULT_STAR_COLOR);
    for (let j = 0; j < pts.length - 1; j++) {
      const segs = splitMollweideWrap(pts[j], pts[j + 1]);
      segs.forEach(([s, e]) => {
        if (idx + 6 > posAttr.array.length) return;
        posAttr.array[idx] = s.x; posAttr.array[idx + 1] = s.y; posAttr.array[idx + 2] = s.z;
        posAttr.array[idx + 3] = e.x; posAttr.array[idx + 4] = e.y; posAttr.array[idx + 5] = e.z;
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
    let posA, posB;
    const c1 = new THREE.Color(starA.displayColor || DEFAULT_STAR_COLOR);
    const c2 = new THREE.Color(starB.displayColor || DEFAULT_STAR_COLOR);
    if (mapType === 'Globe') {
      if (!starA.spherePosition || !starB.spherePosition) return;
      posA = starA.spherePosition.clone();
      posB = starB.spherePosition.clone();
    } else if (mapType === 'Mollweide') {
      if (!starA.mollweidePosition || !starB.mollweidePosition) return;
      const normDist = (distance - smallestPairDistance) / (largestPairDistance - smallestPairDistance || 1);
      const width = THREE.MathUtils.lerp(getConnectionLineParams().connectionMaxWidth, 1, normDist);
      const opacity = THREE.MathUtils.lerp(1.0, 0.3, normDist) * opacityFactor;
      const segments = splitMollweideWrap(
        starA.mollweidePosition,
        starB.mollweidePosition
      );
      const group = new THREE.Group();
      segments.forEach(([s1, s2]) => {
        const pts = [s1, s2];
        const geom = buildWideLineGeometry(pts, width);
        const mat = createWideLineMaterial(c1.clone().lerp(c2, 0.5));
        mat.uniforms.opacityFactor.value = opacity;
        mat.uniforms.fadePower.value = getConnectionLineParams().connectionFadePower;
        const mesh = new THREE.Mesh(geom, mat);
        mesh.renderOrder = 3;
        mesh.userData = { baseWidth: width, points: pts };
        group.add(mesh);
      });

      let totalLen = 0;
      const segLens = segments.map(([a, b]) => {
        const len = a.distanceTo(b);
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
      if (!ctx) return;
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
        opacity,
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
    const lineThickness = THREE.MathUtils.lerp(getConnectionLineParams().connectionMaxWidth, 1, normDist);
    const lineOpacity = THREE.MathUtils.lerp(1.0, 0.3, normDist) * opacityFactor;

    let points;
    if (mapType === 'Globe') {
      const curve = new THREE.CatmullRomCurve3(getGreatCirclePoints(posA, posB, GLOBE_RADIUS, 32));
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

function getGreatCirclePoints(p1, p2, R, segments) {
  const points = [];
  const start = p1.clone().normalize().multiplyScalar(R);
  const end = p2.clone().normalize().multiplyScalar(R);
  const axis = new THREE.Vector3().crossVectors(start, end).normalize();
  const angle = start.angleTo(end);
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * angle;
    const quaternion = new THREE.Quaternion().setFromAxisAngle(axis, theta);
    const point = start.clone().applyQuaternion(quaternion);
    points.push(point);
  }
  return points;
}

export { createWideLineMaterial, buildWideLineGeometry };
