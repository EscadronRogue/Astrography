// File: /filters/cloudsFilter.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { ConcaveGeometry } from './ConcaveGeometry.js';

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
 * Creates a cloud overlay mesh from the cloud data and the provided star list.
 * It uses all stars in the list (up to 100LY) whose names match those in the cloud file.
 * @param {Array} cloudData - Array of star objects from the cloud file.
 * @param {Array} starList - Array of star objects (all stars, ignoring distance filter).
 * @param {string} mapType - Either 'TrueCoordinates' or 'Globe'.
 * @param {THREE.Color} cloudColor - Unique color for this cloud.
 * @returns {THREE.Mesh|null} - A mesh representing the cloud (concave hull), or null if not enough points.
 */
export async function createCloudOverlay(cloudData, starList, mapType, cloudColor = new THREE.Color(0xff6600)) {
  const positions = [];
  // Get a set of star names from the cloud file.
  const cloudNames = new Set(cloudData.map(d => d['Star Name']));
  // Look up each star from the complete star list (ignoring any distance filter)
  starList.forEach(star => {
    if (cloudNames.has(star.Common_name_of_the_star)) {
      if (mapType === 'TrueCoordinates') {
        if (star.truePosition) positions.push(star.truePosition);
      } else {
        if (star.spherePosition) positions.push(star.spherePosition);
      }
    }
  });

  // Identify outlier stars that should be included in the hull.
  const outlierStars = starList.filter(star => {
    return !cloudNames.has(star.Common_name_of_the_star) && isNearCloudArea(star, positions, mapType);
  });

  // Add outlier stars to the positions array.
  outlierStars.forEach(star => {
    if (mapType === 'TrueCoordinates') {
      if (star.truePosition) positions.push(star.truePosition);
    } else {
      if (star.spherePosition) positions.push(star.spherePosition);
    }
  });

  // Need at least four points to form a polygon.
  if (positions.length < 4) return null;

  // Build a concave hull from the positions.
  let geometry = new ConcaveGeometry(positions);

  // Create a semi-transparent material with the unique cloud color.
  const material = new THREE.MeshBasicMaterial({
    color: cloudColor,
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
 * Determines if a star is near the cloud area based on some criteria.
 * @param {Object} star - The star object.
 * @param {Array} positions - Array of positions defining the cloud area.
 * @param {string} mapType - Either 'TrueCoordinates' or 'Globe'.
 * @returns {boolean} - True if the star is near the cloud area, false otherwise.
 */
function isNearCloudArea(star, positions, mapType) {
  const thresholdDistance = 5; // Define an appropriate threshold distance
  if (mapType === 'TrueCoordinates') {
    return positions.some(pos => star.truePosition && star.truePosition.distanceTo(pos) < thresholdDistance);
  } else {
    return positions.some(pos => star.spherePosition && star.spherePosition.distanceTo(pos) < thresholdDistance);
  }
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
 * For each checked cloud file, it loads the cloud data and creates a concave overlay
 * using the complete star list restricted to stars up to 100LY, and a unique color.
 * @param {Array} starList - Complete array of star objects.
 * @param {THREE.Scene} scene - The scene to add the cloud overlays.
 * @param {string} mapType - 'TrueCoordinates' or 'Globe'.
 * @param {Array} cloudDataFiles - Array of file URLs for cloud data.
 */
export async function updateCloudsOverlay(starList, scene, mapType, cloudDataFiles) {
  // Only consider stars with a distance of 100LY or less.
  const starsWithin100 = starList.filter(star => {
    const d = star.distance !== undefined ? star.distance : star.Distance_from_the_Sun;
    return d <= 100;
  });

  if (!scene.userData.cloudOverlays) {
    scene.userData.cloudOverlays = [];
  } else {
    scene.userData.cloudOverlays.forEach(mesh => scene.remove(mesh));
    scene.userData.cloudOverlays = [];
  }
  for (const fileUrl of cloudDataFiles) {
    try {
      const cloudData = await loadCloudData(fileUrl);
      const cloudName = getCloudNameFromFileUrl(fileUrl);
      const cloudColor = uniqueColorFromName(cloudName);
      const overlay = await createCloudOverlay(cloudData, starsWithin100, mapType, cloudColor);
      if (overlay) {
        scene.add(overlay);
        scene.userData.cloudOverlays.push(overlay);
      }
    } catch (e) {
      console.error(e);
    }
  }
}
