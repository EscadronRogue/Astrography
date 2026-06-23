/**
 * @file Applies opacity to stars based on fixed value or absolute magnitude.
 */
import { EPSILON, MIN_MAGNITUDE_OPACITY } from '../../../shared/constants.js';

/**
 * Sets displayOpacity on each star based on the selected opacity mode.
 * Supports fixed numeric opacity, absolute-magnitude scaling, or default (1.0).
 * @param {Array} stars - Array of star objects.
 * @param {Object} filters - Filter state with opacity mode/value.
 * @returns {Array} The same stars array with displayOpacity set.
 */
export function applyOpacityFilter(stars, filters, displayStats = null) {
  const fixedOpacity = Number.parseFloat(filters.opacity);

  if (Number.isFinite(fixedOpacity)) {
    const clamped = Math.max(0, Math.min(1, fixedOpacity));
    stars.forEach(star => { star.displayOpacity = clamped; });
    return stars;
  }

  if (filters.opacity === 'absolute-magnitude') {
    let minMag = displayStats?.absoluteMagnitudeMin ?? Infinity;
    let maxMag = displayStats?.absoluteMagnitudeMax ?? -Infinity;

    if (!displayStats) {
      for (let i = 0; i < stars.length; i++) {
        const m = stars[i].absoluteMagnitude;
        if (Number.isFinite(m)) {
          if (m < minMag) minMag = m;
          if (m > maxMag) maxMag = m;
        }
      }
    }

    if (minMag !== Infinity) {
      const range = Math.max(EPSILON, maxMag - minMag);

      stars.forEach(star => {
        if (Number.isFinite(star.absoluteMagnitude)) {
          const normalized = (star.absoluteMagnitude - minMag) / range;
          star.displayOpacity = Math.max(MIN_MAGNITUDE_OPACITY, 1.0 - normalized * (1.0 - MIN_MAGNITUDE_OPACITY));
        } else {
          star.displayOpacity = 1.0;
        }
      });
      return stars;
    }
  }

  // Default: full opacity
  stars.forEach(star => { star.displayOpacity = 1.0; });
  return stars;
}
