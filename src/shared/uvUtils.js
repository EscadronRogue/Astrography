import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { GLOBE_RADIUS } from './constants.js';
import { getStarCoordinates } from './starUtils.js';

export const EQUIRECT_WIDTH = 200;
export const EQUIRECT_HEIGHT = 100;

export function normalizeRightAscension(ra) {
  const tau = Math.PI * 2;
  return ((ra % tau) + tau) % tau;
}

export function raDecToUV(ra, dec) {
  const safeDec = THREE.MathUtils.clamp(dec, -Math.PI / 2, Math.PI / 2);
  return {
    u: normalizeRightAscension(ra) / (Math.PI * 2),
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
  const ra = normalizeRightAscension(Math.atan2(n.z, n.x));
  const dec = Math.asin(THREE.MathUtils.clamp(n.y / radius, -1, 1));
  return raDecToUV(ra, dec);
}
