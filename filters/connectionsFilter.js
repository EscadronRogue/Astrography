// filters/connectionsFilter.js

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { adjustMollweideWrap, splitMollweideWrap, greatCircleToMollweide, getMollweideLambda0 } from '../utils/geometryUtils.js';

const GC_SEGMENTS = 32;

/**
 * Helper: Returns a THREE.Vector3 for a star’s position.
 *  - If star.truePosition is available, it is returned.
 *  - Otherwise, if x_coordinate, y_coordinate, z_coordinate exist, they are used.
 *  - Otherwise, if RA_in_degrees and DEC_in_degrees exist, position is computed using:
 *      x = -Distance * cos(dec) * cos(ra)
 *      y = Distance * sin(dec)
 *      z = -Distance * cos(dec) * sin(ra)
 * @param {Object} star - The star object.
 * @returns {THREE.Vector3}
 */
function getPosition(star) {
  if (star.truePosition) {
    return star.truePosition;
  } else if (
    star.x_coordinate !== undefined &&
    star.y_coordinate !== undefined &&
    star.z_coordinate !== undefined
  ) {
    return new THREE.Vector3(star.x_coordinate, star.y_coordinate, star.z_coordinate);
  } else if (
    star.RA_in_degrees !== undefined &&
    star.DEC_in_degrees !== undefined &&
    star.Distance_from_the_Sun !== undefined
  ) {
    const ra = THREE.Math.degToRad(star.RA_in_degrees);
    const dec = THREE.Math.degToRad(star.DEC_in_degrees);
    const R = star.Distance_from_the_Sun;
    return new THREE.Vector3(
      -R * Math.cos(dec) * Math.cos(ra),
       R * Math.sin(dec),
      -R * Math.cos(dec) * Math.sin(ra)
    );
  }
  return new THREE.Vector3(0, 0, 0);
}

/**
 * Computes connection pairs between stars that are within maxDistance.
 *
 * @param {Array} stars - Array of star objects.
 * @param {number} maxDistance - Maximum allowed distance between stars.
 * @returns {Array} Array of connection objects: { starA, starB, distance }
 */
export function computeConnectionPairs(stars, maxDistance) {
  const pairs = [];
  for (let i = 0; i < stars.length; i++) {
    for (let j = i + 1; j < stars.length; j++) {
      const starA = stars[i];
      const starB = stars[j];
      const posA = getPosition(starA);
      const posB = getPosition(starB);
      const distance = posA.distanceTo(posB);
      if (distance > 0 && distance <= maxDistance) {
        pairs.push({ starA, starB, distance });
      }
    }
  }
  return pairs;
}

/**
 * Merges connection line segments into a single THREE.LineSegments object.
 *
 * @param {Array} connectionObjs - Array of connection objects.
 * @returns {THREE.LineSegments} - The merged connection lines.
 */
export function mergeConnectionLines(connectionObjs, mapType = 'TrueCoordinates', opacity = 0.5) {
  const group = new THREE.Group();
  const lines = createConnectionLines([], connectionObjs, mapType, opacity);
  lines.forEach(l => group.add(l));
  return group;
}

export function createMollweideConnectionSegments(pairs, opacity = 0.5) {
  const group = new THREE.Group();
  const lines = createConnectionLines([], pairs, 'Mollweide', opacity);
  lines.forEach(l => group.add(l));
  return group;
}

export function updateMollweideConnectionSegments() {
  /* no-op retained for backward compatibility */
}

/**
 * Creates individual connection line objects between star pairs.
 *
 * @param {Array} stars - Array of star objects.
 * @param {Array} pairs - Array of connection objects.
 * @param {string} mapType - 'Globe' or other.
 * @returns {Array} - Array of THREE.Line objects.
 */
