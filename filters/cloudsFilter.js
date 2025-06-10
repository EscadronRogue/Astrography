// File: /filters/cloudsFilter.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { getGreatCirclePoints, radToSphere, radToMollweide, degToRad,
         getMollweideLambda0, greatCircleToMollweide, splitMollweideWrap } from '../utils/geometryUtils.js';

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
 * to its three closest neighbors (in real 3D space). For the Globe map, the connection
 * is drawn as a series of small segments following the great‑circle path on a sphere.
 * @param {Array} cloudData - Array of star objects from the cloud file.
 * @param {Array} completeStarList - Complete array of star objects.
 * @param {string} mapType - Either 'TrueCoordinates', 'Globe', or 'Mollweide'.
 * @param {THREE.Color} cloudColor - Unique color for the cloud overlay.
 * @returns {THREE.LineSegments|null} - A THREE.LineSegments object representing the cloud overlay, or null if too few points.
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
      } else if (mapType === 'Globe') {
        if (star.spherePosition) pos = star.spherePosition;
      } else {
        if (star.mollweidePosition) pos = star.mollweidePosition;
      }
      if (pos) {
        cloudStars.push({ star, pos });
      }
    }
  });
  
  if (cloudStars.length < 2) return null; // Not enough points
  
  const vertices = [];
  const globeRadius = 100; // Globe radius constant
  const segmentsPerConnection = mapType === 'Globe' || mapType === 'Mollweide' ? 32 : 1;

  // For each star, find its three closest neighbors and build a connecting line.
  for (let i = 0; i < cloudStars.length; i++) {
    const current = cloudStars[i];
    const neighbors = [];
    for (let j = 0; j < cloudStars.length; j++) {
      if (i === j) continue;
      const other = cloudStars[j];
      const d = current.pos.distanceTo(other.pos);
      neighbors.push({ other, distance: d });
    }
    neighbors.sort((a, b) => a.distance - b.distance);
    const k = Math.min(4, neighbors.length);
    for (let n = 0; n < k; n++) {
      const p1 = current.pos;
      const p2 = neighbors[n].other.pos;
      if (mapType === 'Globe') {
        const curvedPoints = getGreatCirclePoints(p1, p2, globeRadius, segmentsPerConnection);
        for (let s = 0; s < curvedPoints.length - 1; s++) {
          vertices.push(curvedPoints[s].x, curvedPoints[s].y, curvedPoints[s].z);
          vertices.push(curvedPoints[s + 1].x, curvedPoints[s + 1].y, curvedPoints[s + 1].z);
        }
      } else if (mapType === 'Mollweide') {
        const lambda0 = getMollweideLambda0();
        const p1Sphere = radToSphere(current.star.raRad, current.star.decRad, globeRadius);
        const p2Sphere = radToSphere(neighbors[n].other.star.raRad, neighbors[n].other.star.decRad, globeRadius);
        const arcPts = greatCircleToMollweide(p1Sphere, p2Sphere, globeRadius, segmentsPerConnection, lambda0);
        for (let s = 0; s < arcPts.length - 1; s++) {
          const segs = splitMollweideWrap(arcPts[s], arcPts[s + 1]);
          segs.forEach(([a,b]) => {
            vertices.push(a.x, a.y, 0);
            vertices.push(b.x, b.y, 0);
          });
        }
      } else {
        const v1 = p1.clone();
        const v2 = p2.clone();
        vertices.push(v1.x, v1.y, v1.z);
        vertices.push(v2.x, v2.y, v2.z);
      }
    }
  }
  
  // Build the geometry from the vertices.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  
  // Create a thick line material.
  const material = new THREE.LineBasicMaterial({
    color: cloudColor,
    linewidth: 10, // Note: WebGL often ignores linewidth > 1; consider using fat line techniques if needed.
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
 * Each cloud is rendered with a unique color.
 * @param {Array} completeStarList - Complete array of star objects.
 * @param {THREE.Scene} scene - The scene to add the cloud overlays.
 * @param {string} mapType - 'TrueCoordinates', 'Globe', or 'Mollweide'.
 * @param {Array} cloudDataFiles - Array of file URLs for cloud data.
 */
export async function updateCloudsOverlay(completeStarList, scene, mapType, cloudDataFiles) {
  if (!scene.userData.cloudOverlays) {
    scene.userData.cloudOverlays = [];
  } else {
    scene.userData.cloudOverlays.forEach(line => scene.remove(line));
    scene.userData.cloudOverlays = [];
  }

  // Ensure star positions are up to date for the requested map type.
  if (mapType === 'Mollweide') {
    const lambda0 = getMollweideLambda0();
    completeStarList.forEach(star => {
      let ra, dec;
      if (star.raRad !== undefined && star.decRad !== undefined) {
        ra = star.raRad;
        dec = star.decRad;
      } else if (star.RA_in_radian !== undefined && star.DEC_in_radian !== undefined) {
        ra = star.RA_in_radian;
        dec = star.DEC_in_radian;
      } else if (star.RA_in_degrees !== undefined && star.DEC_in_degrees !== undefined) {
        ra = degToRad(star.RA_in_degrees);
        dec = degToRad(star.DEC_in_degrees);
      } else {
        ra = 0;
        dec = 0;
      }
      star.raRad = ra;
      star.decRad = dec;
      star.spherePosition = radToSphere(ra, dec, 100);
      star.mollweidePosition = radToMollweide(ra, dec, 100, lambda0);
    });
  } else if (mapType === 'Globe') {
    completeStarList.forEach(star => {
      let ra, dec;
      if (star.raRad !== undefined && star.decRad !== undefined) {
        ra = star.raRad;
        dec = star.decRad;
      } else if (star.RA_in_radian !== undefined && star.DEC_in_radian !== undefined) {
        ra = star.RA_in_radian;
        dec = star.DEC_in_radian;
      } else if (star.RA_in_degrees !== undefined && star.DEC_in_degrees !== undefined) {
        ra = degToRad(star.RA_in_degrees);
        dec = degToRad(star.DEC_in_degrees);
      } else {
        ra = 0;
        dec = 0;
      }
      star.raRad = ra;
      star.decRad = dec;
      star.spherePosition = radToSphere(ra, dec, 100);
    });
  } else if (mapType === 'TrueCoordinates') {
    completeStarList.forEach(star => {
      const R = star.distance !== undefined ? star.distance : star.Distance_from_the_Sun;
      let ra, dec;
      if (star.raRad !== undefined && star.decRad !== undefined) {
        ra = star.raRad;
        dec = star.decRad;
      } else if (star.RA_in_radian !== undefined && star.DEC_in_radian !== undefined) {
        ra = star.RA_in_radian;
        dec = star.DEC_in_radian;
      } else if (star.RA_in_degrees !== undefined && star.DEC_in_degrees !== undefined) {
        ra = degToRad(star.RA_in_degrees);
        dec = degToRad(star.DEC_in_degrees);
      } else {
        ra = 0;
        dec = 0;
      }
      star.raRad = ra;
      star.decRad = dec;
      star.truePosition = radToSphere(ra, dec, R);
    });
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
