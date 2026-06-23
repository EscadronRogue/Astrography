import { getPrimaryClass } from '../../shared/stellarClassUtils.js';

export const STL_MM_PER_LY = 5;
export const STL_STANDARD_STAR_DIAMETER_MM = 16;
export const STL_STANDARD_STAR_RADIUS_MM = STL_STANDARD_STAR_DIAMETER_MM / 2;
export const STL_TUBE_DIAMETER_MM = 4;
export const STL_TUBE_RADIUS_MM = STL_TUBE_DIAMETER_MM / 2;

export const STL_CLASS_SIZE_MULTIPLIER = Object.freeze({
  O: 1.15,
  B: 1.15,
  A: 1.15,
  F: 1.00,
  G: 1.00,
  K: 0.85,
  M: 0.65,
  D: 0.50,
  L: 0.50,
  T: 0.50,
  Y: 0.50,
  Other: 0.50
});

export function getSTLStarRadius(star) {
  const cls = getPrimaryClass(star);
  const multiplier = STL_CLASS_SIZE_MULTIPLIER[cls] ?? STL_CLASS_SIZE_MULTIPLIER.Other;
  return STL_STANDARD_STAR_RADIUS_MM * multiplier;
}
