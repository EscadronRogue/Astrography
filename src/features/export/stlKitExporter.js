/**
 * @file 3D-printable STL kit exporter for the True Coordinates map.
 *
 * Produces a ZIP file containing:
 * - one STL per exported star system
 * - plain half-length connection tubes with flat ends
 * - engraved system numbers ranked by distance from Sol
 * - one separate sleeve joint STL that slides over tube ends
 */

import { CSG } from '../../vendor/csg.js';
import { getPrimaryClass } from '../../shared/stellarClassUtils.js';
import {
  TUBE_RADIUS,
  filterMainStars,
  buildSphereTriangles,
  buildTubeTriangles,
  trianglesToBinarySTL
} from './stlExporter.js';

// ---------------------------------------------------------------------------
// Printable-kit scale and sizing
// ---------------------------------------------------------------------------

const KIT_MM_PER_LY = 3;
const PRINTABLE_STANDARD_DIAMETER_MM = 8;
const PRINTABLE_STANDARD_RADIUS = PRINTABLE_STANDARD_DIAMETER_MM / 2;
const REDUCED_STAR_SCALE = 0.75;
const STANDARD_SIZE_CLASSES = new Set(['O', 'B', 'A', 'F', 'G', 'K']);

// This keeps the tube well fused into the sphere when the solids are unioned.
const TUBE_SPHERE_INSET = -1;

// ---------------------------------------------------------------------------
// Sleeve joint dimensions
// ---------------------------------------------------------------------------

const JOINT_LENGTH = 4.0;
const JOINT_OUTER_RADIUS = TUBE_RADIUS + 0.8;
const JOINT_INNER_RADIUS = TUBE_RADIUS + 0.15;
const JOINT_BORE_OVERSHOOT = 0.4;

// ---------------------------------------------------------------------------
// Engraved numbering
// ---------------------------------------------------------------------------

const ENGRAVE_DEPTH = 0.35;
const ENGRAVE_OUTSIDE_BLEED = 0.25;
const ENGRAVE_PIXEL_MAX = 0.34;
const ENGRAVE_MAX_LINES = 3;
const ENGRAVE_WIDTH_FACTOR = 1.6;
const ENGRAVE_HEIGHT_FACTOR = 1.3;

const FONT_CHAR_W = 5;
const FONT_CHAR_H = 7;
const FONT_CHAR_GAP = 1;
const FONT_LINE_GAP = 2;

/* eslint-disable no-multi-spaces */
const DIGIT_FONT = {
  '0': [0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E],
  '1': [0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E],
  '2': [0x0E, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1F],
  '3': [0x1F, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0E],
  '4': [0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02],
  '5': [0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E],
  '6': [0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E],
  '7': [0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E],
  '9': [0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C]
};
/* eslint-enable no-multi-spaces */

const FEATURE_CANDIDATES = (() => {
  const dirs = [];
  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        if (x === 0 && y === 0 && z === 0) continue;
        const len = Math.sqrt(x * x + y * y + z * z);
        dirs.push([x / len, y / len, z / len]);
      }
    }
  }
  return dirs;
})();

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
  return star.Common_name_of_the_star_system
    || star.Common_name_of_the_star
    || star.starId
    || 'Unknown';
}

function getRankingDistance(star) {
  return Number.isFinite(star?.distance) ? star.distance : Number.POSITIVE_INFINITY;
}

function getPrintableKitRadius(star) {
  const cls = getPrimaryClass(star);
  const multiplier = STANDARD_SIZE_CLASSES.has(cls) ? 1 : REDUCED_STAR_SCALE;
  return PRINTABLE_STANDARD_RADIUS * multiplier;
}

function vecNormalise(x, y, z) {
  const len = Math.sqrt(x * x + y * y + z * z) || 1;
  return [x / len, y / len, z / len];
}

