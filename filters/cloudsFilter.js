// File: /filters/cloudsFilter.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';

/**
 * Loads a cloud data file (JSON) from the provided URL.
 * @param {string} cloudFileUrl - URL to the cloud JSON file.
 * @returns {Promise<Array>} - Promise resolving to an array of cloud star objects.
 */
async function loadCloudData(cloudFileUrl) {
  const response = await fetch(cloudFileUrl);
  if (!response.ok) {
    throw new Error(`Failed to load cloud data from ${cloudFileUrl}`);
  }
  return await response.json();
}

/**
 * Instead of a concave hull, this function creates a polyline that connects all the stars listed
 * (ignoring whether they are currently plotted). It uses stars up to 100 LY away.
 * @param {Array} cloudData - Array of star objects from the cloud file (should contain "Star Name").
 * @param {Array} completeStarList - Complete array of star objects (ignoring distance filtering).
 * @param {string} mapType - Either 'TrueCoordinates' or 'Globe'.
 * @param {THREE.Color} cloudColor - Unique color for the cloud overlay.
 * @returns {THREE.Line|null} - A THREE.Line object representing the cloud overlay, or null if fewer than 2 points.
 */
export async function createCloudOverlay(cloudData, completeStarList, mapType, cloudColor = new THREE.Color(0xff6600)) {
  const positions = [];
  // Get a set of star names from the cloud file.
  const cloudNames = new Set(cloudData.map(d => d['Star Name']));
  
  // For each star in the complete list, if its name is in the cloud file and its distance is <= 100 LY, add its position.
  completeStarList.forEach(star => {
    const distance = star.distance !== undefined ? star.distance : star.Distance_from_the_Sun;
    if (distance > 100) return;
    if (cloudNames.has(star.Common_name_of_the_star)) {
      if (mapType === 'TrueCoordinates') {
        if (star.truePosition) positions.push(star.truePosition);
      } else {
        if (star.spherePosition) positions.push(star.spherePosition);
      }
    }
  });

  if (positions.length < 2) return null; // Need at least two points to form a line

  // Create a BufferGeometry from the positions array.
  const geometry = new THREE.BufferGeometry().setFromPoints(positions);

  // Create a very thick line material.
  // Note: The linewidth property is not supported on most platforms by default.
  const material = new THREE.LineBasicMaterial({
    color: cloudColor,
    linewidth: 10, // "Very very very thick" – you might need an alternative implementation for thick lines.
    transparent: true,
    opacity: 0.8,
    depthWrite: false
  });

  const line = new THREE.Line(geometry, material);
  line.renderOrder = 1;
  return line;
}

/**
 * Extracts the cloud name from its file URL.
 * E.g., "data/Aquila_cloud_data.json" -> "Aquila"
 * @param {string} fileUrl 
 * @returns {string} Cloud name.
 */
function getCloudNameFromFileUrl(fileUrl) {
  const parts = fileUrl.split('/');
  const filename = parts[parts.length - 1];
  const cloudName = filename.replace('_cloud_data.json', '').replace('_', ' ');
  return cloudName;
}

/**
 * Generates a unique color based on a given name.
 * @param {string} name 
 * @returns {THREE.Color}
 */
function uniqueColorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = (hash % 360 + 360) % 360;
  return new THREE.Color(`hsl(${hue}, 70%, 50%)`);
}

/**
 * Updates the cloud overlays.
 * For each checked cloud file, it loads the cloud data and creates a polyline overlay
 * using the complete star list (ignoring the distance filter) and a unique color.
 * @param {Array} completeStarList - Complete array of star objects.
 * @param {THREE.Scene} scene - The scene to add the cloud overlays.
 * @param {string} mapType - 'TrueCoordinates' or 'Globe'.
 * @param {Array} cloudDataFiles - Array of file URLs for cloud data.
 */
export async function updateCloudsOverlay(completeStarList, scene, mapType, cloudDataFiles) {
  if (!scene.userData.cloudOverlays) {
    scene.userData.cloudOverlays = [];
  } else {
    scene.userData.cloudOverlays.forEach(line => scene.remove(line));
    scene.userData.cloudOverlays = [];
  }
  for (const fileUrl of cloudDataFiles) {
    try {
      const cloudData = await loadCloudData(fileUrl);
      const cloudName = getCloudNameFromFileUrl(fileUrl);
      const cloudColor = uniqueColorFromName(cloudName);
      const overlayLine = await createCloudOverlay(cloudData, completeStarList, mapType, cloudColor);
      if (overlayLine) {
        scene.add(overlayLine);
        scene.userData.cloudOverlays.push(overlayLine);
      }
    } catch (e) {
      console.error(e);
    }
  }
}