export function createConnectionLines(stars, pairs, mapType, opacityFactor = 0.5) {
  if (!pairs || pairs.length === 0) return [];
  
  const largestPairDistance = pairs.reduce((max, p) => Math.max(max, p.distance), 0);
  const lines = [];
  
  pairs.forEach(pair => {
    const { starA, starB, distance } = pair;
    let posA, posB;
    const c1 = new THREE.Color(starA.displayColor || '#ffffff');
    const c2 = new THREE.Color(starB.displayColor || '#ffffff');
    if (mapType === 'Globe') {
      if (!starA.spherePosition || !starB.spherePosition) return;
      posA = new THREE.Vector3(starA.spherePosition.x, starA.spherePosition.y, starA.spherePosition.z);
      posB = new THREE.Vector3(starB.spherePosition.x, starB.spherePosition.y, starB.spherePosition.z);
    } else if (mapType === 'Mollweide') {
      if (!starA.mollweidePosition || !starB.mollweidePosition) return;
      const segments = splitMollweideWrap(
        starA.mollweidePosition,
        starB.mollweidePosition
      );
      const smoothstep = (edge0, edge1, x) => {
        const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
        return t * t * (3 - 2 * t);
      };
      segments.forEach(([s1, s2]) => {
        const points = [s1, s2];
        for (let i = 0; i < points.length - 1; i++) {
          const segGeom = new THREE.BufferGeometry().setFromPoints([points[i], points[i + 1]]);
          const tMid = 0.5; // only two points
          const fade = smoothstep(0.0, 0.1, tMid) * smoothstep(1.0, 0.9, tMid);
          const segMat = new THREE.LineBasicMaterial({
            color: c1.clone().lerp(c2, 0.5),
            transparent: true,
            opacity: THREE.MathUtils.lerp(1.0, 0.3, distance / (largestPairDistance || distance)) * fade,
            linewidth: THREE.MathUtils.lerp(10, 1, distance / (largestPairDistance || distance))
          });
          const seg = new THREE.Line(segGeom, segMat);
          lines.push(seg);
        }
      });
      return;
    } else {
      // Use the computed truePosition if available
      posA = getPosition(starA).clone();
      posB = getPosition(starB).clone();
    }
    
    const gradientColor = c1.clone().lerp(c2, 0.5);
    
    const normDist = distance / (largestPairDistance || distance);
    const lineThickness = THREE.MathUtils.lerp(10, 1, normDist);
    const lineOpacity = THREE.MathUtils.lerp(1.0, 0.3, normDist) * opacityFactor;
    
    let points;
    if (mapType === 'Globe') {
      const R = 100;
      const curve = new THREE.CatmullRomCurve3(getGreatCirclePoints(posA, posB, R, 32));
      points = curve.getPoints(32);
    } else {
      points = [posA, posB];
    }

    const smoothstep = (edge0, edge1, x) => {
      const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
      return t * t * (3 - 2 * t);
    };

    for (let i = 0; i < points.length - 1; i++) {
      const segGeom = new THREE.BufferGeometry().setFromPoints([points[i], points[i + 1]]);
      const tMid = (i + 0.5) / (points.length - 1);
      const fade = smoothstep(0.0, 0.1, tMid) * smoothstep(1.0, 0.9, tMid);
      const segMat = new THREE.LineBasicMaterial({
        color: gradientColor,
        transparent: true,
        opacity: lineOpacity * fade,
        linewidth: lineThickness
      });
      const seg = new THREE.Line(segGeom, segMat);
      if (mapType === 'Globe') {
        seg.renderOrder = 1;
      }
      lines.push(seg);
    }
  });
  return lines;
}

/**
 * Helper function to compute points along a great‑circle path between two points.
 *
 * @param {THREE.Vector3} p1 - Starting position.
 * @param {THREE.Vector3} p2 - Ending position.
 * @param {number} R - Sphere radius.
 * @param {number} segments - Number of segments.
 * @returns {Array} - Array of THREE.Vector3 points.
 */
function getGreatCirclePoints(p1, p2, R, segments) {
  const points = [];
  const start = p1.clone().normalize().multiplyScalar(R);
  const end = p2.clone().normalize().multiplyScalar(R);
  const axis = new THREE.Vector3().crossVectors(start, end).normalize();
  const angle = start.angleTo(end);
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * angle;
    const quaternion = new THREE.Quaternion().setFromAxisAngle(axis, theta);
    const point = start.clone().applyQuaternion(quaternion);
    points.push(point);
  }
  return points;
}
