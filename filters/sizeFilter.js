// filters/sizeFilter.js

import { getStellarClassData } from './stellarClassData.js';
import { getPrimaryClass } from '../shared/stellarClassUtils.js';
import { DISTANCE_SIZE_SCALE } from '../shared/constants.js';
import { getStarDistance } from '../shared/starUtils.js';

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
  let minDistance, maxDistance;
  if (filters.size === 'distance') {
    const distances = stars.map(star => getStarDistance(star)).filter(Number.isFinite);
    minDistance = distances.length > 0 ? Math.min(...distances) : 0;
    maxDistance = distances.length > 0 ? Math.max(...distances) : minDistance;
  }

  stars.forEach(star => {
    const primaryClass = getPrimaryClass(star);

    // 1) Base size from selected mode
    if (filters.size === 'distance') {
      const distance = getStarDistance(star, maxDistance);
      star.displaySize =
        DISTANCE_SIZE_SCALE * (maxDistance - distance) / (maxDistance - minDistance + 1) + 1;
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
