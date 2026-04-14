/**
 * @file Shared utilities for stellar class extraction and classification.
 * Eliminates duplicate stellar class parsing from sizeFilter.js, colorFilter.js,
 * stellarClassFilter.js, and connectionsFilter.js.
 */
import { STELLAR_CLASS_SET } from './constants.js';

/**
 * Extracts the primary spectral class letter from a star's Stellar_class field.
 * Returns 'Other' for unrecognized or missing classes.
 * @param {Object} star - Star object with optional Stellar_class property.
 * @returns {string} Single uppercase letter (O, B, A, F, G, K, M, L, T, Y) or 'Other'.
 */
export function getPrimaryClass(star) {
  if (star.Stellar_class && typeof star.Stellar_class === 'string') {
    const candidate = star.Stellar_class.charAt(0).toUpperCase();
    return STELLAR_CLASS_SET.has(candidate) ? candidate : 'Other';
  }
  return 'Other';
}

/**
 * Groups an array of stars by their primary spectral class.
 * @param {Array} stars - Array of star objects.
 * @returns {Object<string, Array>} Map from class letter (or 'Other') to array of stars.
 */
export function groupStarsByClass(stars) {
  const classMap = {};
  stars.forEach(star => {
    const cls = getPrimaryClass(star);
    if (!classMap[cls]) classMap[cls] = [];
    classMap[cls].push(star);
  });
  return classMap;
}