function vecDot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vecCross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function buildOrientedBoxTriangles(c, axisR, axisU, axisF, halfR, halfU, halfF) {
  const corner = (sr, su, sf) => [
    c[0] + axisR[0] * sr * halfR + axisU[0] * su * halfU + axisF[0] * sf * halfF,
    c[1] + axisR[1] * sr * halfR + axisU[1] * su * halfU + axisF[1] * sf * halfF,
    c[2] + axisR[2] * sr * halfR + axisU[2] * su * halfU + axisF[2] * sf * halfF
  ];

  const v = [
    corner(-1, -1, -1),
    corner(+1, -1, -1),
    corner(+1, +1, -1),
    corner(-1, +1, -1),
    corner(-1, -1, +1),
    corner(+1, -1, +1),
    corner(+1, +1, +1),
    corner(-1, +1, +1)
  ];

  const faces = [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [2, 3, 7, 6],
    [0, 4, 7, 3],
    [1, 2, 6, 5]
  ];

  const triangles = [];
  for (const face of faces) {
    triangles.push({ a: v[face[0]], b: v[face[1]], c: v[face[2]] });
    triangles.push({ a: v[face[0]], b: v[face[2]], c: v[face[3]] });
  }

  return triangles;
}

function buildFeatureBasis(forward) {
  let worldUp = [0, 1, 0];
  if (Math.abs(vecDot(forward, worldUp)) > 0.9) worldUp = [1, 0, 0];

  const lookDir = [-forward[0], -forward[1], -forward[2]];
  const right = vecNormalise(...vecCross(lookDir, worldUp));
  const up = vecNormalise(...vecCross(right, lookDir));

  return { right, up, forward };
}

function buildHalfTubeCSG(nx, ny, nz, distance) {
  if (distance < 1e-10) return CSG.fromPolygons([]);

  const halfDist = distance / 2;
  const tubeStart = [nx * TUBE_SPHERE_INSET, ny * TUBE_SPHERE_INSET, nz * TUBE_SPHERE_INSET];
  const tubeEnd = [nx * halfDist, ny * halfDist, nz * halfDist];
  const tubeTris = buildTubeTriangles(
    tubeStart[0], tubeStart[1], tubeStart[2],
    tubeEnd[0], tubeEnd[1], tubeEnd[2],
    TUBE_RADIUS,
    16
  );

  return CSG.fromTriangles(tubeTris);
}

function buildJointTriangles() {
  const outer = CSG.fromTriangles(
    buildTubeTriangles(0, 0, -JOINT_LENGTH / 2, 0, 0, JOINT_LENGTH / 2, JOINT_OUTER_RADIUS, 24)
  );
  const inner = CSG.fromTriangles(
    buildTubeTriangles(
      0,
      0,
      -(JOINT_LENGTH / 2 + JOINT_BORE_OVERSHOOT),
      0,
      0,
      JOINT_LENGTH / 2 + JOINT_BORE_OVERSHOOT,
      JOINT_INNER_RADIUS,
      24
    )
  );

  return outer.subtract(inner).toTriangles();
}

function findFeatureDirection(connectionDirs) {
  if (!connectionDirs || connectionDirs.length === 0) return [0, 1, 0];

  let bestDir = [0, 1, 0];
  let bestMinAngle = -Infinity;

  for (const candidate of FEATURE_CANDIDATES) {
    let minAngle = Infinity;
    for (const tubeDir of connectionDirs) {
      const dot = vecDot(candidate, tubeDir);
      const angle = Math.acos(Math.max(-1, Math.min(dot, 1)));
      if (angle < minAngle) minAngle = angle;
    }
    if (minAngle > bestMinAngle) {
      bestMinAngle = minAngle;
      bestDir = candidate;
    }
  }

  return bestDir;
}

function splitBalanced(text, parts) {
  const lines = [];
  let index = 0;

  for (let part = 0; part < parts; part += 1) {
    const remainingChars = text.length - index;
    const remainingParts = parts - part;
    const size = Math.ceil(remainingChars / remainingParts);
    lines.push(text.slice(index, index + size));
    index += size;
  }

  return lines.filter(Boolean);
}

