import * as THREE from '../vendor/three.js';
import { buildWideLineGeometry } from '../render/engine/renderUtils.js';

export function angleDiff(a, b) {
  let diff = a - b;
  diff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
  return diff;
}

export function createGlobeGrid(R = 100, options = {}) {
  const group = new THREE.Group();
  const color = options.color ?? 0x444444;
  const opacity = options.opacity ?? 0.2;
  const lineWidth = options.lineWidth ?? 1;
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity
  });
  for (let lat = -75; lat <= 75; lat += 15) {
    const points = [];
    const phi = (90 - lat) * Math.PI / 180;
    for (let lon = -180; lon <= 180; lon += 5) {
      const theta = lon * Math.PI / 180;
      points.push(new THREE.Vector3(
        R * Math.sin(phi) * Math.cos(theta),
        R * Math.cos(phi),
        R * Math.sin(phi) * Math.sin(theta)
      ));
    }
    const geometry = lineWidth > 1
      ? buildWideLineGeometry(points, lineWidth)
      : new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material.clone());
    group.add(line);
  }
  for (let lon = -180; lon < 180; lon += 15) {
    const points = [];
    const theta = lon * Math.PI / 180;
    for (let lat = -90; lat <= 90; lat += 5) {
      const phi = (90 - lat) * Math.PI / 180;
      points.push(new THREE.Vector3(
        R * Math.sin(phi) * Math.cos(theta),
        R * Math.cos(phi),
        R * Math.sin(phi) * Math.sin(theta)
      ));
    }
    const geometry = lineWidth > 1
      ? buildWideLineGeometry(points, lineWidth)
      : new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material.clone());
    group.add(line);
  }
  return group;
}

export function createMollweideBackground(R = 100, segments = 1024) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const x = 2 * R * Math.cos(t);
    const y = R * Math.sin(t);
    points.push(new THREE.Vector2(x, y));
  }
  const shape = new THREE.Shape(points);
  const geometry = new THREE.ShapeGeometry(shape);
  const material = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 0;
  return mesh;
}

export function createMollweideBorder(R = 100, thickness = 1, opacity = 1, segments = 1024) {
  const borderPoints = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const x = 2 * R * Math.cos(t);
    const y = R * Math.sin(t);
    borderPoints.push(new THREE.Vector3(x, y, 0.05));
  }
  const geometry = buildWideLineGeometry(borderPoints, thickness);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 6;
  mesh.userData.points = borderPoints;
  mesh.userData.baseWidth = thickness;
  mesh.userData.baseOpacity = opacity;
  mesh.userData.baseColor = 0xffffff;
  mesh.userData.baseRadius = R;
  mesh.userData.segments = segments;
  mesh.userData.isMollweideBorder = true;
  return mesh;
}

export function createMollweideMask(R = 100, segments = 1024) {
  const outer = 1000;
  const outerShape = new THREE.Shape();
  outerShape.moveTo(-outer, -outer);
  outerShape.lineTo(outer, -outer);
  outerShape.lineTo(outer, outer);
  outerShape.lineTo(-outer, outer);
  outerShape.lineTo(-outer, -outer);

  const hole = new THREE.Path();
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const x = 2 * R * Math.cos(t);
    const y = R * Math.sin(t);
    if (i === 0) hole.moveTo(x, y);
    else hole.lineTo(x, y);
  }
  outerShape.holes.push(hole);
  const geometry = new THREE.ShapeGeometry(outerShape);
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 5;
  return mesh;
}

export function debounce(func, wait) {
  let timeout;
  return function debounced(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}
