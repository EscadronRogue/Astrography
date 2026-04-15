/**
 * @file Shared utilities for stellar class extraction and classification.
 * Eliminates duplicate stellar class parsing from sizeFilter.js, colorFilter.js,
 * stellarClassFilter.js, and connectionsFilter.js.
 */
import { STELLAR_CLASS_SET } from './constants.js';

const UNKNOWN_CLASS_TOKENS = new Set(['', '~', '?', 'UNKNOWN', 'N/A', 'NA', 'NONE', 'NULL']);
const STANDARD_CLASS_PATTERN = /[OBAFGKMLTY]/i;

function normalizeStellarClass(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function extractSubdwarfOrDwarfClass(rawValue) {
  const match = rawValue.match(/^(?:d\/sd|sd|esd|usd|d)([OBAFGKMLTY])/);
  return match ? match[1].toUpperCase() : null;
}

function isWhiteDwarfClass(rawValue, normalizedUpper) {
  if (/^D(?!\/SD)/.test(rawValue)) return true;
  if (/\bD\b/.test(normalizedUpper)) return true;
  return false;
}

/**
 * Extracts the primary spectral class letter from a star's Stellar_class field.
 * Returns 'Other' for unrecognized or missing classes.
 * Supports common white dwarf and subdwarf notations found in the dataset.
 * @param {Object} star - Star object with optional Stellar_class property.
 * @returns {string} Single uppercase letter (O, B, A, D, F, G, K, M, L, T, Y) or 'Other'.
 */
export function getPrimaryClass(star) {
  const rawValue = normalizeStellarClass(star?.Stellar_class);
  if (!rawValue) return 'Other';

  const normalizedUpper = rawValue.toUpperCase();
  if (UNKNOWN_CLASS_TOKENS.has(normalizedUpper)) return 'Other';

  const dwarfOrSubdwarfClass = extractSubdwarfOrDwarfClass(rawValue);
  if (dwarfOrSubdwarfClass) return dwarfOrSubdwarfClass;

  if (isWhiteDwarfClass(rawValue, normalizedUpper)) return 'D';

  const standardClassMatch = normalizedUpper.match(STANDARD_CLASS_PATTERN);
  if (standardClassMatch) {
    const candidate = standardClassMatch[0].toUpperCase();
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