function computeNumberLayout(text, sphereRadius) {
  const charPx = FONT_CHAR_W + FONT_CHAR_GAP;
  const linePx = FONT_CHAR_H + FONT_LINE_GAP;
  const maxWidth = sphereRadius * ENGRAVE_WIDTH_FACTOR;
  const maxHeight = sphereRadius * ENGRAVE_HEIGHT_FACTOR;

  let best = null;
  const maxLines = Math.min(ENGRAVE_MAX_LINES, text.length);

  for (let lineCount = 1; lineCount <= maxLines; lineCount += 1) {
    const lines = splitBalanced(text, lineCount);
    const widthPx = Math.max(...lines.map(line => line.length * charPx - FONT_CHAR_GAP));
    const heightPx = lines.length * linePx - FONT_LINE_GAP;
    const pixelSize = Math.min(
      ENGRAVE_PIXEL_MAX,
      maxWidth / Math.max(widthPx, 1),
      maxHeight / Math.max(heightPx, 1)
    );

    if (!best || pixelSize > best.pixelSize || (pixelSize === best.pixelSize && lines.length < best.lines.length)) {
      best = { lines, widthPx, heightPx, pixelSize };
    }
  }

  return best;
}

function buildNumberEngravingCSG(numberText, dir, sphereRadius) {
  if (!numberText) return CSG.fromPolygons([]);

  const layout = computeNumberLayout(numberText, sphereRadius);
  if (!layout) return CSG.fromPolygons([]);

  const { lines, widthPx, heightPx, pixelSize } = layout;
  const { right, up, forward } = buildFeatureBasis(dir);
  const charPx = FONT_CHAR_W + FONT_CHAR_GAP;
  const linePx = FONT_CHAR_H + FONT_LINE_GAP;
  const surfaceCentreDist = sphereRadius + (ENGRAVE_OUTSIDE_BLEED - ENGRAVE_DEPTH) / 2;
  const halfDepth = (ENGRAVE_OUTSIDE_BLEED + ENGRAVE_DEPTH) / 2;
  const textHeightMM = heightPx * pixelSize;
  const blockTopY = textHeightMM / 2;
  const triangles = [];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const lineWidthMM = (line.length * charPx - FONT_CHAR_GAP) * pixelSize;
    const lineStartX = -lineWidthMM / 2;
    const lineTopY = blockTopY - lineIndex * linePx * pixelSize;

    for (let charIndex = 0; charIndex < line.length; charIndex += 1) {
      const glyph = DIGIT_FONT[line[charIndex]];
      if (!glyph) continue;

      const charOffsetX = charIndex * charPx * pixelSize;
      for (let row = 0; row < FONT_CHAR_H; row += 1) {
        const bits = glyph[row];
        for (let col = 0; col < FONT_CHAR_W; col += 1) {
          if (!((bits >> (FONT_CHAR_W - 1 - col)) & 1)) continue;

          const lx = lineStartX + charOffsetX + (col + 0.5) * pixelSize;
          const ly = lineTopY - (row + 0.5) * pixelSize;
          const lz = surfaceCentreDist;

          const centre = [
            right[0] * lx + up[0] * ly + forward[0] * lz,
            right[1] * lx + up[1] * ly + forward[1] * lz,
            right[2] * lx + up[2] * ly + forward[2] * lz
          ];

          triangles.push(
            ...buildOrientedBoxTriangles(
              centre,
              right,
              up,
              forward,
              pixelSize / 2,
              pixelSize / 2,
              halfDepth
            )
          );
        }
      }
    }
  }

  return CSG.fromTriangles(triangles);
}

