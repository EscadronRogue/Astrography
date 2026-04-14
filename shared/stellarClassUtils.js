/**
 * @file Shared utilities for stellar class extraction and classification.
 * Eliminates duplicate stellar class parsing from sizeFilter.js, colorFilter.js,
 * stellarClassFilter.js, and connectionsFilter.js.
 */
import { STELLAR_CLASS_SET } from './constants.js';

const LOWERCASE_DWARF_PREFIX_PATTERN = /^(?:usd|esd|sd|d)([OBAFGKMLTY])/;
const WHITE_DWARF_PATTERN = /^D[A-Z0-9]/;
const LEADING_SPECTRAL_CLASS_PATTERN = /^([OBAFGKMLTY])/;
const KNOWN_CLASS_OVERRIDES = Object.freeze({
  'Gliese 229 Bb': 'T'
});

/**
 * Extracts the primary spectral class letter from the available star metadata.
 * Supports normal spectral classes, brown dwarfs, and a dedicated white dwarf D class.
 * Falls back to curated name overrides and coarse color heuristics for known incomplete rows.
 * @param {Object} star - Star object with optional classification metadata.
 * @returns {string} Single uppercase letter (O, B, A, F, G, K, M, L, T, Y, D) or 'Other'.
 */
export function getPrimaryClass(star) {
  if (!star || typeof star !== 'object') return 'Other';

  const normalizedPrimaryClass = normalizePrimaryClass(star.primaryClass);
  if (normalizedPrimaryClass) return normalizedPrimaryClass;

  const knownOverride = getKnownClassOverride(star);
  if (knownOverride) return knownOverride;

  const stellarClass = typeof star.Stellar_class === 'string' ? star.Stellar_class.trim() : '';
  const parsedStellarClass = parseStellarClass(stellarClass);
  if (parsedStellarClass) return parsedStellarClass;

  const colorFallbackClass = inferClassFromColor(star.Color);
  if (colorFallbackClass) return colorFallbackClass;

  return 'Other';
}

function normalizePrimaryClass(primaryClass) {
  if (typeof primaryClass !== 'string') return null;
  const normalized = primaryClass.trim().toUpperCase();
  if (STELLAR_CLASS_SET.has(normalized)) return normalized;
  if (normalized === 'OTHER') return 'Other';
  return null;
}

function getKnownClassOverride(star) {
  const commonName = typeof star.Common_name_of_the_star === 'string'
    ? star.Common_name_of_the_star.trim()
    : '';
  const systemName = typeof star.Common_name_of_the_star_system === 'string'
    ? star.Common_name_of_the_star_system.trim()
    : '';
  return KNOWN_CLASS_OVERRIDES[commonName] || KNOWN_CLASS_OVERRIDES[systemName] || null;
}

function parseStellarClass(stellarClass) {
  if (!stellarClass) return null;

  const lowercaseDwarfMatch = stellarClass.match(LOWERCASE_DWARF_PREFIX_PATTERN);
  if (lowercaseDwarfMatch) {
    return lowercaseDwarfMatch[1].toUpperCase();
  }

  const normalized = stellarClass.toUpperCase();
  if (normalized === 'OTHER' || normalized === 'UNKNOWN') return null;

  if (WHITE_DWARF_PATTERN.test(normalized)) {
    return 'D';
  }

  const leadingSpectralClassMatch = normalized.match(LEADING_SPECTRAL_CLASS_PATTERN);
  if (leadingSpectralClassMatch) {
    return leadingSpectralClassMatch[1];
  }

  return null;
}

function inferClassFromColor(colorValue) {
  if (typeof colorValue !== 'string') return null;
  const normalizedColor = colorValue.trim().toLowerCase();
  if (!normalizedColor || normalizedColor === 'unknown') return null;

  if (normalizedColor.includes('white dwarf')) return 'D';
  if (normalizedColor.includes('sub-brown dwarf')) return 'Y';
  if (normalizedColor.includes('brown dwarf')) return 'L';
  if (normalizedColor.includes('white-blue') || normalizedColor.includes('blue-white')) return 'B';
  if (normalizedColor.includes('yellow-white')) return 'F';
  if (normalizedColor.includes('blue')) return 'O';
  if (normalizedColor.includes('white')) return 'A';
  if (normalizedColor.includes('yellow')) return 'G';
  if (normalizedColor.includes('orange')) return 'K';
  if (normalizedColor.includes('red')) return 'M';

  return null;
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
