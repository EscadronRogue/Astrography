/**
 * @file Shared color utility functions.
 * Consolidates duplicated color hash, HSL, and interpolation functions
 * from cloudsFilter.js, cloudDensityFilter.js, densityColorUtils.js, and colorFilter.js.
 */
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { getDustCloudColor } from '../features/clouds/dustCloudColors.js';

/**
 * Deterministic hash of a string to an integer.
 * @param {string} str - Input string.
 * @returns {number} Hash value.
 */
export function hashString(str) {
  let hash = 0;
  const value = String(str ?? '');
  for (let i = 0; i < value.length; i++) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
  }
  return hash;
}

/**
 * Generates a THREE.Color from a name using predefined dust cloud colors
 * or a deterministic hash-based hue fallback.
 * @param {string} name - Cloud or entity name.
 * @returns {THREE.Color}
 */
export function uniqueColorFromName(name) {
  const predefined = getDustCloudColor(name);
  if (predefined) {
    return new THREE.Color(predefined);
  }
  const hue = (hashString(name) % 360 + 360) % 360;
  return new THREE.Color(`hsl(${hue}, 70%, 50%)`);
}

/**
 * Generates a THREE.Color from a deterministic HSL range based on a string hash.
 * @param {string} str - Input string to hash.
 * @param {Object} options
 * @param {number} options.start - Start of the hue range (0-360).
 * @param {number} options.spread - Width of the hue range.
 * @returns {THREE.Color}
 */
export function hslColorFromHash(str, { start = 0, spread = 360 } = {}) {
  const hue = start + (Math.abs(hashString(str)) % spread);
  return new THREE.Color(`hsl(${hue}, 70%, 50%)`);
}

/**
 * Extracts the cloud name from its data file URL.
 * E.g., "data/Aquila_cloud_data.json" -> "Aquila"
 * @param {string} fileUrl - URL or path to the cloud JSON file.
 * @returns {string} Human-readable cloud name.
 */
export function getCloudNameFromFileUrl(fileUrl) {
  const parts = fileUrl.split('/');
  let filename = parts[parts.length - 1];
  filename = filename
    .replace(/_cloud_data\.json$/i, '')
    .replace(/\.json$/i, '');
  return filename.replace(/_/g, ' ').trim();
}

/**
 * Converts a HEX color (string '#rrggbb' or numeric 0xrrggbb) to { r, g, b } (0-255 each).
 * @param {string|number} hex - Input color.
 * @returns {{ r: number, g: number, b: number }}
 */
export function hexToRgb(hex) {
  if (typeof hex === 'number') {
    hex = '#' + hex.toString(16).padStart(6, '0');
  }
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}

/**
 * Converts RGB components (0-255) to a HEX string '#rrggbb'.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string}
 */
export function rgbToHex(r, g, b) {
  const toHex = c => c.toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

/**
 * Linearly interpolates between two hex colors and returns a hex string.
 * @param {string} hex1 - Start color '#rrggbb'.
 * @param {string} hex2 - End color '#rrggbb'.
 * @param {number} factor - Interpolation factor in [0, 1].
 * @returns {string} Interpolated hex color string.
 */
export function interpolateHex(hex1, hex2, factor) {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  const r = Math.round(c1.r + factor * (c2.r - c1.r));
  const g = Math.round(c1.g + factor * (c2.g - c1.g));
  const b = Math.round(c1.b + factor * (c2.b - c1.b));
  return rgbToHex(r, g, b);
}

/**
 * Linearly interpolates between two colors (hex string or numeric) and
 * returns the result as a numeric color value (e.g. 0xff9933).
 * @param {string|number} color1 - Start color.
 * @param {string|number} color2 - End color.
 * @param {number} factor - Interpolation factor in [0, 1].
 * @returns {number} Interpolated color as a decimal.
 */
export function interpolateColor(color1, color2, factor) {
  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);
  const r = Math.round(c1.r + factor * (c2.r - c1.r));
  const g = Math.round(c1.g + factor * (c2.g - c1.g));
  const b = Math.round(c1.b + factor * (c2.b - c1.b));
  return (r << 16) + (g << 8) + b;
}

/**
 * Converts HEX color to RGBA string.
 * @param {string} hex - Color '#rrggbb'.
 * @param {number} opacity - Opacity in [0, 1].
 * @returns {string} 'rgba(r, g, b, opacity)'
 */
export function hexToRGBA(hex, opacity) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}
