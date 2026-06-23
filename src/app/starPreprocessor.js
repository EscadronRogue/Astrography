/**
 * @file Preprocesses star data after loading — calculates 3D positions,
 * Mollweide data, and applies stored edit offsets.
 * Also handles reprojection when the viewpoint star changes.
 * Extracted from createApp.js bootstrapApp() to keep bootstrap thin.
 */
import * as THREE from '../vendor/three.js';
import { getStarId, getStarCoordinates, getStarTruePosition, getStarGlobePosition, precalcMollweideData } from '../shared/starUtils.js';
import { updateMollweidePosition } from './mollweideUpdater.js';
import { cachedRadToSphere } from '../shared/geometryUtils.js';
import { getStarEquirectangularPosition } from '../shared/uvUtils.js';
import { GLOBE_RADIUS } from '../shared/constants.js';
import {
  isDefaultViewpoint,
  getViewpointRelativePosition,
  getApparentRaDec,
  getDistanceFromViewpoint
} from '../shared/viewpoint.js';

/**
 * Calculates all derived positions for each star and applies stored edit state.
 * Also stores immutable heliocentric reference data (helioPosition, helioRA,
 * helioDec) that survive viewpoint changes.
 *
 * @param {Array} stars - Array of star records.
 * @param {Object} editManager - The edit manager instance (for label offsets/rotations/scales).
 */
export function preprocessStarData(stars, editManager) {
  stars.forEach(star => {
    star.spherePosition = getStarGlobePosition(star);
    star.truePosition = getStarTruePosition(star);
    precalcMollweideData(star);
    updateMollweidePosition(star);

    // Preserve immutable heliocentric data for viewpoint reprojection.
    const { ra, dec } = getStarCoordinates(star);
    star.helioPosition = star.truePosition.clone();
    star.helioRA = ra;
    star.helioDec = dec;
    star.viewpointDistance = star.distance; // initially same as heliocentric

    const id = getStarId(star);

    if (editManager.starLabelOffsets.has(id)) {
      const off = editManager.starLabelOffsets.get(id);
      star.mollLabelOffset = new THREE.Vector3(off.x, off.y, 0);
    }
    if (editManager.starLabelRotations.has(id)) {
      star.mollLabelRotation = editManager.starLabelRotations.get(id);
    }
    if (editManager.starLabelScales.has(id)) {
      const sc = editManager.starLabelScales.get(id);
      star.mollLabelScale = new THREE.Vector3(sc.x, sc.y, 1);
    }
  });
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
      precalcMollweideData(star);
      updateMollweidePosition(star);
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

      // Recompute Mollweide from apparent RA/DEC
      star.raRad = ra;
      star.decRad = dec;
      // Recalculate Mollweide auxiliary values (theta, mollXFactor, mollY)
      const MOLLWEIDE_MAX_ITERATIONS = 10;
      const EPSILON = 1e-10;
      let theta = dec;
      for (let i = 0; i < MOLLWEIDE_MAX_ITERATIONS; i++) {
        const delta = (2 * theta + Math.sin(2 * theta) - Math.PI * Math.sin(dec)) /
          (2 + 2 * Math.cos(2 * theta));
        theta -= delta;
        if (Math.abs(delta) < EPSILON) break;
      }
      star.mollXFactor = (2 * GLOBE_RADIUS / Math.PI) * Math.cos(theta);
      star.mollY = GLOBE_RADIUS * Math.sin(theta);
      updateMollweidePosition(star);
    }
  });
}
