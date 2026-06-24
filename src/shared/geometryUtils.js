import * as THREE from '../vendor/three.js';

/**
 * Converts RA and DEC in radians to a point on a sphere of radius R.
 */
export function radToSphere(ra, dec, R) {
  const x = -R * Math.cos(dec) * Math.cos(ra);
  const y = R * Math.sin(dec);
  const z = -R * Math.cos(dec) * Math.sin(ra);
  return new THREE.Vector3(x, y, z);
}

/**
 * Subdivides all triangles of a BufferGeometry.
 */
export function subdivideGeometry(geometry, iterations) {
  let geo = geometry;
  for (let iter = 0; iter < iterations; iter += 1) {
    const posAttr = geo.getAttribute('position');
    const oldPositions = [];
    for (let i = 0; i < posAttr.count; i += 1) {
      oldPositions.push(new THREE.Vector3().fromBufferAttribute(posAttr, i));
    }

    const oldIndices = geo.getIndex().array;
    const newVertices = [...oldPositions];
    const newIndices = [];
    const midpointCache = {};

    function getMidpoint(i1, i2) {
      const key = i1 < i2 ? `${i1}_${i2}` : `${i2}_${i1}`;
      if (midpointCache[key] !== undefined) return midpointCache[key];
      const mid = new THREE.Vector3()
        .addVectors(newVertices[i1], newVertices[i2])
        .multiplyScalar(0.5)
        .normalize()
        .multiplyScalar(100);
      newVertices.push(mid);
      const index = newVertices.length - 1;
      midpointCache[key] = index;
      return index;
    }

    for (let i = 0; i < oldIndices.length; i += 3) {
      const i0 = oldIndices[i];
      const i1 = oldIndices[i + 1];
      const i2 = oldIndices[i + 2];
      const m0 = getMidpoint(i0, i1);
      const m1 = getMidpoint(i1, i2);
      const m2 = getMidpoint(i2, i0);
      newIndices.push(i0, m0, m2);
      newIndices.push(m0, i1, m1);
      newIndices.push(m0, m1, m2);
      newIndices.push(m2, m1, i2);
    }

    const positions = [];
    newVertices.forEach(vertex => {
      positions.push(vertex.x, vertex.y, vertex.z);
    });
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(newIndices);
    geo.computeVertexNormals();
  }
  return geo;
}

/**
 * Generates points along a great-circle arc between two sphere points.
 */
export function getGreatCirclePoints(p1, p2, R, segments) {
  const points = [];
  const start = p1.clone().normalize().multiplyScalar(R);
  const end = p2.clone().normalize().multiplyScalar(R);
  const axis = new THREE.Vector3().crossVectors(start, end).normalize();
  const angle = start.angleTo(end);

  for (let i = 0; i <= segments; i += 1) {
    const theta = (i / segments) * angle;
    const quaternion = new THREE.Quaternion().setFromAxisAngle(axis, theta);
    points.push(start.clone().applyQuaternion(quaternion));
  }

  return points;
}

export function degToRad(degrees) {
  return degrees * Math.PI / 180;
}

export function parseRA(raStr) {
  const [hh, mm, ss] = raStr.split(':').map(value => parseFloat(value));
  const hours = hh + mm / 60 + ss / 3600;
  return degToRad(hours * 15);
}

export function parseDec(decStr) {
  const sign = decStr.startsWith('-') ? -1 : 1;
  const stripped = decStr.replace('+', '').replace('-', '');
  const [dd, mm, ss] = stripped.split(':').map(value => parseFloat(value));
  return degToRad((dd + mm / 60 + ss / 3600) * sign);
}

export function vectorToRaDec(vector, R = 100) {
  const dec = Math.asin(vector.y / R);
  let ra = Math.atan2(-vector.z, -vector.x);
  let raDeg = ra * 180 / Math.PI;
  if (raDeg < 0) raDeg += 360;
  return { ra: raDeg, dec: dec * 180 / Math.PI };
}

export function vectorToRaDecRad(vector, R = 100) {
  const dec = Math.asin(vector.y / R);
  let ra = Math.atan2(-vector.z, -vector.x);
  if (ra < 0) ra += 2 * Math.PI;
  return { ra, dec };
}

const radToSphereCache = new Map();

export function clearRadToSphereCache() {
  radToSphereCache.clear();
}

export function cachedRadToSphere(ra, dec, R) {
  const key = `${ra}_${dec}_${R}`;
  if (radToSphereCache.has(key)) {
    return radToSphereCache.get(key).clone();
  }
  const vector = radToSphere(ra, dec, R);
  radToSphereCache.set(key, vector.clone());
  return vector;
}
