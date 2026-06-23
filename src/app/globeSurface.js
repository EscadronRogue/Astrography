/**
 * @file Manages the opaque globe surface sphere.
 * Extracted from createApp.js to give globe surface rendering its own home.
 */
import * as THREE from '../vendor/three.js';
import { getGlobeSurfaceSphere, setGlobeSurfaceSphere } from './appStateFactory.js';

/**
 * Adds or removes the opaque background sphere on the globe map.
 * @param {boolean} isOpaque - Whether the globe surface should be opaque.
 * @param {THREE.Scene} globeScene - The globe map's scene.
 */
export function applyGlobeSurface(isOpaque, globeScene) {
  const existing = getGlobeSurfaceSphere();
  if (existing) {
    globeScene.remove(existing);
    existing.geometry?.dispose?.();
    existing.material?.dispose?.();
    setGlobeSurfaceSphere(null);
  }
  if (isOpaque) {
    const geom = new THREE.SphereGeometry(99, 32, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.FrontSide,
      depthWrite: true,
      depthTest: true,
      transparent: false
    });
    const sphere = new THREE.Mesh(geom, mat);
    sphere.renderOrder = 0;
    sphere.frustumCulled = false;
    setGlobeSurfaceSphere(sphere);
    globeScene.add(sphere);
  }
}
