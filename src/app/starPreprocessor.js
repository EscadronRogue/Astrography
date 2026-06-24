/**
 * @file Preprocesses star data after loading — calculates 3D positions,
 * globe positions, and UV/equirectangular positions.
 * Also handles reprojection when the viewpoint star changes.
 * Extracted from createApp.js bootstrapApp() to keep bootstrap thin.
 */
import * as THREE from '../vendor/three.js';
import { getStarCoordinates, getStarTruePosition, getStarGlobePosition } from '../shared/starUtils.js';
import { cachedRadToSphere } from '../shared/geometryUtils.js';
import { getStarEquirectangularPosition } from '../shared/uvUtils.js';
import { GLOBE_RADIUS } from '../shared/constants.js';
import {
  isDefaultViewpoint,
  getViewpointRelativePosition,
  getApparentRaDec,
  getDistanceFromViewpoint
} from '../shared/viewpoint.js';
import { endPerformanceMeasure, startPerformanceMeasure } from '../shared/performanceMetrics.js';

/**
 * Calculates all derived positions for each star.
 * Also stores immutable heliocentric reference data (helioPosition, helioRA,
 * helioDec) that survive viewpoint changes.
 *
 * @param {Array} stars - Array of star records.
 */
export function preprocessStarData(stars) {
  const timer = startPerformanceMeasure('data.preprocessStars', { stars: stars?.length || 0 });
  stars.forEach(star => {
    star.spherePosition = getStarGlobePosition(star);
    star.truePosition = getStarTruePosition(star);
    star.equirectPosition = getStarEquirectangularPosition(star);

    // Preserve immutable heliocentric data for viewpoint reprojection.
    const { ra, dec } = getStarCoordinates(star);
    star.helioPosition = star.truePosition.clone();
    star.helioRA = ra;
    star.helioDec = dec;
    star.viewpointDistance = star.distance; // initially same as heliocentric

  });
  endPerformanceMeasure(timer, { stars: stars?.length || 0 });
}

/**
 * Reprojects all star positions relative to the current viewpoint star.
 * Call this after setViewpointStar() and before buildAndApplyFilters().
 *
 * When viewpoint is Sol (default), positions are restored to their
 * original heliocentric values.
 *
 * @param {Array} stars - Array of star records (must have helioPosition/helioRA/helioDec set).
 */
export function reprojectAllStars(stars) {
  const timer = startPerformanceMeasure('data.reprojectStars', { stars: stars?.length || 0 });
  const atSol = isDefaultViewpoint();

  stars.forEach(star => {
    if (!star.helioPosition) return;

    if (atSol) {
      // Restore heliocentric values
      star.truePosition = star.helioPosition.clone();
      star.viewpointDistance = star.distance;

      // Clear apparent RA/DEC so getStarCoordinates() falls back to
      // the original heliocentric values.
      delete star._apparentRA;
      delete star._apparentDec;

      // Restore original RA/DEC for angular projections
      star.spherePosition = cachedRadToSphere(star.helioRA, star.helioDec, GLOBE_RADIUS);
      star.equirectPosition = undefined; // force recompute from helio RA/DEC
      star.equirectPosition = getStarEquirectangularPosition(star);
    } else {
      // Compute viewpoint-relative 3D position
      star.truePosition = getViewpointRelativePosition(star);
      star.viewpointDistance = getDistanceFromViewpoint(star);

      // Compute apparent RA/DEC as seen from viewpoint star
      const { ra, dec } = getApparentRaDec(star);

      // Temporarily override the star's RA/DEC fields so that
      // existing projection functions read the apparent values.
      // (We restore them from helioRA/helioDec on Sol reset above.)
      star._apparentRA = ra;
      star._apparentDec = dec;

      star.spherePosition = cachedRadToSphere(ra, dec, GLOBE_RADIUS);
      star.equirectPosition = undefined; // force recompute
      // Manually compute equirect from apparent RA/DEC
      const TAU = Math.PI * 2;
      const u = ((ra % TAU) + TAU) % TAU / TAU;
      const safeDec = THREE.MathUtils.clamp(dec, -Math.PI / 2, Math.PI / 2);
      const v = 1 - ((safeDec + Math.PI / 2) / Math.PI);
      star.equirectPosition = new THREE.Vector3((u - 0.5) * 200, (0.5 - v) * 100, 0);
    }
  });
  endPerformanceMeasure(timer, { stars: stars?.length || 0, viewpoint: atSol ? 'sol' : 'custom' });
}
