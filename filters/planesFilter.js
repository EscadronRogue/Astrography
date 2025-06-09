// filters/planesFilter.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { radToSphere, radToMollweide, getMollweideLambda0, splitMollweideWrap } from '../utils/geometryUtils.js';

const DEG2RAD = Math.PI / 180;

// Galactic to equatorial conversion constants (J2000)
const alphaGP = 192.85948 * DEG2RAD;
const deltaGP = 27.12825 * DEG2RAD;
const lOmega  = 32.93192 * DEG2RAD;

// Obliquity of the ecliptic
const epsilon = 23.43928 * DEG2RAD;

function galacticToEquatorial(l, b) {
  const sinb = Math.sin(b);
  const cosb = Math.cos(b);
  const sinl = Math.sin(l - lOmega);
  const cosl = Math.cos(l - lOmega);
  const sinDec = sinb * Math.cos(deltaGP) + cosb * Math.sin(deltaGP) * cosl;
  const dec = Math.asin(sinDec);
  const y = sinl * cosb;
  const x = cosb * cosl * Math.cos(deltaGP) - sinb * Math.sin(deltaGP);
  let ra = Math.atan2(y, x) + alphaGP;
  if (ra < 0) ra += 2 * Math.PI;
  if (ra > 2 * Math.PI) ra -= 2 * Math.PI;
  return { ra, dec };
}

function eclipticToEquatorial(lambda, beta = 0) {
  const sinB = Math.sin(beta);
  const cosB = Math.cos(beta);
  const sinL = Math.sin(lambda);
  const cosL = Math.cos(lambda);
  const sinDec = sinB * Math.cos(epsilon) + cosB * Math.sin(epsilon) * sinL;
  const dec = Math.asin(sinDec);
  const y = sinL * Math.cos(epsilon) - sinB * Math.sin(epsilon) * cosL / cosB;
  const x = cosL;
  let ra = Math.atan2(y, x);
  if (ra < 0) ra += 2 * Math.PI;
  return { ra, dec };
}

export function createGalacticPlaneMesh(size = 250) {
  const geom = new THREE.PlaneGeometry(size, size);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.2, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(geom, mat);
  const pole = radToSphere(alphaGP, deltaGP, 1);
  mesh.lookAt(pole);
  return mesh;
}

export function createEclipticPlaneMesh(size = 250) {
  const geom = new THREE.PlaneGeometry(size, size);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffff00, opacity: 0.2, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(geom, mat);
  const pole = radToSphere(270 * DEG2RAD, 66.5607 * DEG2RAD, 1);
  mesh.lookAt(pole);
  return mesh;
}

export function createCelestialEquatorMesh(size = 250) {
  const geom = new THREE.PlaneGeometry(size, size);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, opacity: 0.2, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(geom, mat);
  const pole = radToSphere(0, 90 * DEG2RAD, 1);
  mesh.lookAt(pole);
  return mesh;
}

function createGreatCircleLine(points, color, width = 2) {
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.5,
    linewidth: width
  });
  return new THREE.Line(geom, mat);
}

export function createGalacticPlaneGlobe(R = 100, segments = 180) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const l = (i / segments) * 2 * Math.PI;
    const { ra, dec } = galacticToEquatorial(l, 0);
    pts.push(radToSphere(ra, dec, R));
  }
  return createGreatCircleLine(pts, 0xffffff, 12);
}

export function createEclipticPlaneGlobe(R = 100, segments = 180) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const lam = (i / segments) * 2 * Math.PI;
    const { ra, dec } = eclipticToEquatorial(lam, 0);
    pts.push(radToSphere(ra, dec, R));
  }
  return createGreatCircleLine(pts, 0xffff00, 6);
}

export function createCelestialEquatorGlobe(R = 100, segments = 180) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const ra = (i / segments) * 2 * Math.PI;
    const dec = 0;
    pts.push(radToSphere(ra, dec, R));
  }
  return createGreatCircleLine(pts, 0xff0000, 6);
}

export function createGalacticPlaneMollweide(segments = 180) {
  const line = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 12, transparent: true, opacity: 0.5 })
  );
  line.userData.segments = segments;
  updateGalacticPlaneMollweide(line);
  return line;
}

export function updateGalacticPlaneMollweide(line) {
  const segments = line.userData.segments || 180;
  const lambda0 = getMollweideLambda0();
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const l = (i / segments) * 2 * Math.PI;
    const { ra, dec } = galacticToEquatorial(l, 0);
    pts.push(radToMollweide(ra, dec, 100, lambda0));
  }
  const positions = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const splits = splitMollweideWrap(pts[i], pts[i + 1]);
    splits.forEach(pair => {
      positions.push(pair[0].x, pair[0].y, 0);
      positions.push(pair[1].x, pair[1].y, 0);
    });
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  line.geometry.dispose();
  line.geometry = geom;
}

export function createEclipticPlaneMollweide(segments = 180) {
  const line = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 6, transparent: true, opacity: 0.5 })
  );
  line.userData.segments = segments;
  updateEclipticPlaneMollweide(line);
  return line;
}

export function createCelestialEquatorMollweide(segments = 180) {
  const line = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 6, transparent: true, opacity: 0.5 })
  );
  line.userData.segments = segments;
  updateCelestialEquatorMollweide(line);
  return line;
}

export function updateEclipticPlaneMollweide(line) {
  const segments = line.userData.segments || 180;
  const lambda0 = getMollweideLambda0();
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const lam = (i / segments) * 2 * Math.PI;
    const { ra, dec } = eclipticToEquatorial(lam, 0);
    pts.push(radToMollweide(ra, dec, 100, lambda0));
  }
  const positions = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const splits = splitMollweideWrap(pts[i], pts[i + 1]);
    splits.forEach(pair => {
      positions.push(pair[0].x, pair[0].y, 0);
      positions.push(pair[1].x, pair[1].y, 0);
    });
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  line.geometry.dispose();
  line.geometry = geom;
}

export function updateCelestialEquatorMollweide(line) {
  const segments = line.userData.segments || 180;
  const lambda0 = getMollweideLambda0();
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const ra = (i / segments) * 2 * Math.PI;
    pts.push(radToMollweide(ra, 0, 100, lambda0));
  }
  const positions = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const splits = splitMollweideWrap(pts[i], pts[i + 1]);
    splits.forEach(pair => {
      positions.push(pair[0].x, pair[0].y, 0);
      positions.push(pair[1].x, pair[1].y, 0);
    });
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  line.geometry.dispose();
  line.geometry = geom;
}
