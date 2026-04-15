/**
 * @file Provides constellation center data for density visualization.
 * Delegates to the canonical loader in constellationFilter.js to avoid duplicate fetches.
 */
import { getConstellationCenters } from '../constellations/constellationRenderer.js';

/**
 * Returns constellation center data (already loaded by constellationFilter).
 * @returns {Array<{name: string, ra: number, dec: number}>}
 */
export function getDensityCenterData() {
  return getConstellationCenters() || [];
}
