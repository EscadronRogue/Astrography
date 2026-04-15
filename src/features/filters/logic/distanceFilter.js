/**
 * @file Filters stars by distance range from the Sun.
 */

/**
 * Filters stars to only include those within the specified distance range.
 * @param {Array} stars - Array of star objects with a `distance` property.
 * @param {Object} filters - Filter state with minDistance and maxDistance.
 * @returns {Array} Filtered array of stars within range.
 */
export function applyDistanceFilter(stars, filters) {
  const minDist = filters.minDistance ?? 0;
  const maxDist = filters.maxDistance ?? 20;
  return stars.filter(star =>
    Number.isFinite(star.distance) && star.distance >= minDist && star.distance <= maxDist
  );
}
