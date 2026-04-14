/**
 * @file Filters stars by apparent magnitude (naked-eye visibility).
 */
import { NAKED_EYE_MAGNITUDE_LIMIT } from '../shared/constants.js';

/**
 * Filters stars to those visible to the naked eye when 'visible' mode is selected.
 * @param {Array} stars - Array of star objects with apparentMagnitude property.
 * @param {Object} filters - Filter state with starsShown and visibleMagnitudeLimit.
 * @returns {Array} Filtered (or original) array of stars.
 */
export function applyStarsShownFilter(stars, filters) {
  if (filters.starsShown !== 'visible') {
    return stars;
  }
  const limit = Number.isFinite(Number(filters.visibleMagnitudeLimit))
    ? Number(filters.visibleMagnitudeLimit)
    : NAKED_EYE_MAGNITUDE_LIMIT;
  return stars.filter(star =>
    Number.isFinite(star.apparentMagnitude) && star.apparentMagnitude <= limit
  );
}
