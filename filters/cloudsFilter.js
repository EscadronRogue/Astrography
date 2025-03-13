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
 * Creates a cloud overlay mesh from the cloud data and the currently plotted stars.
 * @param {Array} cloudData - Array of star objects from the cloud file.
 * @param {Array} plottedStars - Array of star objects currently visible/plotted.
 * @param {string} mapType - Either 'TrueCoordinates' or 'Globe'.
 * @returns {THREE.Mesh|null} - A mesh representing the cloud (concave hull), or null if not enough points.
 */
export async function createCloudOverlay(cloudData, plottedStars, mapType) {
  const positions = [];
  // Get a set of star names from the cloud file.
  const cloudNames = new Set(cloudData.map(d => d['Star Name']));
  // Look up each star from the plotted stars (using the common name)
  plottedStars.forEach(star => {
    if (cloudNames.has(star.Common_name_of_the_star)) {
      if (mapType === 'TrueCoordinates') {
        if (star.truePosition) positions.push(star.truePosition);
      } else {
        if (star.spherePosition) positions.push(star.spherePosition);
      }
    }
  });

  // Identify outlier stars that should be included in the hull
  const outlierStars = plottedStars.filter(star => {
    return !cloudNames.has(star.Common_name_of_the_star) && isNearCloudArea(star, positions, mapType);
  });

  // Add outlier stars to the positions array
  outlierStars.forEach(star => {
    if (mapType === 'TrueCoordinates') {
      if (star.truePosition) positions.push(star.truePosition);
    } else {
      if (star.spherePosition) positions.push(star.spherePosition);
    }
  });

  // Need at least three points to form a polygon.
  if (positions.length < 3) return null;

  // Build a concave hull from the positions.
  let geometry = new ConcaveGeometry(positions);

  // Create a semi-transparent material; you can adjust the color per cloud if desired.
  const material = new THREE.MeshBasicMaterial({
    color: 0xff6600,
    opacity: 0.3,
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

export async function updateCloudsOverlay(plottedStars, scene, mapType, cloudDataFiles) {
  if (!scene.userData.cloudOverlays) {
    scene.userData.cloudOverlays = [];
  } else {
    scene.userData.cloudOverlays.forEach(mesh => scene.remove(mesh));
    scene.userData.cloudOverlays = [];
  }
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
