// File: /filters/cloudsFilter.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import {
  getGreatCirclePoints,
  radToSphere,
  radToMollweide,
  degToRad,
  getMollweideLambda0,
  greatCircleToMollweide,
  splitMollweideWrap
} from '../utils/geometryUtils.js';

// Helper material and geometry builders for wide fading lines on the Mollweide map
function createWideLineMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      opacityFactor: { value: 1.0 }
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      attribute float side;
      attribute float linePos;
      varying float vSide;
      varying float vPos;
      void main() {
        vSide = side;
        vPos = linePos;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float opacityFactor;
      varying float vSide;
      varying float vPos;
      void main() {
        float alpha = 0.5 * (1.0 - abs(vSide)) * opacityFactor;
        alpha *= smoothstep(0.0, 0.1, vPos) * smoothstep(1.0, 0.9, vPos);
        if(alpha <= 0.0) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `
  });
}

function buildWideLineGeometry(points, width) {
  const vertices = [];
  const sides = [];
  const linePos = [];
  for (let i = 0; i < points.length; i += 2) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dir = new THREE.Vector2(p2.x - p1.x, p2.y - p1.y).normalize();
    const perp = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(width / 2);
    const a1 = new THREE.Vector3(p1.x + perp.x, p1.y + perp.y, p1.z);
    const a2 = new THREE.Vector3(p1.x - perp.x, p1.y - perp.y, p1.z);
    const b1 = new THREE.Vector3(p2.x + perp.x, p2.y + perp.y, p2.z);
    const b2 = new THREE.Vector3(p2.x - perp.x, p2.y - perp.y, p2.z);

    vertices.push(a1.x, a1.y, a1.z, a2.x, a2.y, a2.z, b2.x, b2.y, b2.z);
    sides.push(1, -1, -1);
    linePos.push(0, 0, 1);
    vertices.push(a1.x, a1.y, a1.z, b2.x, b2.y, b2.z, b1.x, b1.y, b1.z);
    sides.push(1, -1, 1);
    linePos.push(0, 1, 1);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geom.setAttribute('side', new THREE.Float32BufferAttribute(sides, 1));
  geom.setAttribute('linePos', new THREE.Float32BufferAttribute(linePos, 1));
  return geom;
}

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
export async function createCloudOverlay(
  cloudData,
  completeStarList,
  mapType,
  cloudColor = new THREE.Color(0xff6600),
  opacityFactor = 1.0
) {
  const cloudNames = new Set(cloudData.map(d => d['Star Name']));
  const cloudStars = [];

  completeStarList.forEach(star => {
    const distance = star.distance !== undefined ? star.distance : star.Distance_from_the_Sun;
    if (distance > 100) return;
    if (cloudNames.has(star.Common_name_of_the_star)) {
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
  const globeRadius = 100;
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

const GC_SEGMENTS = 32;

export function createMollweideCloudSegments(pairs, color, opacityFactor = 1.0, width = 30) {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), createWideLineMaterial(color));
  mesh.material.uniforms.opacityFactor.value = opacityFactor;
  mesh.renderOrder = 1;
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
    scene.userData.cloudOverlays.forEach(line => scene.remove(line));
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
