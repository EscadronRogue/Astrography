/**
 * @file STL exporter for the True Coordinates 3D map.
 *
 * Generates a binary STL file containing:
 *  – one sphere per star *system* (only the main/primary star is exported)
 *  – sphere diameter determined by stellar class with physical scale
 *  – connection tubes with uniform thickness
 *
 * Physical scale:
 *   1 LY  = 5 mm   →  coordinate multiplier = 5
 *   Standard star (G-class) diameter = 8 mm  →  radius = 4 mm = 0.8 LY-units
 *   Tube diameter = 2 mm  →  radius = 1 mm = 0.2 LY-units
 */

import { getPrimaryClass } from '../../shared/stellarClassUtils.js';

// ---------------------------------------------------------------------------
// Physical scale constants  (all in export-units where 1 LY = 5 mm)
// ---------------------------------------------------------------------------

/** mm per light-year in the exported STL. */
export const MM_PER_LY = 5;

/** Standard star (G-class) diameter in mm. */
const STANDARD_DIAMETER_MM = 8;

/** Standard star radius in mm (all geometry is built in mm). */
export const STANDARD_RADIUS = STANDARD_DIAMETER_MM / 2; // 4 mm

/** Connection tube diameter in mm. */
const TUBE_DIAMETER_MM = 2;

/** Connection tube radius in mm. */
export const TUBE_RADIUS = TUBE_DIAMETER_MM / 2; // 1 mm

// ---------------------------------------------------------------------------
// Stellar class → size multiplier (relative to standard G-class star)
// ---------------------------------------------------------------------------

const CLASS_SIZE_MULTIPLIER = {
  O: 1.15,
  B: 1.15,
  A: 1.15,
  F: 1.00,
  G: 1.00,
  K: 0.85,
  M: 0.65,
  D: 0.50,
  L: 0.50,
  T: 0.50,
  Y: 0.50,
  Other: 0.50
};

export function getExportRadius(star) {
  const cls = getPrimaryClass(star);
  const multiplier = CLASS_SIZE_MULTIPLIER[cls] ?? CLASS_SIZE_MULTIPLIER.Other;
  return STANDARD_RADIUS * multiplier;
}

// ---------------------------------------------------------------------------
// Main-star-per-system filter
// ---------------------------------------------------------------------------

/**
 * Keep only one star per system — the one with the highest spectral
 * hierarchy (lowest hierarchy number = most luminous class).  Among ties,
 * pick the brightest (lowest absolute magnitude).
 */
export function filterMainStars(stars) {
  const HIERARCHY = { O: 1, B: 2, A: 3, D: 4, F: 5, G: 6, K: 7, M: 8, L: 9, T: 10, Y: 11, Other: 12 };

  const systemMap = new Map();
  for (let i = 0; i < stars.length; i++) {
    const star = stars[i];
    const system = star.Common_name_of_the_star_system || star.Common_name_of_the_star || star.starId;
    if (!system) continue;

    const existing = systemMap.get(system);
    if (!existing) {
      systemMap.set(system, star);
      continue;
    }

    const curH = HIERARCHY[getPrimaryClass(star)] ?? 12;
    const exH  = HIERARCHY[getPrimaryClass(existing)] ?? 12;
    if (curH < exH) {
      systemMap.set(system, star);
    } else if (curH === exH) {
      const curMag = star.absoluteMagnitude ?? star.Absolute_magnitude ?? 99;
      const exMag  = existing.absoluteMagnitude ?? existing.Absolute_magnitude ?? 99;
      if (curMag < exMag) {
        systemMap.set(system, star);
      }
    }
  }

  return Array.from(systemMap.values());
}

// ---------------------------------------------------------------------------
// Tessellation
// ---------------------------------------------------------------------------

/** Sphere tessellation (segments around latitude / longitude). */
const SPHERE_SEGMENTS = 16;

/** Number of radial segments for connection tubes. */
const TUBE_RADIAL_SEGMENTS = 8;

// ---------------------------------------------------------------------------
// Low‑level geometry helpers
// ---------------------------------------------------------------------------

/**
 * Generate triangles for a UV sphere centred at `centre` (in export-units)
 * with the given `radius`.
 */
