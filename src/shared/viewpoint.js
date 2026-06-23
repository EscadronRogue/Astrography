/**
 * @file Viewpoint state and coordinate transforms.
 *
 * Holds the current viewpoint star (null = Sol / default) and exposes
 * pure functions that convert heliocentric star data into
 * viewpoint-relative positions, apparent RA/DEC, and distances.
 *
 * The coordinate frame orientation never changes — only the origin shifts.
 */

import * as THREE from '../vendor/three.js';
import { getStarId, isSolStar } from './starUtils.js';

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

let _viewpointStar = null;          // null → Sol (origin)
let _viewpointHelioPosition = null; // THREE.Vector3 — heliocentric pos of viewpoint star

/**
 * Set the current viewpoint star.
 * Pass `null` to reset to Sol (default heliocentric view).
 * @param {Object|null} star - A star record with `helioPosition` already set,
 *                              or null to reset to Sol.
 */
export function setViewpointStar(star) {
  if (star === null || star === undefined || isSolStar(star)) {
    _viewpointStar = null;
    _viewpointHelioPosition = null;
    return;
  }
  _viewpointStar = star;
  // helioPosition is the immutable heliocentric Vector3 set at load time.
  _viewpointHelioPosition = star.helioPosition
    ? star.helioPosition.clone()
    : new THREE.Vector3(0, 0, 0);
}

/**
 * @returns {Object|null} The current viewpoint star record, or null for Sol.
 */
export function getViewpointStar() {
  return _viewpointStar;
}

/**
 * @returns {boolean} True when the viewpoint is Sol (default).
 */
export function isDefaultViewpoint() {
  return _viewpointStar === null;
}

/**
 * @returns {string|null} The starId of the current viewpoint star, or null for Sol.
 */
export function getViewpointStarId() {
  return _viewpointStar ? getStarId(_viewpointStar) : null;
}

/* ------------------------------------------------------------------ */
/*  Coordinate transforms                                              */
/* ------------------------------------------------------------------ */

const _tmpVec = new THREE.Vector3();

/**
 * Returns the star's 3D position relative to the current viewpoint.
 * When viewpoint is Sol this equals helioPosition.
 *
 * @param {Object} star - Star record with `helioPosition` (THREE.Vector3).
 * @returns {THREE.Vector3} New vector (safe to mutate).
 */
export function getViewpointRelativePosition(star) {
  if (!star.helioPosition) {
    return new THREE.Vector3(0, 0, 0);
  }
  if (_viewpointHelioPosition === null) {
    return star.helioPosition.clone();
  }
  return star.helioPosition.clone().sub(_viewpointHelioPosition);
}

/**
 * Returns the apparent RA and DEC (in radians) of a star as seen from
 * the current viewpoint.  Uses the same coordinate-frame orientation as
 * the heliocentric system — only the origin shifts.
 *
 * The conversion mirrors `vectorToRaDecRad` in geometryUtils.js:
 *   ra  = atan2(-z, -x)   wrapped to [0, 2π)
 *   dec = asin(y / |v|)
 *
 * @param {Object} star - Star record with `helioPosition`.
 * @returns {{ ra: number, dec: number }} Radians.
 */
export function getApparentRaDec(star) {
  const rel = getViewpointRelativePosition(star);
  const dist = rel.length();
  if (dist < 1e-12) {
    // Star is at the viewpoint — return arbitrary (0, 0)
    return { ra: 0, dec: 0 };
  }
  const dec = Math.asin(THREE.MathUtils.clamp(rel.y / dist, -1, 1));
  let ra = Math.atan2(-rel.z, -rel.x);
  if (ra < 0) ra += 2 * Math.PI;
  return { ra, dec };
}

/**
 * Euclidean distance from the current viewpoint to the star.
 * When viewpoint is Sol this equals the original `star.distance`.
 *
 * @param {Object} star - Star record with `helioPosition`.
 * @returns {number} Distance in the same units as the coordinate system (light-years).
 */
export function getDistanceFromViewpoint(star) {
  if (_viewpointHelioPosition === null) {
    return star.distance ?? 0;
  }
  if (!star.helioPosition) return 0;
  return _tmpVec.copy(star.helioPosition).sub(_viewpointHelioPosition).length();
}
