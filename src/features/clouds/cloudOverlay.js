import * as THREE from '../../vendor/three.js';
import { getGreatCirclePoints } from '../../shared/geometryUtils.js';
import { loadCachedCloudData } from './cloudDataCache.js';
import { disposeObject3D } from '../../render/engine/renderUtils.js';
import { uniqueColorFromName, getCloudNameFromFileUrl } from '../../shared/colorUtils.js';
import { GLOBE_RADIUS } from '../../shared/constants.js';
import { normalizeCloudStarName } from './cloudNameUtils.js';
import { logError } from '../../shared/logger.js';

/**
 * Loads a cloud data file (JSON) from the provided URL.
 * @param {string} cloudFileUrl - URL to the cloud JSON file.
 * @returns {Promise<Array>} - Promise resolving to an array of cloud star objects.
 */
async function loadCloudData(cloudFileUrl) {
  return await loadCachedCloudData(cloudFileUrl);
}

function getSpatialBucketKey(x, y, z) {
  return `${x}|${y}|${z}`;
}

function buildCloudStarSpatialIndex(cloudStars, bucketSize = 12) {
  const buckets = new Map();
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity
  };

  cloudStars.forEach((entry, index) => {
    const bx = Math.floor(entry.pos.x / bucketSize);
    const by = Math.floor(entry.pos.y / bucketSize);
    const bz = Math.floor(entry.pos.z / bucketSize);
    bounds.minX = Math.min(bounds.minX, bx);
    bounds.maxX = Math.max(bounds.maxX, bx);
    bounds.minY = Math.min(bounds.minY, by);
    bounds.maxY = Math.max(bounds.maxY, by);
    bounds.minZ = Math.min(bounds.minZ, bz);
    bounds.maxZ = Math.max(bounds.maxZ, bz);

    const key = getSpatialBucketKey(bx, by, bz);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = [];
      buckets.set(key, bucket);
    }
    bucket.push(index);
  });
  return { buckets, bucketSize, bounds };
}

function insertNearest(nearest, candidate, limit) {
  const existingIndex = nearest.findIndex(item => item.other.star === candidate.other.star);
  if (existingIndex >= 0) {
    if (candidate.distance >= nearest[existingIndex].distance) return;
    nearest.splice(existingIndex, 1);
  }

  let insertAt = nearest.length;
  while (insertAt > 0 && nearest[insertAt - 1].distance > candidate.distance) insertAt -= 1;
  nearest.splice(insertAt, 0, candidate);
  if (nearest.length > limit) nearest.length = limit;
}

function findNearestCloudNeighbors(cloudStars, currentIndex, spatialIndex, limit) {
  const current = cloudStars[currentIndex];
  const { buckets, bucketSize, bounds } = spatialIndex;
  const centerX = Math.floor(current.pos.x / bucketSize);
  const centerY = Math.floor(current.pos.y / bucketSize);
  const centerZ = Math.floor(current.pos.z / bucketSize);
  const nearest = [];
  const seen = new Set([currentIndex]);
  const maxRange = Math.max(
    centerX - bounds.minX,
    bounds.maxX - centerX,
    centerY - bounds.minY,
    bounds.maxY - centerY,
    centerZ - bounds.minZ,
    bounds.maxZ - centerZ
  );

  for (let range = 0; range <= maxRange; range += 1) {
    for (let bx = centerX - range; bx <= centerX + range; bx += 1) {
      for (let by = centerY - range; by <= centerY + range; by += 1) {
        for (let bz = centerZ - range; bz <= centerZ + range; bz += 1) {
          if (
            range > 0 &&
            bx !== centerX - range &&
            bx !== centerX + range &&
            by !== centerY - range &&
            by !== centerY + range &&
            bz !== centerZ - range &&
            bz !== centerZ + range
          ) {
            continue;
          }

          const bucket = buckets.get(getSpatialBucketKey(bx, by, bz));
          if (!bucket) continue;
          bucket.forEach(otherIndex => {
            if (seen.has(otherIndex)) return;
            seen.add(otherIndex);
            const other = cloudStars[otherIndex];
            insertNearest(nearest, {
              other,
              distance: current.pos.distanceTo(other.pos)
            }, limit);
          });
        }
      }
    }

    if (nearest.length >= limit) {
      const farthestKept = nearest[nearest.length - 1].distance;
      const nextShellDistance = range * bucketSize;
      if (nextShellDistance > farthestKept) break;
    }
  }

  return nearest;
}


/**
 * Creates a cloud overlay by connecting each star (within 100 LY) in the cloud’s list 
 * to its three closest neighbors (in real 3D space). For the Globe map, the connection
 * is drawn as a series of small segments following the great‑circle path on a sphere.
 * @param {Array} cloudData - Array of star objects from the cloud file.
 * @param {Array} completeStarList - Complete array of star objects.
 * @param {string} mapType - Either 'TrueCoordinates' or 'Globe'.
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
      }
    }
  });

  if (cloudStars.length < 2) return null;

  const pairs = [];
  const neighborCount = 4;
  const spatialIndex = buildCloudStarSpatialIndex(cloudStars);
  for (let i = 0; i < cloudStars.length; i++) {
    const neighbors = findNearestCloudNeighbors(cloudStars, i, spatialIndex, neighborCount);
    const k = Math.min(neighborCount, neighbors.length);
    for (let n = 0; n < k; n++) {
      pairs.push({ starA: cloudStars[i].star, starB: neighbors[n].other.star });
    }
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

/**
 * Updates the cloud overlays.
 * For each checked cloud file, it loads the cloud data and creates connecting lines
 * where each star (within 100 LY) is connected to its three nearest neighbors.
 * Each cloud is rendered with a unique color.
 * @param {Array} completeStarList - Complete array of star objects.
 * @param {THREE.Scene} scene - The scene to add the cloud overlays.
 * @param {string} mapType - 'TrueCoordinates' or 'Globe'.
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
      logError(e);
    }
  }
}
