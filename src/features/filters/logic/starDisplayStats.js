import { EPSILON } from '../../../shared/constants.js';

export function needsDisplayStats(filters) {
  return filters?.size === 'distance' ||
    filters?.color === 'galactic-plane' ||
    filters?.opacity === 'absolute-magnitude';
}

export function computeDisplayStats(stars) {
  const stats = {
    distanceMin: Infinity,
    distanceMax: -Infinity,
    maxAbsZ: EPSILON,
    absoluteMagnitudeMin: Infinity,
    absoluteMagnitudeMax: -Infinity
  };

  for (let index = 0; index < stars.length; index += 1) {
    const star = stars[index];
    const distance = star.distance;
    if (Number.isFinite(distance)) {
      if (distance < stats.distanceMin) stats.distanceMin = distance;
      if (distance > stats.distanceMax) stats.distanceMax = distance;
    }

    const absZ = Math.abs(Number.isFinite(star.z_coordinate) ? star.z_coordinate : 0);
    if (absZ > stats.maxAbsZ) stats.maxAbsZ = absZ;

    const magnitude = star.absoluteMagnitude;
    if (Number.isFinite(magnitude)) {
      if (magnitude < stats.absoluteMagnitudeMin) stats.absoluteMagnitudeMin = magnitude;
      if (magnitude > stats.absoluteMagnitudeMax) stats.absoluteMagnitudeMax = magnitude;
    }
  }

  if (stats.distanceMin === Infinity) {
    stats.distanceMin = 0;
    stats.distanceMax = 0;
  }

  return stats;
}
