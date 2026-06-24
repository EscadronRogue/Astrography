import * as THREE from '../vendor/three.js';

export function angleDiff(a, b) {
  let diff = a - b;
  diff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
  return diff;
}

export function createGlobeGrid(R = 100, options = {}) {
  const group = new THREE.Group();
  const color = options.color ?? 0x444444;
  const opacity = options.opacity ?? 0.2;
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
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
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
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material.clone());
    group.add(line);
  }
  return group;
}

export function debounce(func, wait) {
  let timeout;
  return function debounced(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}
