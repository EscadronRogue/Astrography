/**
 * @file 3D-printable STL kit exporter for the True Coordinates map.
 *
 * Produces a ZIP file containing one STL per star system.  Each STL is a
 * single solid mesh: the star's sphere with half-length connection tubes
 * fused directly into it via CSG union.
 *
 * Assembly concept: every connection tube is split at its midpoint — each
 * star carries its own half.  Small physical connectors / joints are used
 * to join the two halves together when assembling the model.
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
// Half-length tube builder (CSG)
// ---------------------------------------------------------------------------

/**
 * Build a CSG tube from the origin toward a target direction, with length
 * equal to half the full connection distance.  The tube starts slightly
 * inside the sphere (to guarantee a solid overlap for the CSG union) and
 * extends outward to the midpoint of the connection.
 *
 * @param {number} dx,dy,dz  – direction vector toward the connected star (mm)
 * @param {number} distance  – full center-to-center distance (mm)
 * @returns {CSG}
 */
function buildHalfTubeCSG(dx, dy, dz, distance) {
  if (distance < 1e-10) return CSG.fromPolygons([]);

  // Normalise direction
  const nx = dx / distance, ny = dy / distance, nz = dz / distance;

  // Tube runs from a point slightly behind the origin (overlap with sphere
  // interior ensures a watertight union) to the midpoint of the connection.
  const inset    = -1;                  // 1 mm inside the sphere
  const halfDist = distance / 2;

  const startX = nx * inset,  startY = ny * inset,  startZ = nz * inset;
  const endX   = nx * halfDist, endY = ny * halfDist, endZ = nz * halfDist;

  const tris = buildTubeTriangles(startX, startY, startZ, endX, endY, endZ, TUBE_RADIUS, 16);
  return CSG.fromTriangles(tris);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Export a 3D-printable kit as a ZIP of individual STL files.
 *
 * Each star system is exported as a single solid mesh: sphere + half-length
 * connection tubes fused via CSG union.  No separate tube files are produced.
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

  if (Array.isArray(connections)) {
    const seen = new Set();
    for (const { starA, starB } of connections) {
      if (!starA || !starB) continue;
      const sysA = getSystemName(starA);
      const sysB = getSystemName(starB);
      if (sysA === sysB) continue;

      const pairKey = sysA < sysB ? `${sysA}|${sysB}` : `${sysB}|${sysA}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const infoA = systemInfo.get(sysA);
      const infoB = systemInfo.get(sysB);
      if (!infoA || !infoB) continue;

      const dx = infoB.posMM.x - infoA.posMM.x;
      const dy = infoB.posMM.y - infoA.posMM.y;
      const dz = infoB.posMM.z - infoA.posMM.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      // Record on both systems (opposite directions)
      if (!systemConnections.has(sysA)) systemConnections.set(sysA, []);
      systemConnections.get(sysA).push({ otherSystem: sysB, dx, dy, dz, distance });

      if (!systemConnections.has(sysB)) systemConnections.set(sysB, []);
      systemConnections.get(sysB).push({ otherSystem: sysA, dx: -dx, dy: -dy, dz: -dz, distance });
    }
  }

  const zip = new JSZip();
  const starsFolder = zip.folder('stars');
  let starCount = 0;
  let tubeSegments = 0;

  // ── Generate sphere + half-tube meshes ───────────────────────────────
  for (const [sys, info] of systemInfo) {
    const radius = getExportRadius(info.star);

    // Build sphere at origin (high detail for clean prints)
    const sphereTris = buildSphereTriangles(0, 0, 0, radius, 32, 32);
    let csgResult = CSG.fromTriangles(sphereTris);

    // Fuse half-length tubes for each connection
    const conns = systemConnections.get(sys);
    if (conns && conns.length > 0) {
      for (const conn of conns) {
        const halfTube = buildHalfTubeCSG(
          conn.dx, conn.dy, conn.dz,
          conn.distance
        );
        csgResult = csgResult.union(halfTube);
        tubeSegments++;
      }
    }

    const resultTris = csgResult.toTriangles();
    const stlBuffer = trianglesToBinarySTL(resultTris);
    const filename = `${sanitizeFilename(sys)}.stl`;
    starsFolder.file(filename, stlBuffer);
    starCount++;
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
    `3D-print kit exported – ${starCount} star meshes ` +
    `(${tubeSegments} half-tube segments fused).`
  );
}
