/**
 * @file 3D-printable STL kit exporter for the True Coordinates map.
 *
 * Produces a ZIP file containing:
 *  – one STL per star system: a sphere with cylindrical holes bored through
 *    it at the exact 3D angles of its connections, sized to accept the tubes
 *  – one STL per connection: a standalone tube oriented along the Z-axis,
 *    with the correct length to span center-to-center between the two stars
 *
 * Each piece is exported at the origin for easy slicing / printing.
 */

import { CSG } from '../../vendor/csg.js';
import {
  MM_PER_LY,
  TUBE_RADIUS,
  getExportRadius,
  filterMainStars,
  buildSphereTriangles,
  buildTubeTriangles,
  trianglesToBinarySTL
} from './stlExporter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function getSystemName(star) {
  return star.Common_name_of_the_star_system || star.Common_name_of_the_star || star.starId || 'Unknown';
}

// ---------------------------------------------------------------------------
// Bore-hole cylinder builder
// ---------------------------------------------------------------------------

/**
 * Build a CSG cylinder centered at the origin, aligned along `direction`,
 * long enough to fully penetrate a sphere of the given radius.
 *
 * @param {number} dx,dy,dz  – direction vector (need not be normalised)
 * @param {number} sphereRadius – radius of the sphere being drilled
 * @param {number} boreRadius   – radius of the hole
 * @returns {CSG}
 */
function buildBoreCylinderCSG(dx, dy, dz, sphereRadius, boreRadius) {
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-10) return CSG.fromPolygons([]);

  // Normalise
  const nx = dx / len, ny = dy / len, nz = dz / len;

  // The cylinder extends well beyond the sphere in both directions
  const halfLen = sphereRadius + 2; // generous overshoot in mm
  const startX = -nx * halfLen, startY = -ny * halfLen, startZ = -nz * halfLen;
  const endX   =  nx * halfLen, endY   =  ny * halfLen, endZ   =  nz * halfLen;

  const tris = buildTubeTriangles(startX, startY, startZ, endX, endY, endZ, boreRadius, 16);
  return CSG.fromTriangles(tris);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Export a 3D-printable kit as a ZIP of individual STL files.
 *
 * @param {Array}  stars        – Currently filtered/displayed stars.
 * @param {Array}  connections  – Current connection pairs (may be empty).
 */
export async function exportPrintableSTLKit(stars, connections) {
  if (!stars || stars.length === 0) {
    console.warn('STL kit export: no stars to export.');
    return;
  }

  const JSZip = window.JSZip;
  if (!JSZip) {
    alert('JSZip library is not loaded. Cannot create ZIP file.');
    return;
  }

  // ── Collapse to main stars ───────────────────────────────────────────
  const mainStars = filterMainStars(stars);

  // Build lookup: system name → { star, posMM (position in mm) }
  const systemInfo = new Map();
  for (const star of mainStars) {
    if (!star.truePosition) continue;
    const sys = getSystemName(star);
    systemInfo.set(sys, {
      star,
      posMM: {
        x: star.truePosition.x * MM_PER_LY,
        y: star.truePosition.y * MM_PER_LY,
        z: star.truePosition.z * MM_PER_LY
      }
    });
  }

  // ── Build per-system connection lists & deduplicate ──────────────────
  // systemConnections: systemName → [ { otherSystem, dx, dy, dz, distance } ]
  const systemConnections = new Map();
  const uniqueTubes = new Map(); // pairKey → { sysA, sysB, distance }

  if (Array.isArray(connections)) {
    for (const { starA, starB } of connections) {
      if (!starA || !starB) continue;
      const sysA = getSystemName(starA);
      const sysB = getSystemName(starB);
      if (sysA === sysB) continue;

      const pairKey = sysA < sysB ? `${sysA}|${sysB}` : `${sysB}|${sysA}`;
      if (uniqueTubes.has(pairKey)) continue;

      const infoA = systemInfo.get(sysA);
      const infoB = systemInfo.get(sysB);
      if (!infoA || !infoB) continue;

      const dx = infoB.posMM.x - infoA.posMM.x;
      const dy = infoB.posMM.y - infoA.posMM.y;
      const dz = infoB.posMM.z - infoA.posMM.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      uniqueTubes.set(pairKey, { sysA, sysB, distance });

      // Record on both systems
      if (!systemConnections.has(sysA)) systemConnections.set(sysA, []);
      systemConnections.get(sysA).push({ otherSystem: sysB, dx, dy, dz, distance });

      if (!systemConnections.has(sysB)) systemConnections.set(sysB, []);
      systemConnections.get(sysB).push({ otherSystem: sysA, dx: -dx, dy: -dy, dz: -dz, distance });
    }
  }

  const zip = new JSZip();
  const starsFolder = zip.folder('stars');
  const tubesFolder = zip.folder('tubes');
  let starCount = 0;
  let tubeCount = 0;

  // ── Generate drilled spheres ─────────────────────────────────────────
  for (const [sys, info] of systemInfo) {
    const radius = getExportRadius(info.star);

    // Build sphere at origin
    const sphereTris = buildSphereTriangles(0, 0, 0, radius, 32, 32);
    let csgSphere = CSG.fromTriangles(sphereTris);

    // Bore holes for each connection
    const conns = systemConnections.get(sys);
    if (conns && conns.length > 0) {
      for (const conn of conns) {
        const boreCylinder = buildBoreCylinderCSG(
          conn.dx, conn.dy, conn.dz,
          radius,
          TUBE_RADIUS
        );
        csgSphere = csgSphere.subtract(boreCylinder);
      }
    }

    const resultTris = csgSphere.toTriangles();
    const stlBuffer = trianglesToBinarySTL(resultTris);
    const filename = `${sanitizeFilename(sys)}.stl`;
    starsFolder.file(filename, stlBuffer);
    starCount++;
  }

  // ── Generate standalone tubes ────────────────────────────────────────
  // Each tube is exported at the origin, aligned along the Z-axis,
  // with length = center-to-center distance between the two systems.
  for (const [, tube] of uniqueTubes) {
    const halfLen = tube.distance / 2;
    const tubeTris = buildTubeTriangles(0, 0, -halfLen, 0, 0, halfLen, TUBE_RADIUS, 16);
    const stlBuffer = trianglesToBinarySTL(tubeTris);
    const filename = `${sanitizeFilename(tube.sysA)}--${sanitizeFilename(tube.sysB)}.stl`;
    tubesFolder.file(filename, stlBuffer);
    tubeCount++;
  }

  // ── Generate & download ZIP ──────────────────────────────────────────
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'star_map_3d_print_kit.zip';
  link.click();
  URL.revokeObjectURL(url);

  console.log(
    `3D-print kit exported – ${starCount} drilled spheres, ` +
    `${tubeCount} tubes.`
  );
}
