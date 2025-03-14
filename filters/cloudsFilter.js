// File: /filters/cloudsFilter.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { GroupedConcaveGeometry } from './GroupedConcaveGeometry.js';

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
 * Determines if a star is near the cloud area based on a threshold distance.
 * @param {Object} star - The star object.
 * @param {Array} positions - Array of positions defining the current cloud area.
 * @param {string} mapType - Either 'TrueCoordinates' or 'Globe'.
 * @returns {boolean} - True if the star is near the cloud area, false otherwise.
 */
function isNearCloudArea(star, positions, mapType) {
  const thresholdDistance = 5; // Adjust this value as needed.
  if (mapType === 'TrueCoordinates') {
    return positions.some(pos => star.truePosition && star.truePosition.distanceTo(pos) < thresholdDistance);
  } else {
    return positions.some(pos => star.spherePosition && star.spherePosition.distanceTo(pos) < thresholdDistance);
  }
}

/**
 * Creates a cloud overlay mesh from the cloud data and currently plotted stars.
 * Uses a grouping method to construct the overall shape so that each star is used only once
 * (or twice on wrap-around) and overlapping layers do not compound the opacity.
 *
 * @param {Array} cloudData - Array of star objects loaded from the cloud file.
 * @param {Array} plottedStars - Array of star objects currently visible/plotted.
 * @param {string} mapType - Either 'TrueCoordinates' or 'Globe'.
 * @returns {THREE.Mesh|null} - A mesh representing the cloud overlay, or null if not enough points.
 */
export async function createCloudOverlay(cloudData, plottedStars, mapType) {
  const positions = [];
  // Build a set of star names from the cloud file.
  const cloudNames = new Set(cloudData.map(d => d['Star Name']));
  
  // For every plotted star whose common name is in the cloud data, add its position.
  plottedStars.forEach(star => {
    if (cloudNames.has(star.Common_name_of_the_star)) {
      if (mapType === 'TrueCoordinates') {
        if (star.truePosition) positions.push(star.truePosition);
      } else {
        if (star.spherePosition) positions.push(star.spherePosition);
      }
    }
  });

  // Also include "outlier" stars that are near the cloud area.
  const outlierStars = plottedStars.filter(star => {
    return !cloudNames.has(star.Common_name_of_the_star) && isNearCloudArea(star, positions, mapType);
  });
  outlierStars.forEach(star => {
    if (mapType === 'TrueCoordinates') {
      if (star.truePosition) positions.push(star.truePosition);
    } else {
      if (star.spherePosition) positions.push(star.spherePosition);
    }
  });

  // Ensure there are enough points.
  if (positions.length < 3) return null;

  // Build the geometry using the new grouping method.
  const geometry = new GroupedConcaveGeometry(positions);

  // Create a material with custom blending to prevent multiple overlapping layers from
  // further reducing the overall opacity.
  const material = new THREE.MeshBasicMaterial({
    color: 0xff6600,
    opacity: 0.1,
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
 * Updates the cloud overlays in the given scene.
 * It removes any existing overlays and then, for each provided cloud data file,
 * loads the data and creates a new overlay mesh.
 *
 * @param {Array} plottedStars - Array of star objects currently visible/plotted.
 * @param {THREE.Scene} scene - The Three.js scene to which the overlays are added.
 * @param {string} mapType - Either 'TrueCoordinates' or 'Globe'.
 * @param {Array} cloudDataFiles - Array of URLs to cloud data JSON files.
 */
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
