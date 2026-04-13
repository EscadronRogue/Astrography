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
    const recognizedClasses = new Set(['O','B','A','F','G','K','M','L','T','Y']);
    stars.forEach(star => {
      let primaryClass = 'Other';
      if (star.Stellar_class && typeof star.Stellar_class === 'string') {
        const candidate = star.Stellar_class.charAt(0).toUpperCase();
        primaryClass = recognizedClasses.has(candidate) ? candidate : 'Other';
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

  const recognizedClasses = new Set(['O','B','A','F','G','K','M','L','T','Y']);
  stars.forEach(star => {
    let primaryClass = 'Other';
    if (star.Stellar_class && typeof star.Stellar_class === 'string') {
      const candidate = star.Stellar_class.charAt(0).toUpperCase();
      primaryClass = recognizedClasses.has(candidate) ? candidate : 'Other';
    }
    const starSize =
      filters.stellarClassStarSizes && filters.stellarClassStarSizes[primaryClass];
    if (starSize !== undefined && !isNaN(starSize)) {
      star.displaySize = starSize;
    }
    const labelSize =
      filters.stellarClassLabelSizes && filters.stellarClassLabelSizes[primaryClass];
    if (labelSize !== undefined && !isNaN(labelSize)) {
      star.displayLabelSize = labelSize;
    } else {
      star.displayLabelSize = star.displaySize;
    }
  });

  return stars;
}
