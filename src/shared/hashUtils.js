/**
 * @file FNV-1a hash utilities shared across the application.
 */

/** FNV-1a string hash. Returns a 32-bit unsigned integer. */
export function hashString(value) {
  const str = String(value ?? '');
  let hash = 2166136261;
  for (let index = 0; index < str.length; index++) {
    hash ^= str.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Mixes a numeric value into an existing FNV-1a hash. */
export function mixHash(hash, value) {
  return Math.imul(hash ^ value, 16777619) >>> 0;
}
