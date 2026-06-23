/**
 * @file Shared color utility functions.
 * Consolidates duplicated color hash, HSL, and interpolation functions
 * from cloudsFilter.js, cloudDensityFilter.js, densityColorUtils.js, and colorFilter.js.
 */
import * as THREE from '../vendor/three.js';
import { getDustCloudColor } from '../features/clouds/dustCloudColors.js';
import { AUTO_COLOR_SATURATION, AUTO_COLOR_LIGHTNESS } from './constants.js';
import {
  hexToRgb255,
  hexToRgbaString,
  interpolateColorNumber,
  interpolateHexColor,
  normalizeHexColor,
  rgbToHex as rgbToHexValue
} from './colorParsing.js';
import { hashString } from './hashUtils.js';

export { hashString } from './hashUtils.js';

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
  return new THREE.Color(`hsl(${hue}, ${AUTO_COLOR_SATURATION}%, ${AUTO_COLOR_LIGHTNESS}%)`);
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
  return new THREE.Color(`hsl(${hue}, ${AUTO_COLOR_SATURATION}%, ${AUTO_COLOR_LIGHTNESS}%)`);
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
  return hexToRgb255(hex, '#ffffff');
}

/**
 * Converts RGB components (0-255) to a HEX string '#rrggbb'.
 * @param {number} r
 * @param {number} g
 * @param {number} b
 * @returns {string}
 */
export function rgbToHex(r, g, b) {
  return rgbToHexValue(r, g, b);
}

/**
 * Linearly interpolates between two hex colors and returns a hex string.
 * @param {string} hex1 - Start color '#rrggbb'.
 * @param {string} hex2 - End color '#rrggbb'.
 * @param {number} factor - Interpolation factor in [0, 1].
 * @returns {string} Interpolated hex color string.
 */
export function interpolateHex(hex1, hex2, factor) {
  return interpolateHexColor(hex1, hex2, factor);
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
  return interpolateColorNumber(color1, color2, factor);
}

/**
 * Converts HEX color to RGBA string.
 * @param {string} hex - Color '#rrggbb'.
 * @param {number} opacity - Opacity in [0, 1].
 * @returns {string} 'rgba(r, g, b, opacity)'
 */
export function hexToRGBA(hex, opacity) {
  return hexToRgbaString(hex, opacity);
}

export { normalizeHexColor };
