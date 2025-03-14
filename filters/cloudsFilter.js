// /filters/cloudsFilter.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { ConcaveGeometry } from './ConcaveGeometry.js';
// Import ConvexGeometry as a fallback.
import { ConvexGeometry } from 'https://threejs.org/examples/jsm/geometries/ConvexGeometry.js';

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
  // Build a set of cloud star names (trimmed)
  const cloudNames = new Set(cloudData.map(d => d['Star Name'] && d['Star Name'].trim()));
  
  // Filter plotted stars whose common name (trimmed) is in the cloud set.
  const matchingStars = plottedStars.filter(
    star => star.Common_name_of_the_star && cloudNames.has(star.Common_name_of_the_star.trim())
  );
  
  console.log("Creating cloud overlay:");
  console.log("  Cloud file star names:", cloudNames);
  console.log("  Matching plotted stars:", matchingStars);
  
  if (matchingStars.length < 3) {
    console.warn(`Not enough matching stars for overlay (found ${matchingStars.length}, need at least 3).`);
    return null;
  }
  
  // Get positions for the matching stars.
  const positions = matchingStars.map(star =>
    mapType === 'TrueCoordinates' ? star.truePosition : star.spherePosition
  );
  
  console.log("Positions array:", positions);
  
  let geometry;
  try {
    geometry = new ConcaveGeometry(positions);
    if (!geometry.getAttribute('position') || geometry.getAttribute('position').count === 0) {
      console.warn("ConcaveGeometry resulted in zero vertices; falling back to ConvexGeometry.");
      geometry = new ConvexGeometry(positions);
      console.log("ConvexGeometry vertex count:", geometry.getAttribute('position').count);
    } else {
      console.log("ConcaveGeometry vertex count:", geometry.getAttribute('position').count);
    }
  } catch (e) {
    console.error("Error generating ConcaveGeometry:", e);
    // Fallback to ConvexGeometry in case of error.
    try {
      geometry = new ConvexGeometry(positions);
      console.log("Fallback ConvexGeometry vertex count:", geometry.getAttribute('position').count);
    } catch (err) {
      console.error("Fallback ConvexGeometry failed:", err);
      return null;
    }
  }
  
  // Create a semi-transparent material.
  const material = new THREE.MeshBasicMaterial({
    color: 0xff6600,
    opacity: 0.05,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false
  });
  
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 1;
  console.log("Overlay mesh created:", mesh);
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
  
  console.log("Updating clouds overlay with files:", cloudDataFiles);
  
  // For each selected cloud file, load its data and create an overlay.
  for (const fileUrl of cloudDataFiles) {
    try {
      const cloudData = await loadCloudData(fileUrl);
      console.log(`Loaded cloud data from ${fileUrl}:`, cloudData);
      const overlay = await createCloudOverlay(cloudData, plottedStars, mapType);
      if (overlay) {
        scene.add(overlay);
        scene.userData.cloudOverlays.push(overlay);
        console.log(`Overlay from ${fileUrl} added to scene.`);
      } else {
        console.warn(`No overlay created from ${fileUrl}.`);
      }
    } catch (e) {
      console.error(`Error processing ${fileUrl}:`, e);
    }
  }
}
