// /filters/constellationFilter.js

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { radToSphere, getGreatCirclePoints, cachedRadToMollweide, getMollweideLambda0 } from '../utils/geometryUtils.js';

let boundaryData = [];
let centerData = [];

/**
 * Loads constellation boundary data asynchronously.
 */
export async function loadConstellationBoundaries() {
  try {
    const resp = await fetch('constellation_boundaries.txt');
    if (!resp.ok) throw new Error(`Failed to load constellation_boundaries.txt: ${resp.status}`);
    const raw = await resp.text();
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l);
    boundaryData = [];
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 8) continue;
      const raStr1 = parts[2];
      const decStr1 = parts[3];
      const raStr2 = parts[4];
      const decStr2 = parts[5];
      const c1 = parts[6];
      const c2 = parts[7];
      const ra1 = parseRA(raStr1);
      const dec1 = parseDec(decStr1);
      const ra2 = parseRA(raStr2);
      const dec2 = parseDec(decStr2);
      boundaryData.push({ ra1, dec1, ra2, dec2, const1: c1, const2: c2 });
    }
    console.log(`[ConstellationFilter] Boundaries: loaded ${boundaryData.length} lines.`);
  } catch (err) {
    console.error('Error loading constellation boundaries:', err);
    boundaryData = [];
  }
}

/**
 * Loads constellation center data asynchronously.
 */
export async function loadConstellationCenters() {
  try {
    const resp = await fetch('constellation_center.txt');
    if (!resp.ok) throw new Error(`Failed to load constellation_center.txt: ${resp.status}`);
    const raw = await resp.text();
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l);
    centerData = [];
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 5) continue;
      const raStr = parts[2];
      const decStr = parts[3];
      const matchName = line.match(/"([^"]+)"/);
      const name = matchName ? matchName[1] : 'Unknown';
      const raVal = parseRA(raStr);
      const decVal = parseDec(decStr);
      centerData.push({ ra: raVal, dec: decVal, name });
    }
    console.log(`[ConstellationFilter] Centers: loaded ${centerData.length} items.`);
  } catch (err) {
    console.error('Error loading constellation centers:', err);
    centerData = [];
  }
}

/**
 * Returns the loaded constellation centers.
 */
export function getConstellationCenters() {
  return centerData;
}

/**
 * Returns the loaded constellation boundaries.
 */
export function getConstellationBoundaries() {
  return boundaryData;
}

/**
 * Creates constellation boundary line meshes for the Globe.
 */
export function createConstellationBoundariesForGlobe() {
  const lines = [];
  const R = 100;
  boundaryData.forEach(b => {
    const p1 = radToSphere(b.ra1, b.dec1, R);
    const p2 = radToSphere(b.ra2, b.dec2, R);
    // Create a smooth curved line using a CatmullRom curve
    const curve = new THREE.CatmullRomCurve3(
      getGreatCirclePoints(p1, p2, R, 32)
    );
    const points = curve.getPoints(32);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineDashedMaterial({
      color: 0x888888,
      dashSize: 2,
      gapSize: 1,
      linewidth: 1
    });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    lines.push(line);
  });
  return lines;
}

export function createConstellationBoundariesForMollweide() {
  const lines = [];
  const R = 100;
  const lambda0 = getMollweideLambda0();
  boundaryData.forEach(b => {
    const p1 = cachedRadToMollweide(b.ra1, b.dec1, R, lambda0);
    const p2 = cachedRadToMollweide(b.ra2, b.dec2, R, lambda0);
    const pos1 = p1.clone();
    const pos2 = p2.clone();
    if (Math.abs(pos1.x - pos2.x) > 200) {
      if (pos1.x > pos2.x) pos1.x -= 400; else pos2.x -= 400;
    }
    const geometry = new THREE.BufferGeometry().setFromPoints([pos1, pos2]);
    const material = new THREE.LineDashedMaterial({
      color: 0x888888,
      dashSize: 2,
      gapSize: 1,
      linewidth: 1
    });
    const line = new THREE.Line(geometry, material);
    line.computeLineDistances();
    lines.push(line);
  });
  return lines;
}

/**
 * Creates constellation label meshes for the Globe.
 * The labels are rendered using a custom shader material so that they are double-sided
 * and always oriented correctly.
 */
