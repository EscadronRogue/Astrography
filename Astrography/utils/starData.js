import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { degToRad } from './geometryUtils.js';

export function getStableStarId(star) {
  return (
    star.id ||
    star.Common_name_of_the_star ||
    star.Common_name_of_the_star_system ||
    star.HD ||
    `${star.RA_in_degrees ?? star.RA_in_radian ?? 0}_${star.DEC_in_degrees ?? star.DEC_in_radian ?? 0}_${star.Distance_from_the_Sun ?? star.distance ?? 0}`
  );
}

export function getNormalizedRaDec(star) {
  if (Number.isFinite(star.raRad) && Number.isFinite(star.decRad)) {
    return { ra: star.raRad, dec: star.decRad };
  }

  if (Number.isFinite(star.RA_in_radian) && Number.isFinite(star.DEC_in_radian)) {
    return { ra: star.RA_in_radian, dec: star.DEC_in_radian };
  }

  if (Number.isFinite(star.RA_in_degrees) && Number.isFinite(star.DEC_in_degrees)) {
    return { ra: degToRad(star.RA_in_degrees), dec: degToRad(star.DEC_in_degrees) };
  }

  return { ra: 0, dec: 0 };
}

export function getNormalizedDistance(star) {
  const distance = star.distance ?? star.Distance_from_the_Sun ?? 0;
  return Number.isFinite(distance) ? distance : 0;
}

export function getStarVector(star) {
  if (star.truePosition instanceof THREE.Vector3) {
    return star.truePosition.clone();
  }
  if (Number.isFinite(star.x_coordinate) && Number.isFinite(star.y_coordinate) && Number.isFinite(star.z_coordinate)) {
    return new THREE.Vector3(star.x_coordinate, star.y_coordinate, star.z_coordinate);
  }
  const { ra, dec } = getNormalizedRaDec(star);
  const R = getNormalizedDistance(star);
  return new THREE.Vector3(
    -R * Math.cos(dec) * Math.cos(ra),
    R * Math.sin(dec),
    -R * Math.cos(dec) * Math.sin(ra)
  );
}

export function normalizeStarRecord(star) {
  const { ra, dec } = getNormalizedRaDec(star);
  const distance = getNormalizedDistance(star);
  return {
    ...star,
    id: getStableStarId(star),
    raRad: ra,
    decRad: dec,
    distance,
    Distance_from_the_Sun: distance,
    displayName: star.displayName || star.Common_name_of_the_star || star.Common_name_of_the_star_system || star.HD || 'Unnamed object'
  };
}
