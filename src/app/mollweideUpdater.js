/**
 * @file Handles Mollweide coordinate position updates for stars.
 * Extracted from createApp.js to separate Mollweide projection concerns.
 */
import * as THREE from '../vendor/three.js';
import { minimalRADifference, getMollweideLambda0 } from '../shared/geometryUtils.js';
import { scheduleAnimationFrame } from '../shared/renderScheduler.js';

/**
 * Recalculates a star's Mollweide position based on the current central meridian.
 * @param {Object} star - Star record with raRad, mollXFactor, mollY properties.
 */
export function updateMollweidePosition(star) {
  const lambda = minimalRADifference(star.raRad - getMollweideLambda0());
  if (!star.mollweidePosition) star.mollweidePosition = new THREE.Vector3();
  star.mollweidePosition.set(star.mollXFactor * lambda, star.mollY, 0);
}

/**
 * Creates a debounced scheduler for Mollweide view updates.
 * @param {Function} refreshMollweideMap - Callback to rebuild the Mollweide view.
 * @returns {Function} scheduleMollweideUpdate - Schedules a single RAF-debounced update.
 */
export function createMollweideScheduler(refreshMollweideMap) {
  let pendingUpdate = false;
  return function scheduleMollweideUpdate() {
    if (!pendingUpdate) {
      pendingUpdate = true;
      scheduleAnimationFrame(() => {
        pendingUpdate = false;
        refreshMollweideMap();
      });
    }
  };
}
