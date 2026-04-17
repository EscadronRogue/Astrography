// filters/sizeFilter.js

import { getStellarClassData } from './stellarClassData.js';
import { getPrimaryClass } from '../../../shared/stellarClassUtils.js';
import { DISTANCE_SIZE_SCALE } from '../../../shared/constants.js';

function getDefaultClassSize(stellarClassData, primaryClass) {
  return stellarClassData[primaryClass]?.size ?? stellarClassData.Other?.size ?? 1;
}

function hasManualSizeOverride(value, defaultValue) {
  return Number.isFinite(value) && Math.abs(value - defaultValue) > 1e-6;
}

function computeDistanceSize(distance, distMin, distMax) {
  if (!Number.isFinite(distance)) return 1;
  const range = distMax - distMin;
  if (!(range > 0)) return DISTANCE_SIZE_SCALE + 1;
  return DISTANCE_SIZE_SCALE * ((distMax - distance) / range) + 1;
}

/**
 * Applies size-related filters to the given stars array.
 * Handles size-by-distance, size-by-stellar-class, and per-class overrides in a single pass.
 * @param {Array} stars - The array of star objects.
 * @param {Object} filters - The overall filter object.
 * @returns {Array} - The updated array of stars.
 */
export function applySizeFilter(stars, filters) {
  const stellarClassData = getStellarClassData();

  // Pre-compute distance range if needed
  let distMin, distMax;
  if (filters.size === 'distance') {
    const distances = stars.map(s => s.distance).filter(Number.isFinite);
    distMin = Math.min(...distances);
    distMax = Math.max(...distances);
  }

  stars.forEach(star => {
    const primaryClass = getPrimaryClass(star);
    const defaultClassSize = getDefaultClassSize(stellarClassData, primaryClass);

    // 1) Base size from selected mode
    if (filters.size === 'distance') {
      star.displaySize = computeDistanceSize(star.distance, distMin, distMax);
    } else if (filters.size === 'stellar-class') {
      star.displaySize = defaultClassSize;
    } else if (typeof star.displaySize === 'undefined') {
      star.displaySize = 2;
    }

    // 2) Per-class overrides (from stellar class UI sliders)
    const starSize = filters.stellarClassStarSizes?.[primaryClass];
    if (filters.size === 'stellar-class' && hasManualSizeOverride(starSize, defaultClassSize)) {
      star.displaySize = starSize;
    }

    const labelSize = filters.stellarClassLabelSizes?.[primaryClass];
    if (hasManualSizeOverride(labelSize, defaultClassSize)) {
      star.displayLabelSize = labelSize;
    } else {
      star.displayLabelSize = star.displaySize;
    }
  });

  return stars;
}
