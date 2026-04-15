// filters/sizeFilter.js

import { getStellarClassData } from './stellarClassData.js';
import { getPrimaryClass } from '../shared/stellarClassUtils.js';
import { DISTANCE_SIZE_SCALE } from '../shared/constants.js';

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

    // 1) Base size from selected mode
    if (filters.size === 'distance') {
      const d = Number.isFinite(star.distance) ? star.distance : 0;
      star.displaySize =
        DISTANCE_SIZE_SCALE * (distMax - d) / (distMax - distMin + 1) + 1;
    } else if (filters.size === 'stellar-class') {
      const classData = stellarClassData[primaryClass];
      star.displaySize = classData ? classData.size : 1;
    } else if (typeof star.displaySize === 'undefined') {
      star.displaySize = 2;
    }

    // 2) Per-class overrides (from stellar class UI sliders)
    const starSize = filters.stellarClassStarSizes?.[primaryClass];
    if (starSize !== undefined && !isNaN(starSize)) {
      star.displaySize = starSize;
    }

    const labelSize = filters.stellarClassLabelSizes?.[primaryClass];
    if (labelSize !== undefined && !isNaN(labelSize)) {
      star.displayLabelSize = labelSize;
    } else {
      star.displayLabelSize = star.displaySize;
    }
  });

  return stars;
}