export function buildSphereTriangles(cx, cy, cz, radius, widthSegs = SPHERE_SEGMENTS, heightSegs = SPHERE_SEGMENTS) {
  const triangles = [];

  for (let iy = 0; iy < heightSegs; iy++) {
    const phi1 = (iy / heightSegs) * Math.PI;
    const phi2 = ((iy + 1) / heightSegs) * Math.PI;
    const sinP1 = Math.sin(phi1), cosP1 = Math.cos(phi1);
    const sinP2 = Math.sin(phi2), cosP2 = Math.cos(phi2);

    for (let ix = 0; ix < widthSegs; ix++) {
      const theta1 = (ix / widthSegs) * 2 * Math.PI;
      const theta2 = ((ix + 1) / widthSegs) * 2 * Math.PI;
      const sinT1 = Math.sin(theta1), cosT1 = Math.cos(theta1);
      const sinT2 = Math.sin(theta2), cosT2 = Math.cos(theta2);

      const p00 = [cx + radius * sinP1 * cosT1, cy + radius * cosP1, cz + radius * sinP1 * sinT1];
      const p10 = [cx + radius * sinP1 * cosT2, cy + radius * cosP1, cz + radius * sinP1 * sinT2];
      const p01 = [cx + radius * sinP2 * cosT1, cy + radius * cosP2, cz + radius * sinP2 * sinT1];
      const p11 = [cx + radius * sinP2 * cosT2, cy + radius * cosP2, cz + radius * sinP2 * sinT2];

      if (iy === 0) {
        triangles.push({ a: p00, b: p11, c: p01 });
      } else if (iy === heightSegs - 1) {
        triangles.push({ a: p00, b: p10, c: p11 });
      } else {
        triangles.push({ a: p00, b: p10, c: p11 });
        triangles.push({ a: p00, b: p11, c: p01 });
      }
    }
  }

  return triangles;
}

/**
 * Generate triangles for a capped cylinder (tube) between two points
 * (already in export-units).
 */
export function buildTubeTriangles(sx, sy, sz, ex, ey, ez, radius = TUBE_RADIUS, radialSegs = TUBE_RADIAL_SEGMENTS) {
  const triangles = [];

  const dx = ex - sx, dy = ey - sy, dz = ez - sz;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (length < 1e-10) return triangles;

  const ax = dx / length, ay = dy / length, az = dz / length;

  // Perpendicular basis
  let refX = 0, refY = 1, refZ = 0;
  if (Math.abs(ay) > 0.9) { refX = 1; refY = 0; refZ = 0; }

  let px = ay * refZ - az * refY;
  let py = az * refX - ax * refZ;
  let pz = ax * refY - ay * refX;
  const pl = Math.sqrt(px * px + py * py + pz * pz);
  px /= pl; py /= pl; pz /= pl;

  const qx = ay * pz - az * py;
  const qy = az * px - ax * pz;
  const qz = ax * py - ay * px;

  const startRing = [];
  const endRing = [];
  for (let i = 0; i < radialSegs; i++) {
    const angle = (i / radialSegs) * 2 * Math.PI;
    const cosA = Math.cos(angle) * radius;
    const sinA = Math.sin(angle) * radius;

    startRing.push([sx + px * cosA + qx * sinA, sy + py * cosA + qy * sinA, sz + pz * cosA + qz * sinA]);
    endRing.push([ex + px * cosA + qx * sinA, ey + py * cosA + qy * sinA, ez + pz * cosA + qz * sinA]);
  }

  for (let i = 0; i < radialSegs; i++) {
    const next = (i + 1) % radialSegs;
    triangles.push({ a: startRing[i], b: startRing[next], c: endRing[next] });
    triangles.push({ a: startRing[i], b: endRing[next], c: endRing[i] });
  }

  // Caps
  const sc = [sx, sy, sz];
  const ec = [ex, ey, ez];
  for (let i = 0; i < radialSegs; i++) {
    const next = (i + 1) % radialSegs;
    triangles.push({ a: sc, b: startRing[next], c: startRing[i] });
    triangles.push({ a: ec, b: endRing[i], c: endRing[next] });
  }

  return triangles;
}

// ---------------------------------------------------------------------------
// Normal computation
// ---------------------------------------------------------------------------

function computeNormal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  return [nx / len, ny / len, nz / len];
}

// ---------------------------------------------------------------------------
// Binary STL writer
// ---------------------------------------------------------------------------

