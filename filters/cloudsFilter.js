// File: /filters/cloudsFilter.js

import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { ConcaveGeometry } from './ConcaveGeometry.js';

/**
 * Loads cloud data from a JSON file.
 * @param {string} url - The URL of the cloud data file.
 * @returns {Promise<Object[]>} - A promise that resolves to the cloud data array.
 */
export async function loadCloudData(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load cloud data from ${url}`);
  }
  const data = await response.json();
  return data;
}

/**
 * Creates a cloud overlay mesh from cloud data and plotted stars.
 * It builds a concave hull from the star positions that match the cloud data.
 * @param {Object[]} cloudData - The cloud data loaded from file.
 * @param {Object[]} plottedStars - The array of star objects currently plotted.
 * @param {string} mapType - Either 'TrueCoordinates' or 'Globe'.
 * @returns {THREE.Mesh|null} - The resulting mesh overlay or null if not enough points.
 */
export async function createCloudOverlay(cloudData, plottedStars, mapType) {
  const positions = [];
  // Assume each cloud object has a 'name' property.
  const cloudNames = new Set(cloudData.map(cloud => cloud.name));
  
  // Collect positions from plotted stars that belong to the cloud.
  plottedStars.forEach(star => {
    if (cloudNames.has(star.Common_name_of_the_star)) {
      if (mapType === 'TrueCoordinates') {
        if (star.truePosition) positions.push(star.truePosition);
      } else {
        if (star.spherePosition) positions.push(star.spherePosition);
      }
    }
  });
  
  // Need at least 3 points to form a valid shape.
  if (positions.length < 3) {
    return null;
  }
  
  // Create the concave hull geometry from the positions.
  const geometry = new ConcaveGeometry(positions);
  
  // Create a material with a fixed opacity that does not accumulate with multiple layers.
  const material = new THREE.MeshBasicMaterial({
    color: 0xff6600,
    opacity: 0.1, // desired per-layer opacity
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendEquation: THREE.MaxEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor
  });
  
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 1;
  return mesh;
}

/**
 * Updates the cloud overlays on the scene.
 * Removes any previous overlays and loads new ones from the provided cloud data files.
 * @param {Object[]} plottedStars - Array of plotted star objects.
 * @param {THREE.Scene} scene - The Three.js scene to add overlays to.
 * @param {string} mapType - Either 'TrueCoordinates' or 'Globe'.
 * @param {string[]} cloudDataFiles - Array of URLs for cloud data JSON files.
 */
export async function updateCloudsOverlay(plottedStars, scene, mapType, cloudDataFiles) {
  // Remove any existing cloud overlays.
  if (scene.userData.cloudOverlays) {
    scene.userData.cloudOverlays.forEach(overlay => scene.remove(overlay));
    scene.userData.cloudOverlays = [];
  } else {
    scene.userData.cloudOverlays = [];
  }
  
  // Load each cloud data file, create the overlay, and add it to the scene.
  for (const fileUrl of cloudDataFiles) {
    try {
      const cloudData = await loadCloudData(fileUrl);
      const overlay = await createCloudOverlay(cloudData, plottedStars, mapType);
      if (overlay) {
        scene.add(overlay);
        scene.userData.cloudOverlays.push(overlay);
      }
    } catch (error) {
      console.error(`Error processing cloud data from ${fileUrl}:`, error);
    }
  }
}
