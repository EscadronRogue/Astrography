/**
 * @file Shared utilities for stellar class extraction and classification.
 * Eliminates duplicate stellar class parsing from sizeFilter.js, colorFilter.js,
 * stellarClassFilter.js, and connectionsFilter.js.
 */
import { STELLAR_CLASS_SET } from './constants.js';

const WHITE_DWARF_PREFIXES = ['DA', 'DB', 'DC', 'DO', 'DQ', 'DZ', 'DX', 'DQZ', 'DAZ', 'DBZ', 'DCZ'];
const SUBDWARF_PREFIX_RE = /^(?:usd|esd|sd)([OBAFGKMLTY])|^d([OBAFGKMLTY])/i;
const STANDARD_CLASS_RE = /^[OBAFGKMLTYD]/i;

function readRawClass(star) {
  if (typeof star?.primaryClass === 'string' && star.primaryClass.trim()) {
    return star.primaryClass.trim();
  }
  if (typeof star?.spectralClass === 'string' && star.spectralClass.trim()) {
    return star.spectralClass.trim();
  }
  if (typeof star?.Stellar_class === 'string' && star.Stellar_class.trim()) {
    return star.Stellar_class.trim();
  }
  return '';
}

function normalizeNamedOverrides(star) {
  const name = `${star?.Common_name_of_the_star || ''} ${star?.Common_name_of_the_star_system || ''}`.toLowerCase();
  if (name.includes('gliese 229 bb')) return 'T';
  if (name.includes('2mass j0429+3806')) return 'L';
  return null;
}

function isWhiteDwarfClass(rawClass) {
  const upper = rawClass.toUpperCase();
  return WHITE_DWARF_PREFIXES.some(prefix => upper.startsWith(prefix)) || upper.startsWith('D');
}

/**
 * Extracts the primary spectral class bucket from a star.
 * Supports standard MK classes, brown dwarf L/T/Y classes, and a dedicated D bucket for white dwarfs.
 * @param {Object} star - Star object.
 * @returns {string} One of O, B, A, F, G, K, M, L, T, Y, D, or 'Other'.
 */
export function getPrimaryClass(star) {
  if (star?.primaryClass === 'Other') return 'Other';

  const namedOverride = normalizeNamedOverrides(star);
  if (namedOverride) return namedOverride;

  const rawClass = readRawClass(star);
  if (!rawClass) return 'Other';

  const subdwarfMatch = rawClass.match(SUBDWARF_PREFIX_RE);
  if (subdwarfMatch && rawClass[0] === rawClass[0].toLowerCase()) {
    const candidate = (subdwarfMatch[1] || subdwarfMatch[2]).toUpperCase();
    return STELLAR_CLASS_SET.has(candidate) ? candidate : 'Other';
  }

  if (isWhiteDwarfClass(rawClass)) return 'D';

  const standardMatch = rawClass.match(STANDARD_CLASS_RE);
  if (standardMatch) {
    const candidate = standardMatch[0].toUpperCase();
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
