// Cloud overlay rendering migrated from the legacy clouds filter module.
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import {
  getGreatCirclePoints,
  radToSphere,
  radToMollweide,
  degToRad,
  getMollweideLambda0,
  greatCircleToMollweide,
  splitMollweideWrap
} from '../../shared/geometryUtils.js';
import { getDustCloudColor } from './dustCloudColors.js';
import { loadCachedCloudData } from './cloudDataCache.js';
import { createWideLineMaterial, buildWideLineGeometry, disposeObject3D } from '../../render/engine/renderUtils.js';
import { uniqueColorFromName, getCloudNameFromFileUrl } from '../../shared/colorUtils.js';
import { GLOBE_RADIUS, CIRCLE_SEGMENTS } from '../../shared/constants.js';

/**
 * Loads a cloud data file (JSON) from the provided URL.
 * @param {string} cloudFileUrl - URL to the cloud JSON file.
 * @returns {Promise<Array>} - Promise resolving to an array of cloud star objects.
 */
async function loadCloudData(cloudFileUrl) {
  return await loadCachedCloudData(cloudFileUrl);
}

function normalizeCloudStarName(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
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
export async function createCloudOverlay(
  cloudData,
  completeStarList,
  mapType,
  cloudColor = new THREE.Color(0xff6600),
  opacityFactor = 1.0
) {
  const cloudNames = new Set(cloudData.map(d => normalizeCloudStarName(d['Star Name'] || d.starName || d.name)));
  const cloudStars = [];

  completeStarList.forEach(star => {
    const distance = star.viewpointDistance ?? star.distance;
    if (distance > 100) return;
    if (cloudNames.has(normalizeCloudStarName(star.Common_name_of_the_star))) {
      if (mapType === 'TrueCoordinates' && star.truePosition) {
        cloudStars.push({ star, pos: star.truePosition });
      } else if (mapType === 'Globe' && star.spherePosition) {
        cloudStars.push({ star, pos: star.spherePosition });
      } else if (mapType === 'Mollweide' && star.spherePosition) {
        // store sphere position; projection handled later
        cloudStars.push({ star, pos: star.spherePosition });
      }
    }
  });

  if (cloudStars.length < 2) return null;

  const pairs = [];
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
      pairs.push({ starA: current.star, starB: neighbors[n].other.star });
    }
  }

  if (mapType === 'Mollweide') {
    const segs = createMollweideCloudSegments(pairs, cloudColor, opacityFactor);
    return segs;
  }

  const vertices = [];
  const globeRadius = GLOBE_RADIUS;
  const segmentsPerConnection = mapType === 'Globe' ? 32 : 1;

  pairs.forEach(pair => {
    const p1 = mapType === 'Globe' ? pair.starA.spherePosition : pair.starA.truePosition;
    const p2 = mapType === 'Globe' ? pair.starB.spherePosition : pair.starB.truePosition;
    if (!p1 || !p2) return;
    if (mapType === 'Globe') {
      const pts = getGreatCirclePoints(p1, p2, globeRadius, segmentsPerConnection);
      for (let s = 0; s < pts.length - 1; s++) {
        vertices.push(pts[s].x, pts[s].y, pts[s].z);
        vertices.push(pts[s + 1].x, pts[s + 1].y, pts[s + 1].z);
      }
    } else {
      vertices.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const material = new THREE.LineBasicMaterial({
    color: cloudColor,
    linewidth: 1,
    transparent: true,
    opacity: 0.8 * opacityFactor,
    depthWrite: false
  });
  const lineSegments = new THREE.LineSegments(geometry, material);
  lineSegments.renderOrder = 2;
  return lineSegments;
}

const GC_SEGMENTS = CIRCLE_SEGMENTS;

export function createMollweideCloudSegments(pairs, color, opacityFactor = 1.0, width = 30) {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), createWideLineMaterial(color));
  mesh.material.uniforms.opacityFactor.value = opacityFactor;
  mesh.renderOrder = 2;
  mesh.userData = { pairs, segments: GC_SEGMENTS, lineWidth: width, isMollweideCloud: true };
  updateMollweideCloudSegments(mesh);
  return mesh;
}

export function updateMollweideCloudSegments(lineSegs) {
  const pairs = lineSegs.userData.pairs || [];
  const segsCount = lineSegs.userData.segments || GC_SEGMENTS;
  const width = lineSegs.userData.lineWidth || 30;
  const pts = [];
  pairs.forEach(pair => {
    const p1 = pair.starA.spherePosition;
    const p2 = pair.starB.spherePosition;
    if (!p1 || !p2) return;
    const gcPts = greatCircleToMollweide(
      p1,
      p2,
      100,
      segsCount,
      getMollweideLambda0()
    );
    for (let j = 0; j < gcPts.length - 1; j++) {
      const segs = splitMollweideWrap(gcPts[j], gcPts[j + 1]);
      segs.forEach(([s, e]) => { pts.push(s, e); });
    }
  });
  lineSegs.geometry.dispose();
  lineSegs.geometry = buildWideLineGeometry(pts, width);
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
export async function updateCloudsOverlay(completeStarList, scene, mapType, cloudDataFiles, opacityFactor = 1.0) {
  if (!scene.userData.cloudOverlays) {
    scene.userData.cloudOverlays = [];
  } else {
    scene.userData.cloudOverlays.forEach(line => { scene.remove(line); disposeObject3D(line); });
    scene.userData.cloudOverlays = [];
  }
  for (const fileUrl of cloudDataFiles) {
    try {
      const cloudData = await loadCloudData(fileUrl);
      const cloudName = getCloudNameFromFileUrl(fileUrl);
      const cloudColor = uniqueColorFromName(cloudName);
      const overlayLine = await createCloudOverlay(cloudData, completeStarList, mapType, cloudColor, opacityFactor);
      if (overlayLine) {
        scene.add(overlayLine);
        scene.userData.cloudOverlays.push(overlayLine);
      }
    } catch (e) {
      console.error(e);
    }
  }
}
