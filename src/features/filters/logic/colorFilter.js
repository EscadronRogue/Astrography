/**
 * @file Applies color mode to stars based on stellar class, constellation, or galactic plane.
 */
import { getStellarClassData } from './stellarClassData.js';
import { getStableConstellationColor } from '../../density/densityColorScale.js';
import { interpolateHex } from '../../../shared/colorUtils.js';
import { DEFAULT_STAR_COLOR, EPSILON } from '../../../shared/constants.js';
import { getPrimaryClass } from '../../../shared/stellarClassUtils.js';

/**
 * Applies the selected color mode to each star's displayColor property.
 * @param {Array} stars - Array of star objects.
 * @param {Object} filters - Filter state containing the selected color mode.
 * @returns {Array} The same stars array with displayColor set.
 */
export function applyColorFilter(stars, filters, displayStats = null) {
  const stellarClassData = getStellarClassData();

  if (filters.color === 'stellar-class') {
    stars.forEach(star => {
      const primaryClass = getPrimaryClass(star);
      const classData = stellarClassData[primaryClass];
      star.displayColor = classData ? classData.color : DEFAULT_STAR_COLOR;
    });
  } else if (filters.color === 'constellation') {
    stars.forEach(star => {
      star.displayColor = getStableConstellationColor((star.constellation || '').toUpperCase()) || DEFAULT_STAR_COLOR;
    });
  } else if (filters.color === 'galactic-plane') {
    const maxZ = displayStats?.maxAbsZ ?? stars.reduce((maxValue, star) => {
      const absZ = Math.abs(Number.isFinite(star.z_coordinate) ? star.z_coordinate : 0);
      return absZ > maxValue ? absZ : maxValue;
    }, EPSILON);
    stars.forEach(star => {
      const z = Number.isFinite(star.z_coordinate) ? star.z_coordinate : 0;
      const factor = Math.abs(z) / maxZ;
      if (z < 0) star.displayColor = interpolateHex('#ffffff', '#0000ff', factor);
      else if (z > 0) star.displayColor = interpolateHex('#ffffff', '#ff0000', factor);
      else star.displayColor = '#ffffff';
    });
  } else {
    stars.forEach(star => {
      if (!star.displayColor) star.displayColor = DEFAULT_STAR_COLOR;
    });
  }
  return stars;
}
