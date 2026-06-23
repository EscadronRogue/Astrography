import * as THREE from '../vendor/three.js';
import { cachedRadToSphere, cachedRadToMollweide, degToRad } from './geometryUtils.js';
import { GLOBE_RADIUS, MOLLWEIDE_MAX_ITERATIONS, EPSILON, SOL_STAR_NAME } from './constants.js';

export function getStarId(star) {
  return (
    star.starId ||
    star.Common_name_of_the_star ||
    star.Common_name_of_the_star_system ||
    star.HD ||
    `${star.RA_in_degrees}_${star.DEC_in_degrees}`
  );
}

export function isSolStar(star) {
  if (!star) return false;
  return (
    star.Common_name_of_the_star === SOL_STAR_NAME ||
    star.Common_name_of_the_star_system === SOL_STAR_NAME ||
    getStarId(star) === SOL_STAR_NAME
  );
}

export function getStarCoordinates(star) {
  // When viewing from a non-Sol viewpoint, reprojectAllStars() stores the
  // apparent RA/DEC as seen from the viewpoint star.  Prefer these so that
  // all downstream projections (UV map, equirect, etc.) use the viewpoint
  // frame rather than the original heliocentric coordinates.
  if (star._apparentRA !== undefined && star._apparentDec !== undefined) {
    return { ra: star._apparentRA, dec: star._apparentDec };
  }
  if (star.RA_in_radian !== undefined && star.DEC_in_radian !== undefined) {
    return { ra: star.RA_in_radian, dec: star.DEC_in_radian };
  }
  if (star.RA_in_degrees !== undefined && star.DEC_in_degrees !== undefined) {
    return {
      ra: degToRad(star.RA_in_degrees),
      dec: degToRad(star.DEC_in_degrees)
    };
  }
  return { ra: 0, dec: 0 };
}

export function getStarDistance(star, fallback = 0) {
  return Number.isFinite(star.distance) ? star.distance : fallback;
}

export function getStarTruePosition(star) {
  if (star.truePosition) {
    return star.truePosition.clone ? star.truePosition.clone() : star.truePosition;
  }
  if (
    star.x_coordinate !== undefined &&
    star.y_coordinate !== undefined &&
    star.z_coordinate !== undefined
  ) {
    return new THREE.Vector3(star.x_coordinate, star.y_coordinate, star.z_coordinate);
  }
  const { ra, dec } = getStarCoordinates(star);
  return cachedRadToSphere(ra, dec, getStarDistance(star));
}

export function getStarGlobePosition(star, radius = GLOBE_RADIUS) {
  if (star.spherePosition && radius === GLOBE_RADIUS) {
    return star.spherePosition.clone ? star.spherePosition.clone() : star.spherePosition;
  }
  const { ra, dec } = getStarCoordinates(star);
  return cachedRadToSphere(ra, dec, radius);
}

export function getStarMollweidePosition(star, radius = GLOBE_RADIUS) {
  if (star.mollweidePosition && radius === GLOBE_RADIUS) {
    return star.mollweidePosition.clone ? star.mollweidePosition.clone() : star.mollweidePosition;
  }
  const { ra, dec } = getStarCoordinates(star);
  return cachedRadToMollweide(ra, dec, radius);
}

export function precalcMollweideData(star, radius = GLOBE_RADIUS) {
  const { ra, dec } = getStarCoordinates(star);
  star.raRad = ra;
  star.decRad = dec;
  let theta = dec;
  for (let i = 0; i < MOLLWEIDE_MAX_ITERATIONS; i++) {
    const delta = (2 * theta + Math.sin(2 * theta) - Math.PI * Math.sin(dec)) /
      (2 + 2 * Math.cos(2 * theta));
    theta -= delta;
    if (Math.abs(delta) < EPSILON) break;
  }
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  star.mollXFactor = (2 * radius / Math.PI) * cosT;
  star.mollY = radius * sinT;
}
