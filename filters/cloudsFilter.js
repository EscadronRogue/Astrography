// /filters/cloudsFilter.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { ConcaveGeometry } from './ConcaveGeometry.js';

/**
 * Loads a cloud data file (JSON) from the provided URL.
 * @param {string} cloudFileUrl - URL to the cloud JSON file.
 * @returns {Promise<Array>} - Promise resolving to an array of star objects in the cloud.
 */
async function loadCloudData(cloudFileUrl) {
  const response = await fetch(cloudFileUrl);
  if (!response.ok) {
    throw new Error(`Failed to load cloud data from ${cloudFileUrl}`);
  }
  return await response.json();
}

/**
 * Creates a cloud overlay mesh from the cloud data and the currently plotted stars.
 * @param {Array} cloudData - Array of star objects from the cloud file.
 * @param {Array} plottedStars - Array of star objects currently visible/plotted.
 * @param {string} mapType - Either 'TrueCoordinates' or 'Globe'.
 * @returns {THREE.Mesh|null} - A mesh representing the cloud overlay, or null if not enough points.
 */
export async function createCloudOverlay(cloudData, plottedStars, mapType) {
  // Extract the cloud star names from the cloud data.
  const cloudNames = new Set(cloudData.map(d => d['Star Name']));
  
  // Filter the plotted stars that belong to this cloud.
  const matchingStars = plottedStars.filter(star => cloudNames.has(star.Common_name_of_the_star));
  
  // Need at least three stars to form a polygon.
  if (matchingStars.length < 3) return null;
  
  // Get the positions from the matching stars.
  const positions = matchingStars.map(star =>
    mapType === 'TrueCoordinates' ? star.truePosition : star.spherePosition
  );
  
  // Build a concave hull from these positions.
  const geometry = new ConcaveGeometry(positions);
  
  // Create a semi‐transparent material; you can change the color per cloud if needed.
  const material = new THREE.MeshBasicMaterial({
    color: 0xff6600,
    opacity: 0.05,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 1;
  return mesh;
}

/**
 * Updates the cloud overlays on the given scene based on selected cloud data files.
 * @param {Array} plottedStars - Array of currently plotted star objects.
 * @param {THREE.Scene} scene - The Three.js scene.
 * @param {string} mapType - 'TrueCoordinates' or 'Globe'.
 * @param {Array} cloudDataFiles - Array of file URLs for cloud data JSON files.
 */
export async function updateCloudsOverlay(plottedStars, scene, mapType, cloudDataFiles) {
  // Remove any previous cloud overlays.
  if (scene.userData.cloudOverlays) {
    scene.userData.cloudOverlays.forEach(mesh => scene.remove(mesh));
  }
  scene.userData.cloudOverlays = [];
  
  // For each selected cloud file, load its data and create an overlay.
  for (const fileUrl of cloudDataFiles) {
    try {
      const cloudData = await loadCloudData(fileUrl);
      const overlay = await createCloudOverlay(cloudData, plottedStars, mapType);
      if (overlay) {
        scene.add(overlay);
        scene.userData.cloudOverlays.push(overlay);
      }
    } catch (e) {
      console.error(e);
    }
  }
}
