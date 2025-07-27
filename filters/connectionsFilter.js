// filters/connectionsFilter.js

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { adjustMollweideWrap, splitMollweideWrap, greatCircleToMollweide, getMollweideLambda0 } from '../utils/geometryUtils.js';

const GC_SEGMENTS = 32;

function createFadingLineMaterial(opacity = 1.0) {
  return new THREE.ShaderMaterial({
    uniforms: { opacity: { value: opacity } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexColors: true,
    vertexShader: `
      attribute float side;
      attribute float linePos;
      varying float vSide;
      varying float vPos;
      varying vec3 vColor;
      void main() {
        vSide = side;
        vPos = linePos;
        vColor = color;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float opacity;
      varying float vSide;
      varying float vPos;
      varying vec3 vColor;
      void main() {
        float alpha = 0.5 * (1.0 - abs(vSide)) * opacity;
        alpha *= smoothstep(0.0, 0.1, vPos) * smoothstep(1.0, 0.9, vPos);
        if(alpha <= 0.0) discard;
        gl_FragColor = vec4(vColor, alpha);
      }
    `
  });
}

function buildWideLineGeometry(points, width, colorStart, colorEnd) {
  const vertices = [];
  const sides = [];
  const linePos = [];
  const colors = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dir = new THREE.Vector2(p2.x - p1.x, p2.y - p1.y).normalize();
    const perp = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(width / 2);
    const a1 = new THREE.Vector3(p1.x + perp.x, p1.y + perp.y, p1.z);
    const a2 = new THREE.Vector3(p1.x - perp.x, p1.y - perp.y, p1.z);
    const b1 = new THREE.Vector3(p2.x + perp.x, p2.y + perp.y, p2.z);
    const b2 = new THREE.Vector3(p2.x - perp.x, p2.y - perp.y, p2.z);
    const t1 = i / (points.length - 1);
    const t2 = (i + 1) / (points.length - 1);
    const c1 = colorStart.clone().lerp(colorEnd, t1);
    const c2 = colorStart.clone().lerp(colorEnd, t2);

    vertices.push(a1.x, a1.y, a1.z, a2.x, a2.y, a2.z, b2.x, b2.y, b2.z);
    sides.push(1, -1, -1);
    linePos.push(t1, t1, t2);
    colors.push(c1.r, c1.g, c1.b, c1.r, c1.g, c1.b, c2.r, c2.g, c2.b);

    vertices.push(a1.x, a1.y, a1.z, b2.x, b2.y, b2.z, b1.x, b1.y, b1.z);
    sides.push(1, -1, 1);
    linePos.push(t1, t2, t2);
    colors.push(c1.r, c1.g, c1.b, c2.r, c2.g, c2.b, c2.r, c2.g, c2.b);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geom.setAttribute('side', new THREE.Float32BufferAttribute(sides, 1));
  geom.setAttribute('linePos', new THREE.Float32BufferAttribute(linePos, 1));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geom;
}

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
  const vertices = [];
  const sides = [];
  const linePositions = [];
  const colors = [];
  const largest = connectionObjs.reduce((m, p) => Math.max(m, p.distance), 0);

  connectionObjs.forEach(pair => {
    const { starA, starB, distance } = pair;
    const c1 = new THREE.Color(starA.displayColor || '#ffffff');
    const c2 = new THREE.Color(starB.displayColor || '#ffffff');
    let segments;
    if (mapType === 'Globe') {
      segments = [[starA.spherePosition, starB.spherePosition]];
    } else if (mapType === 'Mollweide') {
      segments = splitMollweideWrap(
        starA.mollweidePosition,
        starB.mollweidePosition
      );
    } else {
      segments = [[getPosition(starA), getPosition(starB)]];
    }
    segments.forEach(([s1, s2]) => {
      const width = THREE.MathUtils.lerp(10, 1, distance / (largest || distance));
      const geom = buildWideLineGeometry([s1, s2], width, c1, c2);
      vertices.push(...geom.getAttribute('position').array);
      sides.push(...geom.getAttribute('side').array);
      linePositions.push(...geom.getAttribute('linePos').array);
      colors.push(...geom.getAttribute('color').array);
    });
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('side', new THREE.Float32BufferAttribute(sides, 1));
  geometry.setAttribute('linePos', new THREE.Float32BufferAttribute(linePositions, 1));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = createFadingLineMaterial(opacity);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData = { pairs, segments: GC_SEGMENTS };
  return mesh;
}

export function createMollweideConnectionSegments(pairs, opacity = 0.5) {
  const vertices = [];
  const sides = [];
  const linePos = [];
  const colors = [];
  const largest = pairs.reduce((m, p) => Math.max(m, p.distance), 0);
  pairs.forEach(pair => {
    const c1 = new THREE.Color(pair.starA.displayColor || '#ffffff');
    const c2 = new THREE.Color(pair.starB.displayColor || '#ffffff');
    const gcPts = greatCircleToMollweide(
      pair.starA.spherePosition,
      pair.starB.spherePosition,
      100,
      GC_SEGMENTS,
      getMollweideLambda0()
    );
    for (let j = 0; j < gcPts.length - 1; j++) {
      const segs = splitMollweideWrap(gcPts[j], gcPts[j + 1]);
      segs.forEach(([s, e]) => {
        const width = THREE.MathUtils.lerp(10, 1, pair.distance / (largest || pair.distance));
        const geom = buildWideLineGeometry([s, e], width, c1, c2);
        vertices.push(...geom.getAttribute('position').array);
        sides.push(...geom.getAttribute('side').array);
        linePos.push(...geom.getAttribute('linePos').array);
        colors.push(...geom.getAttribute('color').array);
      });
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('side', new THREE.Float32BufferAttribute(sides, 1));
  geometry.setAttribute('linePos', new THREE.Float32BufferAttribute(linePos, 1));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = createFadingLineMaterial(opacity);
  const mesh = new THREE.Mesh(geometry, material);
  return mesh;
}

export function updateMollweideConnectionSegments(lineSegs) {
  const pairs = lineSegs.userData.pairs || [];
  const vertices = [];
  const sides = [];
  const linePos = [];
  const colors = [];
  const largest = pairs.reduce((m, p) => Math.max(m, p.distance), 0);
  pairs.forEach(pair => {
    const c1 = new THREE.Color(pair.starA.displayColor || '#ffffff');
    const c2 = new THREE.Color(pair.starB.displayColor || '#ffffff');
    const pts = greatCircleToMollweide(
      pair.starA.spherePosition,
      pair.starB.spherePosition,
      100,
      lineSegs.userData.segments || GC_SEGMENTS,
      getMollweideLambda0()
    );
    for (let j = 0; j < pts.length - 1; j++) {
      const segs = splitMollweideWrap(pts[j], pts[j + 1]);
      segs.forEach(([s, e]) => {
        const width = THREE.MathUtils.lerp(10, 1, pair.distance / (largest || pair.distance));
        const geom = buildWideLineGeometry([s, e], width, c1, c2);
        vertices.push(...geom.getAttribute('position').array);
        sides.push(...geom.getAttribute('side').array);
        linePos.push(...geom.getAttribute('linePos').array);
        colors.push(...geom.getAttribute('color').array);
      });
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('side', new THREE.Float32BufferAttribute(sides, 1));
  geometry.setAttribute('linePos', new THREE.Float32BufferAttribute(linePos, 1));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  lineSegs.geometry.dispose();
  lineSegs.geometry = geometry;
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
      segments.forEach(([s1, s2]) => {
        const points = [s1, s2];
        const lineOpacity = THREE.MathUtils.lerp(1.0, 0.3, distance / (largestPairDistance || distance)) * opacityFactor;
        const width = THREE.MathUtils.lerp(10, 1, distance / (largestPairDistance || distance));
        const geom = buildWideLineGeometry(points, width, c1, c2);
        const material = createFadingLineMaterial(lineOpacity);
        const mesh = new THREE.Mesh(geom, material);
        mesh.renderOrder = 1;
        lines.push(mesh);
      });
      return;
    } else {
      // Use the computed truePosition if available
      posA = getPosition(starA).clone();
      posB = getPosition(starB).clone();
    }
    
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
    const geom = buildWideLineGeometry(points, lineThickness, c1, c2);
    const materialLine = createFadingLineMaterial(lineOpacity);
    const mesh = new THREE.Mesh(geom, materialLine);
    if (mapType === 'Globe') {
      mesh.renderOrder = 1;
    }
    lines.push(mesh);
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
