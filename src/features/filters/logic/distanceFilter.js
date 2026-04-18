/**
 * @file Filters stars by distance range from the current viewpoint.
 * When the viewpoint is Sol (default), star.viewpointDistance equals
 * the original star.distance.  When viewing from another star,
 * viewpointDistance is the Euclidean distance to that star.
 */

/**
 * Filters stars to only include those within the specified distance range
 * from the current viewpoint.
 * @param {Array} stars - Array of star objects with `viewpointDistance` (or `distance` fallback).
 * @param {Object} filters - Filter state with minDistance and maxDistance.
 * @returns {Array} Filtered array of stars within range.
 */
export function applyDistanceFilter(stars, filters) {
  const minDist = filters.minDistance ?? 0;
  const maxDist = filters.maxDistance ?? 20;
  return stars.filter(star => {
    const d = star.viewpointDistance ?? star.distance;
    return Number.isFinite(d) && d >= minDist && d <= maxDist;
  });
}
