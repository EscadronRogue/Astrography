import * as THREE from '../../vendor/three.js';
import { radToSphere } from '../../shared/geometryUtils.js';
import { buildWideLineGeometry } from '../../render/engine/renderUtils.js';
import { getDoubleSidedLabelMaterial } from '../density/densityColorScale.js';
import { clamp01 } from '../../shared/colorParsing.js';
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
  const R = 100;
  const lineColor = makeConstellationLineColor();
  const segments = getConstellationBoundaries();
  if (!segments.length) return [];

  const positions = new Float32Array(segments.length * 2 * 3);
  let index = 0;
  segments.forEach(segment => {
    const p1 = radToSphere(segment.ra1, segment.dec1, R);
    const p2 = radToSphere(segment.ra2, segment.dec2, R);
    positions[index++] = p1.x;
    positions[index++] = p1.y;
    positions[index++] = p1.z;
    positions[index++] = p2.x;
    positions[index++] = p2.y;
    positions[index++] = p2.z;
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: lineColor,
    linewidth: lineWidth,
    transparent: true,
    opacity
  });
  const lineSegments = new THREE.LineSegments(geometry, material);
  lineSegments.userData = {
    baseLineWidth: lineWidth,
    baseOpacity: opacity
  };
  return [lineSegments];
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
  const clampedOpacity = clamp01(baseOpacity);
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
    const fontSize = c.fontSize || 300;
    const canvas = createConstellationLabelCanvas(displayName, opacity, fontSize);
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
    label.userData = { name: c.name, displayName, ra: c.ra, dec: c.dec, fontSize };
    labels.push(label);
  });
  return labels;
}
