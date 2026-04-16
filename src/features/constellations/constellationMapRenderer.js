// Constellation boundary and label rendering migrated from the legacy constellation filter module.

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { radToSphere, getGreatCirclePoints, cachedRadToMollweide, getMollweideLambda0, splitMollweideWrap, greatCircleToMollweide } from '../../shared/geometryUtils.js';
import { buildWideLineGeometry, createWideLineMaterial } from '../../render/engine/renderUtils.js';
import { getDoubleSidedLabelMaterial } from '../density/densityColorScale.js';
import {
  loadConstellationBoundaries,
  loadConstellationCenters,
  loadConstellationFullNames,
  getConstellationFullNames,
  getConstellationBoundaries
} from './constellationDataService.js';
import { getConstellationLabelAnchors } from './constellationLabelPlacement.js';
import { CONSTELLATION_LINE_COLOR, createConstellationLabelCanvas, makeConstellationLineColor } from './constellationStyle.js';


/**
 * Creates constellation boundary line meshes for the Globe.
 */
export function createConstellationBoundariesForGlobe(opacity = 0.4, lineWidth = 1) {
  const lines = [];
  const R = 100;
  const lineColor = makeConstellationLineColor();
  getConstellationBoundaries().forEach(b => {
    const p1 = radToSphere(b.ra1, b.dec1, R);
    const p2 = radToSphere(b.ra2, b.dec2, R);
    // Create a smooth curved line using a CatmullRom curve
    const curve = new THREE.CatmullRomCurve3(
      getGreatCirclePoints(p1, p2, R, 32)
    );
    const points = curve.getPoints(32);
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: lineColor,
      linewidth: lineWidth,
      transparent: true,
      opacity
    });
    const line = new THREE.Line(geometry, material);
    line.userData = {
      baseLineWidth: lineWidth,
      baseOpacity: opacity
    };
    lines.push(line);
  });
  return lines;
}

function ensureVisibleConstellationMesh(lineSegs) {
  if (!lineSegs) return null;
  if (!lineSegs.userData) lineSegs.userData = {};
  if (!lineSegs.userData.visibleMesh) {
    const mesh = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.MeshBasicMaterial({
        color: CONSTELLATION_LINE_COLOR,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide
      })
    );
    mesh.renderOrder = (lineSegs.renderOrder || 1) + 0.01;
    mesh.userData = {
      baseWidth: 1,
      baseOpacity: 1,
      baseColor: CONSTELLATION_LINE_COLOR,
      exportLineWidthFactor: 1.5,
      exportOpacityFactor: 1,
      points: []
    };
    lineSegs.add(mesh);
    lineSegs.userData.visibleMesh = mesh;
  }
  return lineSegs.userData.visibleMesh;
}

export function rebuildConstellationMeshFromSegments(lineSegs, overrideWidth, overrideOpacity) {
  if (!lineSegs) return;
  const mesh = ensureVisibleConstellationMesh(lineSegs);
  if (!mesh) return;
  const posAttr = lineSegs.geometry ? lineSegs.geometry.getAttribute('position') : null;
  if (!posAttr) return;
  const arr = posAttr.array;
  const pts = [];
  for (let i = 0; i + 5 < arr.length; i += 6) {
    const ax = arr[i];
    const ay = arr[i + 1];
    const az = arr[i + 2];
    const bx = arr[i + 3];
    const by = arr[i + 4];
    const bz = arr[i + 5];
    if (
      !Number.isFinite(ax) || !Number.isFinite(ay) || !Number.isFinite(az) ||
      !Number.isFinite(bx) || !Number.isFinite(by) || !Number.isFinite(bz)
    ) {
      continue;
    }
    if (
      ax === 0 && ay === 0 && az === 0 &&
      bx === 0 && by === 0 && bz === 0
    ) {
      continue;
    }
    pts.push(new THREE.Vector3(ax, ay, az));
    pts.push(new THREE.Vector3(bx, by, bz));
  }
  const width = Math.max(0.1, overrideWidth !== undefined ? overrideWidth : (lineSegs.userData.baseLineWidth || 1));
  const baseOpacity = overrideOpacity !== undefined ? overrideOpacity : (lineSegs.userData.baseOpacity !== undefined ? lineSegs.userData.baseOpacity : mesh.material.opacity);
  if (pts.length === 0) {
    mesh.visible = false;
  } else {
    mesh.visible = true;
    const geometry = buildWideLineGeometry(pts, width);
    geometry.computeBoundingSphere();
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    mesh.geometry = geometry;
  }
  const clampedOpacity = Math.max(0, Math.min(1, baseOpacity));
  if (mesh.material && mesh.material.color) {
    mesh.material.color.setHex(CONSTELLATION_LINE_COLOR);
  }
  mesh.material.opacity = clampedOpacity;
  mesh.material.needsUpdate = true;
  mesh.userData.baseWidth = width;
  mesh.userData.baseOpacity = clampedOpacity;
  mesh.userData.points = pts.map(p => p.clone());
  mesh.userData.baseColor = CONSTELLATION_LINE_COLOR;
  if (mesh.userData.exportColor === undefined) mesh.userData.exportColor = CONSTELLATION_LINE_COLOR;
  if (mesh.userData.exportLineWidthFactor === undefined) mesh.userData.exportLineWidthFactor = 1.5;
  if (mesh.userData.exportOpacityFactor === undefined) mesh.userData.exportOpacityFactor = 1;
  lineSegs.userData.baseLineWidth = width;
  lineSegs.userData.baseOpacity = clampedOpacity;
}

