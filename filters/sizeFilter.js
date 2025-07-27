// filters/sizeFilter.js

import { getStellarClassData } from './stellarClassData.js';

/**
 * Applies size-related filters to the given stars array.
 * @param {Array} stars - The array of star objects.
 * @param {Object} filters - The overall filter object.
 * @returns {Array} - The updated array of stars.
 */
export function applySizeFilter(stars, filters) {
  // We'll get the loaded stellar class data
  const stellarClassData = getStellarClassData();

  if (filters.size === 'distance') {
    // Distance to the sun: smaller distance => bigger star
    const minDistance = Math.min(...stars.map(s => s.Distance_from_the_Sun));
    const maxDistance = Math.max(...stars.map(s => s.Distance_from_the_Sun));

    stars.forEach(star => {
      // Invert distance: closer stars are larger
      star.displaySize =
        5 * (maxDistance - star.Distance_from_the_Sun) / (maxDistance - minDistance + 1) + 1;
    });
  } else if (filters.size === 'stellar-class') {
    // Map class to size from stellarClassData
    stars.forEach(star => {
      let primaryClass = 'G';
      if (star.Stellar_class && typeof star.Stellar_class === 'string') {
        primaryClass = star.Stellar_class.charAt(0).toUpperCase();
      }

      const classData = stellarClassData[primaryClass];
      star.displaySize = classData ? classData.size : 1;
    });
  } else {
    // Default if no recognized size filter
    stars.forEach(star => {
      if (typeof star.displaySize === 'undefined') {
        star.displaySize = 2;
      }
    });
  }

  // Apply class size multipliers
  stars.forEach(star => {
    let primaryClass = 'G';
    if (star.Stellar_class && typeof star.Stellar_class === 'string') {
      primaryClass = star.Stellar_class.charAt(0).toUpperCase();
    }
    const starMult =
      filters.stellarClassStarSizes && filters.stellarClassStarSizes[primaryClass];
    if (starMult) {
      star.displaySize *= starMult;
    }
    star.displayLabelSize = star.displaySize;
    const labelMult =
      filters.stellarClassLabelSizes && filters.stellarClassLabelSizes[primaryClass];
    if (labelMult) {
      star.displayLabelSize *= labelMult;
    }
  });

  return stars;
}
