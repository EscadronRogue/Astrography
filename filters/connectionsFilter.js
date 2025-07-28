// filters/connectionsFilter.js

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { adjustMollweideWrap, splitMollweideWrap, greatCircleToMollweide, getMollweideLambda0 } from '../utils/geometryUtils.js';

// Tunable parameters for the connections lines
let connectionMaxWidth = 5;
let connectionFadePower = 1.0;

export function setConnectionLineParams(maxWidth, fadePower) {
  connectionMaxWidth = maxWidth;
  connectionFadePower = fadePower;
}

// Helper material and geometry builders for wide fading lines on the Mollweide map
function createWideLineMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      opacityFactor: { value: 1.0 },
      fadePower: { value: connectionFadePower }
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      attribute float side;
      attribute float along;
      varying float vSide;
      varying float vAlong;
      void main() {
        vSide = side;
        vAlong = along;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float opacityFactor;
      uniform float fadePower;
      varying float vSide;
      varying float vAlong;
      void main() {
        float dist = length(vec2(vSide, vAlong));
        float alpha = pow(max(0.0, 1.0 - dist), fadePower) * opacityFactor;
        if(alpha <= 0.0) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `
  });
}

function buildWideLineGeometry(points, width) {
  const vertices = [];
  const sides = [];
  const along = [];
  for (let i = 0; i < points.length; i += 2) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dir = new THREE.Vector2(p2.x - p1.x, p2.y - p1.y).normalize();
    const perp = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(width / 2);
    const a1 = new THREE.Vector3(p1.x + perp.x, p1.y + perp.y, p1.z);
    const a2 = new THREE.Vector3(p1.x - perp.x, p1.y - perp.y, p1.z);
    const b1 = new THREE.Vector3(p2.x + perp.x, p2.y + perp.y, p2.z);
    const b2 = new THREE.Vector3(p2.x - perp.x, p2.y - perp.y, p2.z);

    vertices.push(a1.x, a1.y, a1.z, a2.x, a2.y, a2.z, b2.x, b2.y, b2.z);
    sides.push(1, -1, -1);
    along.push(-1, -1, 1);
    vertices.push(a1.x, a1.y, a1.z, b2.x, b2.y, b2.z, b1.x, b1.y, b1.z);
    sides.push(1, -1, 1);
    along.push(-1, 1, 1);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geom.setAttribute('side', new THREE.Float32BufferAttribute(sides, 1));
  geom.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  return geom;
}

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
  const positions = [];
  const colors = [];

  connectionObjs.forEach(pair => {
    const { starA, starB } = pair;
    let posA, posB;
    const c1 = new THREE.Color(starA.displayColor || '#ffffff');
    const c2 = new THREE.Color(starB.displayColor || '#ffffff');
    if (mapType === 'Globe') {
      posA = starA.spherePosition;
      posB = starB.spherePosition;
    } else if (mapType === 'Mollweide') {
      const segments = splitMollweideWrap(
        starA.mollweidePosition,
        starB.mollweidePosition
      );
      segments.forEach(([s1, s2]) => {
        positions.push(s1.x, s1.y, s1.z, s2.x, s2.y, s2.z);
        const cA = new THREE.Color(starA.displayColor || '#ffffff');
        const cB = new THREE.Color(starB.displayColor || '#ffffff');
        colors.push(cA.r, cA.g, cA.b, cB.r, cB.g, cB.b);
      });
      return; // continue to next pair
    } else {
      posA = getPosition(starA);
      posB = getPosition(starB);
    }
    positions.push(posA.x, posA.y, posA.z);
    positions.push(posB.x, posB.y, posB.z);

    const cA = new THREE.Color(starA.displayColor || '#ffffff');
    const cB = new THREE.Color(starB.displayColor || '#ffffff');
    colors.push(cA.r, cA.g, cA.b, cB.r, cB.g, cB.b);
  });
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity,
    linewidth: 1
  });
  
  const mergedLines = new THREE.LineSegments(geometry, material);
  return mergedLines;
}

export function createMollweideConnectionSegments(pairs, opacity = 0.5) {
  const segCount = pairs.length * GC_SEGMENTS * 2; // each GC segment may wrap
  const positions = new Float32Array(segCount * 2 * 3);
  const colors = new Float32Array(segCount * 2 * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity,
    linewidth: 1
  });
  const lineSegs = new THREE.LineSegments(geometry, material);
  lineSegs.userData = { pairs, segments: GC_SEGMENTS };
  updateMollweideConnectionSegments(lineSegs);
  return lineSegs;
}

export function updateMollweideConnectionSegments(lineSegs) {
  const pairs = lineSegs.userData.pairs || [];
  const segsCount = lineSegs.userData.segments || GC_SEGMENTS;
  const posAttr = lineSegs.geometry.getAttribute('position');
  const colorAttr = lineSegs.geometry.getAttribute('color');
  let idx = 0;
  pairs.forEach(pair => {
    const p1 = pair.starA.spherePosition;
    const p2 = pair.starB.spherePosition;
    if (!p1 || !p2) return;
    const pts = greatCircleToMollweide(p1, p2, 100, segsCount, getMollweideLambda0());
    const cA = new THREE.Color(pair.starA.displayColor || '#ffffff');
    const cB = new THREE.Color(pair.starB.displayColor || '#ffffff');
    for (let j = 0; j < pts.length - 1; j++) {
      const segs = splitMollweideWrap(pts[j], pts[j + 1]);
      segs.forEach(([s, e]) => {
        if (idx + 6 > posAttr.array.length) return;
        posAttr.array[idx] = s.x; posAttr.array[idx+1] = s.y; posAttr.array[idx+2] = s.z;
        posAttr.array[idx+3] = e.x; posAttr.array[idx+4] = e.y; posAttr.array[idx+5] = e.z;
        const t1 = j / (pts.length - 1);
        const t2 = (j + 1) / (pts.length - 1);
        colorAttr.array[idx]   = THREE.MathUtils.lerp(cA.r, cB.r, t1);
        colorAttr.array[idx+1] = THREE.MathUtils.lerp(cA.g, cB.g, t1);
        colorAttr.array[idx+2] = THREE.MathUtils.lerp(cA.b, cB.b, t1);
        colorAttr.array[idx+3] = THREE.MathUtils.lerp(cA.r, cB.r, t2);
        colorAttr.array[idx+4] = THREE.MathUtils.lerp(cA.g, cB.g, t2);
        colorAttr.array[idx+5] = THREE.MathUtils.lerp(cA.b, cB.b, t2);
        idx += 6;
      });
    }
  });
  // zero out remaining
  for (; idx < posAttr.array.length; idx++) {
    posAttr.array[idx] = 0;
    colorAttr.array[idx] = 0;
  }
  posAttr.needsUpdate = true;
  colorAttr.needsUpdate = true;
  lineSegs.computeLineDistances();
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

  const distances = pairs.map(p => p.distance);
  const largestPairDistance = Math.max(...distances);
  const smallestPairDistance = Math.min(...distances);
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
      const normDist = (distance - smallestPairDistance) / (largestPairDistance - smallestPairDistance || 1);
      const width = THREE.MathUtils.lerp(connectionMaxWidth, 1, normDist);
      const opacity = THREE.MathUtils.lerp(1.0, 0.3, normDist) * opacityFactor;
      const segments = splitMollweideWrap(
        starA.mollweidePosition,
        starB.mollweidePosition
      );
      segments.forEach(([s1, s2]) => {
        const pts = [s1, s2];
        const geom = buildWideLineGeometry(pts, width);
        const mat = createWideLineMaterial(c1.clone().lerp(c2, 0.5));
        mat.uniforms.opacityFactor.value = opacity;
        mat.uniforms.fadePower.value = connectionFadePower;
        const mesh = new THREE.Mesh(geom, mat);
        mesh.renderOrder = 3;
        lines.push(mesh);
      });
      return;
    } else {
      // Use the computed truePosition if available
      posA = getPosition(starA).clone();
      posB = getPosition(starB).clone();
    }
    
    const gradientColor = c1.clone().lerp(c2, 0.5);

    const normDist = (distance - smallestPairDistance) / (largestPairDistance - smallestPairDistance || 1);
    const lineThickness = THREE.MathUtils.lerp(connectionMaxWidth, 1, normDist);
    const lineOpacity = THREE.MathUtils.lerp(1.0, 0.3, normDist) * opacityFactor;
    
    let points;
    if (mapType === 'Globe') {
      const R = 100;
      const curve = new THREE.CatmullRomCurve3(getGreatCirclePoints(posA, posB, R, 32));
      points = curve.getPoints(32);
    } else {
      points = [posA, posB];
    }

    const geometryLine = new THREE.BufferGeometry().setFromPoints(points);
    const materialLine = new THREE.LineBasicMaterial({
      color: gradientColor,
      transparent: true,
      opacity: lineOpacity,
      linewidth: lineThickness
    });
    const line = new THREE.Line(geometryLine, materialLine);
    if (mapType === 'Globe') {
      line.renderOrder = 1;
    } else if (mapType === 'Mollweide') {
      line.renderOrder = 3;
    }
    lines.push(line);
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