export function createConstellationBoundariesForMollweide(opacity = 0.4, lineWidth = 1) {
  const R = 100;
  const sanitizedWidth = Math.max(0.1, lineWidth);
  const sanitizedOpacity = Math.max(0, Math.min(1, opacity));
  const material = new THREE.LineBasicMaterial({
    color: CONSTELLATION_LINE_COLOR,
    linewidth: sanitizedWidth,
    transparent: true,
    opacity: 0
  });
  const boundaryData = getConstellationBoundaries();
  const maxSegments = boundaryData.length * 32; // 16 segments per boundary, each may wrap
  const positions = new Float32Array(maxSegments * 2 * 3); // 2 vertices per segment
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const lineSegs = new THREE.LineSegments(geometry, material);
  lineSegs.renderOrder = 1;
  lineSegs.material.depthWrite = false;
  lineSegs.material.transparent = true;
  lineSegs.material.opacity = 0;
  lineSegs.userData = {
    boundaryData,
    R,
    baseLineWidth: sanitizedWidth,
    baseOpacity: sanitizedOpacity,
    exportLineWidthFactor: 1.5,
    exportOpacityFactor: 1
  };
  updateConstellationBoundariesForMollweide(lineSegs);
  return [lineSegs];
}

export function updateConstellationBoundariesForMollweide(lineSegs) {
  const R = lineSegs.userData.R || 100;
  const lambda0 = getMollweideLambda0();
  const data = lineSegs.userData.boundaryData || [];
  const posAttr = lineSegs.geometry.getAttribute('position');
  const array = posAttr.array;
  let idx = 0;
  data.forEach(seg => {
    const pStart = radToSphere(seg.ra1, seg.dec1, R);
    const pEnd   = radToSphere(seg.ra2, seg.dec2, R);
    const arcPts  = greatCircleToMollweide(pStart, pEnd, R, 16, lambda0);
    for (let j = 0; j < arcPts.length - 1; j++) {
      const splits = splitMollweideWrap(arcPts[j], arcPts[j + 1]);
      for (let s = 0; s < 2; s++) {
        if (s < splits.length) {
          const a = splits[s][0];
          const b = splits[s][1];
          array[idx++] = a.x; array[idx++] = a.y; array[idx++] = 0;
          array[idx++] = b.x; array[idx++] = b.y; array[idx++] = 0;
        } else {
          array[idx++] = 0; array[idx++] = 0; array[idx++] = 0;
          array[idx++] = 0; array[idx++] = 0; array[idx++] = 0;
        }
      }
    }
  });
  for (; idx < array.length; idx++) array[idx] = 0;
  posAttr.needsUpdate = true;
  lineSegs.computeLineDistances();
  rebuildConstellationMeshFromSegments(lineSegs);
}

/**
 * Creates constellation label meshes for the Globe.
 * The labels are rendered using a custom shader material so that they are double-sided
 * and always oriented correctly.
 */
export function createConstellationLabelsForGlobe(opacity = 0.8) {
  const labels = [];
  const R = 100;
  const fullNames = getConstellationFullNames();
  getConstellationLabelAnchors().forEach(c => {
    const p = radToSphere(c.ra, c.dec, R);
    const displayName = fullNames[c.name] || c.name;
    const canvas = createConstellationLabelCanvas(displayName, opacity, 300);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = getDoubleSidedLabelMaterial(texture, opacity);
    const planeGeom = new THREE.PlaneGeometry(canvas.width / 100, canvas.height / 100);
    const label = new THREE.Mesh(planeGeom, material);
    label.position.copy(p);
    const normal = p.clone().normalize();
    const globalUp = new THREE.Vector3(0, 1, 0);
    let desiredUp = globalUp.clone().sub(normal.clone().multiplyScalar(globalUp.dot(normal)));
    if (desiredUp.lengthSq() < 1e-6) desiredUp = new THREE.Vector3(0, 0, 1);
    else desiredUp.normalize();
    const desiredRight = new THREE.Vector3().crossVectors(desiredUp, normal).normalize();
    const matrix = new THREE.Matrix4().makeBasis(desiredRight, desiredUp, normal);
    label.setRotationFromMatrix(matrix);
    label.renderOrder = 0.5;
    if (label.material) {
      label.material.depthWrite = false;
      label.material.depthTest = true;
    }
    label.userData = { name: c.name, displayName, ra: c.ra, dec: c.dec };
    labels.push(label);
  });
  return labels;
}

export function createConstellationLabelsForMollweide(opacity = 0.8) {
  const labels = [];
  const R = 100;
  const lambda0 = getMollweideLambda0();
  const fullNames = getConstellationFullNames();
  getConstellationLabelAnchors().forEach(c => {
    const p = cachedRadToMollweide(c.ra, c.dec, R, lambda0);
    const displayName = fullNames[c.name] || c.name;
    const canvas = createConstellationLabelCanvas(displayName, opacity, 300);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity });
    const sprite = new THREE.Sprite(material);
    sprite.renderOrder = 0.5;
    sprite.material.depthWrite = false;
    sprite.material.depthTest = true;
    sprite.scale.set(canvas.width / 100, canvas.height / 100, 1);
    sprite.position.copy(p);
    sprite.userData = { name: c.name, displayName, ra: c.ra, dec: c.dec };
    labels.push(sprite);
  });
  return labels;
}

