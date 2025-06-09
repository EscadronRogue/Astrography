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

// J2000 Galactic -> Equatorial rotation matrix (IAU, transpose of equatorial
// to galactic matrix)
const GAL_TO_EQ_MATRIX = [
  [-0.0548755604162154, 0.4941094278755837, -0.8676661490190047],
  [-0.8734370902348850, -0.4448296299600112, -0.1980763734312015],
  [-0.4838350155487132, 0.7469822444972189, 0.4559837761750669]
];

function galacticToEquatorial(l, b) {
  const cosb = Math.cos(b);
  const vx = cosb * Math.cos(l);
  const vy = cosb * Math.sin(l);
  const vz = Math.sin(b);
  const eqx =
    GAL_TO_EQ_MATRIX[0][0] * vx +
    GAL_TO_EQ_MATRIX[0][1] * vy +
    GAL_TO_EQ_MATRIX[0][2] * vz;
  const eqy =
    GAL_TO_EQ_MATRIX[1][0] * vx +
    GAL_TO_EQ_MATRIX[1][1] * vy +
    GAL_TO_EQ_MATRIX[1][2] * vz;
  const eqz =
    GAL_TO_EQ_MATRIX[2][0] * vx +
    GAL_TO_EQ_MATRIX[2][1] * vy +
    GAL_TO_EQ_MATRIX[2][2] * vz;
  let ra = Math.atan2(eqy, eqx);
  if (ra < 0) ra += 2 * Math.PI;
  const dec = Math.asin(eqz);
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
  return createGreatCircleLine(pts, 0xffffff, 20);
}

export function createEclipticPlaneGlobe(R = 100, segments = 180) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const lam = (i / segments) * 2 * Math.PI;
    const { ra, dec } = eclipticToEquatorial(lam, 0);
    pts.push(radToSphere(ra, dec, R));
  }
  return createGreatCircleLine(pts, 0xffff00, 10);
}

export function createCelestialEquatorGlobe(R = 100, segments = 180) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const ra = (i / segments) * 2 * Math.PI;
    const dec = 0;
    pts.push(radToSphere(ra, dec, R));
  }
  return createGreatCircleLine(pts, 0xff0000, 10);
}

export function createGalacticPlaneMollweide(segments = 180) {
  const line = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 20, transparent: true, opacity: 0.5 })
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
    new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 10, transparent: true, opacity: 0.5 })
  );
  line.userData.segments = segments;
  updateEclipticPlaneMollweide(line);
  return line;
}

export function createCelestialEquatorMollweide(segments = 180) {
  const line = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 10, transparent: true, opacity: 0.5 })
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

function createTextSprite(text, color = '#ffffff', opacity = 0.8, fontSize = 150) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `${fontSize}px Arial`;
  const textWidth = ctx.measureText(text).width;
  canvas.width = textWidth + 20;
  canvas.height = fontSize * 1.2;
  ctx.font = `${fontSize}px Arial`;
  ctx.fillStyle = color;
  ctx.fillText(text, 10, fontSize);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(canvas.width / 100, canvas.height / 100, 1);
  return sprite;
}

function galacticDirectionData() {
  return [
    { l: 0, label: 'Galactic Center' },
    { l: Math.PI, label: 'Galactic Anticenter' },
    { l: Math.PI / 2, label: 'Galactic Rotation' },
    { l: 3 * Math.PI / 2, label: 'Galactic Anti-Rotation' }
  ];
}

export function createGalacticDirectionLabelsTrue(R = 100) {
  const labels = [];
  galacticDirectionData().forEach(d => {
    const eq = galacticToEquatorial(d.l, 0);
    const pos = radToSphere(eq.ra, eq.dec, R);
    const sprite = createTextSprite(d.label);
    sprite.position.copy(pos);
    labels.push(sprite);
  });
  return labels;
}

export function createGalacticDirectionLabelsGlobe(R = 102) {
  const labels = [];
  galacticDirectionData().forEach(d => {
    const eq = galacticToEquatorial(d.l, 0);
    const pos = radToSphere(eq.ra, eq.dec, R);
    const sprite = createTextSprite(d.label);
    sprite.position.copy(pos);
    const normal = pos.clone().normalize();
    const globalUp = new THREE.Vector3(0, 1, 0);
    let desiredUp = globalUp.clone().sub(normal.clone().multiplyScalar(globalUp.dot(normal)));
    if (desiredUp.lengthSq() < 1e-6) desiredUp = new THREE.Vector3(0, 0, 1); else desiredUp.normalize();
    const desiredRight = new THREE.Vector3().crossVectors(desiredUp, normal).normalize();
    const matrix = new THREE.Matrix4().makeBasis(desiredRight, desiredUp, normal);
    sprite.setRotationFromMatrix(matrix);
    sprite.renderOrder = 1;
    labels.push(sprite);
  });
  return labels;
}

export function createGalacticDirectionLabelsMollweide(R = 100) {
  const lambda0 = getMollweideLambda0();
  const labels = [];
  galacticDirectionData().forEach(d => {
    const eq = galacticToEquatorial(d.l, 0);
    const p = radToMollweide(eq.ra, eq.dec, R, lambda0);
    const sprite = createTextSprite(d.label);
    sprite.position.set(p.x, p.y, 0);
    labels.push(sprite);
  });
  return labels;
}

export function updateGalacticDirectionLabelsMollweide(labels, R = 100) {
  const lambda0 = getMollweideLambda0();
  const data = galacticDirectionData();
  labels.forEach((sprite, i) => {
    const eq = galacticToEquatorial(data[i].l, 0);
    const p = radToMollweide(eq.ra, eq.dec, R, lambda0);
    sprite.position.set(p.x, p.y, 0);
  });
}