export function trianglesToBinarySTL(triangles) {
  const triCount = triangles.length;
  const bufferSize = 80 + 4 + triCount * 50;
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  const header = 'Astrography – True Coordinates STL Export';
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
  }

  view.setUint32(80, triCount, true);

  let offset = 84;
  for (let t = 0; t < triCount; t++) {
    const { a, b, c } = triangles[t];
    const n = computeNormal(a, b, c);

    view.setFloat32(offset, n[0], true); offset += 4;
    view.setFloat32(offset, n[1], true); offset += 4;
    view.setFloat32(offset, n[2], true); offset += 4;
    view.setFloat32(offset, a[0], true); offset += 4;
    view.setFloat32(offset, a[1], true); offset += 4;
    view.setFloat32(offset, a[2], true); offset += 4;
    view.setFloat32(offset, b[0], true); offset += 4;
    view.setFloat32(offset, b[1], true); offset += 4;
    view.setFloat32(offset, b[2], true); offset += 4;
    view.setFloat32(offset, c[0], true); offset += 4;
    view.setFloat32(offset, c[1], true); offset += 4;
    view.setFloat32(offset, c[2], true); offset += 4;
    view.setUint16(offset, 0, true); offset += 2;
  }

  return buffer;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Export the current True Coordinates scene as a binary .stl file.
 *
 * Only the main star of each system is exported. Sphere sizes follow the
 * stellar-class scale defined in this module (not the on-screen displaySize).
 * Positions are converted to a physical scale where 1 LY = 5 mm.
 *
 * @param {Array}  stars        – Currently filtered/displayed stars.
 * @param {Array}  connections  – Current connection pairs (may be empty).
 */
export function exportTrueCoordinatesSTL(stars, connections) {
  if (!stars || stars.length === 0) {
    console.warn('STL export: no stars to export.');
    return;
  }

  // Keep only main star per system
  const mainStars = filterMainStars(stars);

  // Build a set of exported star IDs so we can resolve connections
  const exportedById = new Map();
  for (const star of mainStars) {
    exportedById.set(star.starId, star);
  }

  const allTriangles = [];

  // ── Stars → spheres ──────────────────────────────────────────────────
  for (let i = 0; i < mainStars.length; i++) {
    const star = mainStars[i];
    const pos = star.truePosition;
    if (!pos) continue;

    const radius = getExportRadius(star);
    const tris = buildSphereTriangles(
      pos.x * MM_PER_LY, pos.y * MM_PER_LY, pos.z * MM_PER_LY,
      radius
    );
    for (let t = 0; t < tris.length; t++) allTriangles.push(tris[t]);
  }

  // ── Connections → tubes ──────────────────────────────────────────────
  // Build a lookup from system name → main star position so connections
  // between companion stars still resolve to the main star's sphere centre.
  if (Array.isArray(connections) && connections.length > 0) {
    const systemPos = new Map();
    for (const star of mainStars) {
      if (!star.truePosition) continue;
      const sys = star.Common_name_of_the_star_system || star.Common_name_of_the_star || star.starId;
      systemPos.set(sys, star.truePosition);
      // Also index by starId for direct lookup
      systemPos.set(star.starId, star.truePosition);
    }

    // Deduplicate connections that may reference different companions of
    // the same two systems (after collapsing to main stars).
    const visitedPairs = new Set();

    for (let i = 0; i < connections.length; i++) {
      const { starA, starB } = connections[i];
      if (!starA || !starB) continue;

      const sysA = starA.Common_name_of_the_star_system || starA.Common_name_of_the_star || starA.starId;
      const sysB = starB.Common_name_of_the_star_system || starB.Common_name_of_the_star || starB.starId;

      // Skip self-connections within the same system
      if (sysA === sysB) continue;

      const pairKey = sysA < sysB ? `${sysA}|${sysB}` : `${sysB}|${sysA}`;
      if (visitedPairs.has(pairKey)) continue;
      visitedPairs.add(pairKey);

      const posA = systemPos.get(sysA) || starA.truePosition;
      const posB = systemPos.get(sysB) || starB.truePosition;
      if (!posA || !posB) continue;

      const tris = buildTubeTriangles(
        posA.x * MM_PER_LY, posA.y * MM_PER_LY, posA.z * MM_PER_LY,
        posB.x * MM_PER_LY, posB.y * MM_PER_LY, posB.z * MM_PER_LY
      );
      for (let t = 0; t < tris.length; t++) allTriangles.push(tris[t]);
    }
  }

  // ── Encode & download ────────────────────────────────────────────────
  const stlBuffer = trianglesToBinarySTL(allTriangles);
  const blob = new Blob([stlBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = 'true_coordinates_stars.stl';
  link.click();

  URL.revokeObjectURL(url);

  const connCount = Array.isArray(connections) ? connections.length : 0;
  console.log(
    `STL export complete – ${mainStars.length} systems (from ${stars.length} stars), ` +
    `${connCount} connections, ${allTriangles.length} triangles.`
  );
}
