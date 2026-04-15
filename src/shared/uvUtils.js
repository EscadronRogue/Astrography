import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { GLOBE_RADIUS } from './constants.js';
import { getStarCoordinates } from './starUtils.js';
import { getGreatCirclePoints, radToSphere, vectorToRaDecRad } from './geometryUtils.js';

export const EQUIRECT_WIDTH = 200;
export const EQUIRECT_HEIGHT = 100;
const TAU = Math.PI * 2;

export function normalizeRightAscension(ra) {
  return ((ra % TAU) + TAU) % TAU;
}

export function raDecToUV(ra, dec) {
  const safeDec = THREE.MathUtils.clamp(dec, -Math.PI / 2, Math.PI / 2);
  return {
    u: normalizeRightAscension(ra) / TAU,
    v: 1 - ((safeDec + Math.PI / 2) / Math.PI)
  };
}

export function getStarEquirectangularPosition(star, width = EQUIRECT_WIDTH, height = EQUIRECT_HEIGHT) {
  if (star.equirectPosition && width === EQUIRECT_WIDTH && height === EQUIRECT_HEIGHT) {
    return star.equirectPosition.clone ? star.equirectPosition.clone() : star.equirectPosition;
  }
  const { ra, dec } = getStarCoordinates(star);
  const { u, v } = raDecToUV(ra, dec);
  return new THREE.Vector3((u - 0.5) * width, (0.5 - v) * height, 0);
}

export function getStarUv(star) {
  const { ra, dec } = getStarCoordinates(star);
  return raDecToUV(ra, dec);
}

export function spherePositionToUv(position, radius = GLOBE_RADIUS) {
  const n = position.clone().normalize().multiplyScalar(radius);
  const ra = normalizeRightAscension(Math.atan2(-n.z, -n.x));
  const dec = Math.asin(THREE.MathUtils.clamp(n.y / radius, -1, 1));
  return raDecToUV(ra, dec);
}

export function unwrapUvAroundReference(referenceU, candidateU) {
  let u = candidateU;
  while (u - referenceU > 0.5) u -= 1;
  while (u - referenceU < -0.5) u += 1;
  return u;
}

export function unwrapUvSequence(points) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const unwrapped = [{ u: points[0].u, v: points[0].v }];
  for (let i = 1; i < points.length; i++) {
    const prev = unwrapped[i - 1];
    unwrapped.push({
      u: unwrapUvAroundReference(prev.u, points[i].u),
      v: points[i].v
    });
  }
  return unwrapped;
}

export function splitWrappedUvSegment(a, b) {
  const start = { u: a.u, v: a.v };
  const end = { u: unwrapUvAroundReference(start.u, b.u), v: b.v };
  if (Math.abs(end.u - start.u) <= 0.5) {
    return [[start, end]];
  }

  const boundary = end.u > start.u ? Math.floor(start.u + 1) : Math.ceil(start.u - 1);
  const denom = end.u - start.u;
  if (Math.abs(denom) < 1e-12) return [[start, end]];
  const t = (boundary - start.u) / denom;
  if (t <= 0 || t >= 1) return [[start, end]];
  const vEdge = THREE.MathUtils.lerp(start.v, end.v, t);
  return [
    [{ u: start.u, v: start.v }, { u: boundary, v: vEdge }],
    [{ u: boundary - Math.sign(denom), v: vEdge }, { u: end.u, v: end.v }]
  ];
}

export function sampleGreatCircleUvFromVectors(startVec, endVec, radius = GLOBE_RADIUS, segments = 32) {
  const points = getGreatCirclePoints(startVec, endVec, radius, segments);
  return unwrapUvSequence(points.map(point => spherePositionToUv(point, radius)));
}

export function sampleGreatCircleUvFromRaDec(ra1, dec1, ra2, dec2, radius = GLOBE_RADIUS, segments = 32) {
  const p1 = radToSphere(ra1, dec1, radius);
  const p2 = radToSphere(ra2, dec2, radius);
  return sampleGreatCircleUvFromVectors(p1, p2, radius, segments);
}

export function sampleGreatCircleUvFromSpherePoints(points, radius = GLOBE_RADIUS) {
  if (!Array.isArray(points) || points.length === 0) return [];
  return unwrapUvSequence(points.map(point => {
    const { ra, dec } = vectorToRaDecRad(point, radius);
    return raDecToUV(ra, dec);
  }));
}