function buildSystemRankMap(sourceStars) {
  const rankedStars = filterMainStars(Array.isArray(sourceStars) ? sourceStars : [])
    .slice()
    .sort((a, b) => {
      const distanceDelta = getRankingDistance(a) - getRankingDistance(b);
      if (distanceDelta !== 0) return distanceDelta;
      return getSystemName(a).localeCompare(getSystemName(b));
    });

  const rankMap = new Map();
  rankedStars.forEach((star, index) => {
    rankMap.set(getSystemName(star), index + 1);
  });
  return rankMap;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Export a 3D-printable kit as a ZIP of individual STL files.
 *
 * @param {Array} stars - Currently filtered/displayed stars.
 * @param {Array} connections - Current connection pairs.
 * @param {Object} [options]
 * @param {Array} [options.allStars] - Full heliocentric star dataset for global numbering.
 */
export async function exportPrintableSTLKit(stars, connections, options = {}) {
  if (!stars || stars.length === 0) {
    console.warn('STL kit export: no stars to export.');
    return;
  }

  const JSZip = window.JSZip;
  if (!JSZip) {
    alert('JSZip library is not loaded. Cannot create ZIP file.');
    return;
  }

  const mainStars = filterMainStars(stars);
  const rankMap = buildSystemRankMap(options.allStars?.length ? options.allStars : stars);
  const systemInfo = new Map();

  for (const star of mainStars) {
    if (!star.truePosition) continue;
    const systemName = getSystemName(star);
    systemInfo.set(systemName, {
      star,
      posMM: {
        x: star.truePosition.x * KIT_MM_PER_LY,
        y: star.truePosition.y * KIT_MM_PER_LY,
        z: star.truePosition.z * KIT_MM_PER_LY
      }
    });
  }

  const systemConnections = new Map();
  if (Array.isArray(connections)) {
    const seenPairs = new Set();

    for (const { starA, starB } of connections) {
      if (!starA || !starB) continue;

      const sysA = getSystemName(starA);
      const sysB = getSystemName(starB);
      if (sysA === sysB) continue;

      const pairKey = sysA < sysB ? `${sysA}|${sysB}` : `${sysB}|${sysA}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      const infoA = systemInfo.get(sysA);
      const infoB = systemInfo.get(sysB);
      if (!infoA || !infoB) continue;

      const dx = infoB.posMM.x - infoA.posMM.x;
      const dy = infoB.posMM.y - infoA.posMM.y;
      const dz = infoB.posMM.z - infoA.posMM.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (!systemConnections.has(sysA)) systemConnections.set(sysA, []);
      if (!systemConnections.has(sysB)) systemConnections.set(sysB, []);

      systemConnections.get(sysA).push({ otherSystem: sysB, dx, dy, dz, distance });
      systemConnections.get(sysB).push({ otherSystem: sysA, dx: -dx, dy: -dy, dz: -dz, distance });
    }
  }

  const zip = new JSZip();
  const starsFolder = zip.folder('stars');
  const connectorsFolder = zip.folder('connectors');
  let starCount = 0;
  let halfTubeCount = 0;

  for (const [systemName, info] of systemInfo) {
    const radius = getPrintableKitRadius(info.star);
    let csgResult = CSG.fromTriangles(buildSphereTriangles(0, 0, 0, radius, 32, 32));
    const tubeDirs = [];
    const starConnections = systemConnections.get(systemName) || [];

    for (const connection of starConnections) {
      const [nx, ny, nz] = vecNormalise(connection.dx, connection.dy, connection.dz);
      tubeDirs.push([nx, ny, nz]);
      csgResult = csgResult.union(buildHalfTubeCSG(nx, ny, nz, connection.distance));
      halfTubeCount += 1;
    }

    const systemRank = rankMap.get(systemName);
    if (Number.isFinite(systemRank)) {
      const engravingDir = findFeatureDirection(tubeDirs);
      csgResult = csgResult.subtract(
        buildNumberEngravingCSG(String(systemRank), engravingDir, radius)
      );
    }

    const stlBuffer = trianglesToBinarySTL(csgResult.toTriangles());
    starsFolder.file(`${sanitizeFilename(systemName)}.stl`, stlBuffer);
    starCount += 1;
  }

  connectorsFolder.file('tube_joint.stl', trianglesToBinarySTL(buildJointTriangles()));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'star_map_3d_print_kit.zip';
  link.click();
  URL.revokeObjectURL(url);

  console.log(
    `3D-print kit exported - ${starCount} stars, ${halfTubeCount} half-tubes, ` +
    'and 1 sleeve joint.'
  );
}