export function createConstellationLabelsForGlobe() {
  const labels = [];
  const R = 100;
  // For each center from the loaded centerData
  centerData.forEach(c => {
    const p = radToSphere(c.ra, c.dec, R);
    const baseFontSize = 300; // Very large base font size
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${baseFontSize}px Arial`;
    const textWidth = ctx.measureText(c.name).width;
    canvas.width = textWidth + 20;
    canvas.height = baseFontSize * 1.2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${baseFontSize}px Arial`;
    ctx.fillStyle = '#888888';
    ctx.fillText(c.name, 10, baseFontSize);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: texture },
        opacity: { value: 0.5 }
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        uniform float opacity;
        varying vec2 vUv;
        void main() {
          vec2 uvCorrected = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);
          vec4 color = texture2D(map, uvCorrected);
          gl_FragColor = vec4(color.rgb, color.a * opacity);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide
    });
    const planeGeom = new THREE.PlaneGeometry(canvas.width / 100, canvas.height / 100);
    const label = new THREE.Mesh(planeGeom, material);
    label.position.copy(p);
    // Orient the label so that its up vector is aligned with the projection of global up onto the tangent plane.
    const normal = p.clone().normalize();
    const globalUp = new THREE.Vector3(0, 1, 0);
    let desiredUp = globalUp.clone().sub(normal.clone().multiplyScalar(globalUp.dot(normal)));
    if (desiredUp.lengthSq() < 1e-6) desiredUp = new THREE.Vector3(0, 0, 1);
    else desiredUp.normalize();
    const desiredRight = new THREE.Vector3().crossVectors(desiredUp, normal).normalize();
    const matrix = new THREE.Matrix4().makeBasis(desiredRight, desiredUp, normal);
    label.setRotationFromMatrix(matrix);
    label.renderOrder = 1;
    labels.push(label);
  });
  return labels;
}

export function createConstellationLabelsForMollweide() {
  const labels = [];
  const R = 100;
  const lambda0 = getMollweideLambda0();
  centerData.forEach(c => {
    const p = cachedRadToMollweide(c.ra, c.dec, R, lambda0);
    const baseFontSize = 300;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = `${baseFontSize}px Arial`;
    const textWidth = ctx.measureText(c.name).width;
    canvas.width = textWidth + 20;
    canvas.height = baseFontSize * 1.2;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${baseFontSize}px Arial`;
    ctx.fillStyle = '#888888';
    ctx.fillText(c.name, 10, baseFontSize);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity: 0.5 });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(canvas.width / 100, canvas.height / 100, 1);
    sprite.position.copy(p);
    labels.push(sprite);
  });
  return labels;
}

export function createConstellationOverlayForMollweide() {
  const boundaries = getConstellationBoundaries();
  const groups = {};
  const lambda0 = getMollweideLambda0();
  boundaries.forEach(seg => {
    const key1 = seg.const1 ? seg.const1.toUpperCase() : null;
    const key2 = seg.const2 ? seg.const2.toUpperCase() : null;
    if (key1) {
      if (!groups[key1]) groups[key1] = [];
      groups[key1].push(seg);
    }
    if (key2 && key2 !== key1) {
      if (!groups[key2]) groups[key2] = [];
      groups[key2].push(seg);
    }
  });
  const colorMapping = computeConstellationColorMapping();
  const overlays = [];
  for (const constellation in groups) {
    const segs = groups[constellation];
    const points = [];
    segs.forEach(seg => {
      const p1 = cachedRadToMollweide(seg.ra1, seg.dec1, 100, lambda0);
      const p2 = cachedRadToMollweide(seg.ra2, seg.dec2, 100, lambda0);
      if (Math.abs(p1.x - p2.x) > 200) {
        if (p1.x > p2.x) p1.x -= 400; else p2.x -= 400;
      }
      points.push(p1);
      points.push(p2);
    });
    const shape = new THREE.Shape(points.map(p => new THREE.Vector2(p.x, p.y)));
    const geometry = new THREE.ShapeGeometry(shape);
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorMapping[constellation]),
      opacity: 0.15,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    overlays.push(mesh);
  }
  return overlays;
}

/**
 * Parses a Right Ascension string (e.g. "12:34:56") into radians.
 */
function parseRA(raStr) {
  const [hh, mm, ss] = raStr.split(':').map(x => parseFloat(x));
  const hours = hh + mm / 60 + ss / 3600;
  const deg = hours * 15;
  return degToRad(deg);
}

/**
 * Parses a Declination string (e.g. "-12:34:56") into radians.
 */
function parseDec(decStr) {
  const sign = decStr.startsWith('-') ? -1 : 1;
  const stripped = decStr.replace('+', '').replace('-', '');
  const [dd, mm, ss] = stripped.split(':').map(x => parseFloat(x));
  const degVal = (dd + mm / 60 + ss / 3600) * sign;
  return degToRad(degVal);
}

/**
 * Converts degrees to radians.
 */
function degToRad(d) {
  return d * Math.PI / 180;
}
