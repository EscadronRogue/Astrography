// File: /filters/cloudsFilter.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { getGreatCirclePoints } from '../utils/geometryUtils.js';

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
 * Creates a cloud overlay by connecting each star (within 100 LY) in the cloud’s list 
 * to its three closest neighbors (in real 3D distance). For the Globe map, the connecting
 * lines follow a great‑circle arc so that they adhere to the curvature of the globe.
 * This method ignores any distance filtering.
 *
 * @param {Array} cloudData - Array of star objects from the cloud file.
 * @param {Array} completeStarList - Complete array of star objects.
 * @param {string} mapType - Either 'TrueCoordinates' or 'Globe'.
 * @param {THREE.Color} cloudColor - Unique color for the cloud overlay.
 * @returns {THREE.LineSegments|null} - A THREE.LineSegments object representing the cloud overlay, or null if fewer than 2 points.
 */
export async function createCloudOverlay(cloudData, completeStarList, mapType, cloudColor = new THREE.Color(0xff6600)) {
  // Get the set of star names listed in the cloud data.
  const cloudNames = new Set(cloudData.map(d => d['Star Name']));
  const cloudStars = [];
  
  // From the complete list, filter stars that belong to this cloud and are within 100 LY.
  completeStarList.forEach(star => {
    const distance = star.distance !== undefined ? star.distance : star.Distance_from_the_Sun;
    if (distance > 100) return;
    if (cloudNames.has(star.Common_name_of_the_star)) {
      let pos = null;
      if (mapType === 'TrueCoordinates') {
        if (star.truePosition) pos = star.truePosition;
      } else {
        if (star.spherePosition) pos = star.spherePosition;
      }
      if (pos) {
        cloudStars.push({ star, pos });
      }
    }
  });
  
  if (cloudStars.length < 2) return null; // Need at least two points
  
  const vertices = [];
  
  // For each star in the cloud, compute its three closest neighbors and connect to them.
  for (let i = 0; i < cloudStars.length; i++) {
    const current = cloudStars[i];
    const neighbors = [];
    for (let j = 0; j < cloudStars.length; j++) {
      if (i === j) continue;
      const other = cloudStars[j];
      const d = current.pos.distanceTo(other.pos);
      neighbors.push({ other, distance: d });
    }
    // Sort by distance and take the closest three neighbors.
    neighbors.sort((a, b) => a.distance - b.distance);
    const k = Math.min(3, neighbors.length);
    for (let n = 0; n < k; n++) {
      const neighborPos = neighbors[n].other.pos;
      if (mapType === 'Globe') {
        // Use the helper function to compute points along a great-circle arc.
        // Here we assume a sphere radius of 100 and 32 segments.
        const arcPoints = getGreatCirclePoints(current.pos, neighborPos, 100, 32);
        for (let p of arcPoints) {
          vertices.push(p.x, p.y, p.z);
        }
      } else {
        // For TrueCoordinates, simply use a straight line.
        vertices.push(current.pos.x, current.pos.y, current.pos.z);
        vertices.push(neighborPos.x, neighborPos.y, neighborPos.z);
      }
    }
  }
  
  // Create BufferGeometry from the vertices.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  
  // Create a very thick line material.
  const material = new THREE.LineBasicMaterial({
    color: cloudColor,
    linewidth: 10, // Note: WebGL may ignore linewidth >1; consider using a fat line implementation if needed.
    transparent: true,
    opacity: 0.8,
    depthWrite: false
  });
  
  const lineSegments = new THREE.LineSegments(geometry, material);
  lineSegments.renderOrder = 1;
  return lineSegments;
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
 * Extracts the cloud name from its file URL.
 * E.g., "data/Aquila_cloud_data.json" -> "Aquila"
 * @param {string} fileUrl 
 * @returns {string} Cloud name.
 */
function getCloudNameFromFileUrl(fileUrl) {
  const parts = fileUrl.split('/');
  const filename = parts[parts.length - 1];
  return filename.replace('_cloud_data.json', '').replace('_', ' ');
}

/**
 * Updates the cloud overlays.
 * For each checked cloud file, it loads the cloud data and creates connecting lines
 * where each star (within 100 LY) is connected to its three nearest neighbors.
 * For Globe maps, the lines follow a great‑circle arc.
 * Each cloud is rendered with a unique color.
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
