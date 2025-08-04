// /filters/colorFilter.js

import { getStellarClassData } from './stellarClassData.js';
import { generateColorPalette } from '../utils.js';

/**
 * Applies color filter to stars based on the selected filter.
 * Supported filters:
 *   - "stellar-class": Colors based on stellar class.
 *   - "constellation": Colors based on the star's "Constellation" field using a fixed mapping
 *                      that mimics the constellation overlay color logic.
 *   - "galactic-plane": Colors based on the star’s position relative to the galactic plane.
 *   - (default): White.
 *
 * @param {Array} stars - Array of star objects.
 * @param {Object} filters - The current filters object.
 * @returns {Array} Updated array of star objects.
 */
export function applyColorFilter(stars, filters) {
  const stellarClassData = getStellarClassData();

  if (filters.color === 'stellar-class') {
    const classes = Object.keys(stellarClassData);
    const palette = generateColorPalette(classes.length);
    const classMapping = {};
    classes.forEach((cls, idx) => {
      classMapping[cls] = palette[idx];
    });
    stars.forEach(star => {
      const primaryClass = star.Stellar_class ? star.Stellar_class.charAt(0).toUpperCase() : 'G';
      star.displayColor = classMapping[primaryClass] || '#3b2f2f';
    });
  } else if (filters.color === 'constellation') {
    const constellationSet = new Set();
    stars.forEach(star => {
      if (star.Constellation) {
        constellationSet.add(star.Constellation.toUpperCase());
      }
    });
    const constellations = Array.from(constellationSet).sort();
    const palette = generateColorPalette(constellations.length);
    const colorMapping = {};
    constellations.forEach((constName, index) => {
      colorMapping[constName] = palette[index];
    });
    stars.forEach(star => {
      const constKey = star.Constellation ? star.Constellation.toUpperCase() : '';
      star.displayColor = colorMapping[constKey] || '#3b2f2f';
    });
  } else if (filters.color === 'galactic-plane') {
    const maxZ = Math.max(...stars.map(s => Math.abs(s.z_coordinate)));
    stars.forEach(star => {
      const factor = Math.abs(star.z_coordinate) / maxZ;
      if (star.z_coordinate < 0) {
        star.displayColor = interpolateHex('#f5e6c4', '#3b2f2f', factor);
      } else if (star.z_coordinate > 0) {
        star.displayColor = interpolateHex('#f5e6c4', '#3b2f2f', factor);
      } else {
        star.displayColor = '#3b2f2f';
      }
    });
  } else {
    stars.forEach(star => {
      if (!star.displayColor) {
        star.displayColor = '#3b2f2f';
      }
    });
  }
  return stars;
}

function interpolateHex(hex1, hex2, factor) {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  const r = Math.round(c1.r + factor * (c2.r - c1.r));
  const g = Math.round(c1.g + factor * (c2.g - c1.g));
  const b = Math.round(c1.b + factor * (c2.b - c1.b));
  return rgbToHex(r, g, b);
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return { r, g, b };
}

function rgbToHex(r, g, b) {
  const componentToHex = c => c.toString(16).padStart(2, '0');
  return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b);
}
