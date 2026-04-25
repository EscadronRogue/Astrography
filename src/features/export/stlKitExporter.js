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

const ENGRAVE_DEPTH = 0.65;
const ENGRAVE_OUTSIDE_BLEED = 0.35;
const ENGRAVE_WIDTH_FACTOR = 2.25;
const ENGRAVE_HEIGHT_FACTOR = 1.65;
const DIGIT_WIDTH_UNITS = 6;
const DIGIT_HEIGHT_UNITS = 10;
const DIGIT_SPACING_UNITS = 1;
const SEGMENT_OVERLAP_UNITS = 0.25;

const SEVEN_SEGMENT_BOXES = {
  a: { x: 0, y: 4, width: 4, height: 2 },
  b: { x: 2, y: 2, width: 2, height: 4 },
  c: { x: 2, y: -2, width: 2, height: 4 },
  d: { x: 0, y: -4, width: 4, height: 2 },
  e: { x: -2, y: -2, width: 2, height: 4 },
  f: { x: -2, y: 2, width: 2, height: 4 },
  g: { x: 0, y: 0, width: 4, height: 2 }
};

const SEVEN_SEGMENT_DIGITS = {
  '0': ['a', 'b', 'c', 'd', 'e', 'f'],
  '1': ['b', 'c'],
  '2': ['a', 'b', 'g', 'e', 'd'],
  '3': ['a', 'b', 'g', 'c', 'd'],
  '4': ['f', 'g', 'b', 'c'],
  '5': ['a', 'f', 'g', 'c', 'd'],
  '6': ['a', 'f', 'g', 'e', 'c', 'd'],
  '7': ['a', 'b', 'c'],
  '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  '9': ['a', 'b', 'c', 'd', 'f', 'g']
};

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

function buildNumberEngravingCSG(numberText, dir, sphereRadius) {
  if (!numberText) return CSG.fromPolygons([]);

  const { right, up, forward } = buildFeatureBasis(dir);
  const maxWidth = sphereRadius * ENGRAVE_WIDTH_FACTOR;
  const maxHeight = sphereRadius * ENGRAVE_HEIGHT_FACTOR;
  const totalWidthUnits = numberText.length * DIGIT_WIDTH_UNITS + Math.max(0, numberText.length - 1) * DIGIT_SPACING_UNITS;
  const unitScale = Math.min(
    maxWidth / Math.max(totalWidthUnits, 1),
    maxHeight / DIGIT_HEIGHT_UNITS
  );
  const surfaceCentreDist = sphereRadius + (ENGRAVE_OUTSIDE_BLEED - ENGRAVE_DEPTH) / 2;
  const halfDepth = (ENGRAVE_OUTSIDE_BLEED + ENGRAVE_DEPTH) / 2;
  const totalWidthMM = totalWidthUnits * unitScale;
  const firstDigitCentreX = -totalWidthMM / 2 + (DIGIT_WIDTH_UNITS * unitScale) / 2;
  const triangles = [];

  for (let index = 0; index < numberText.length; index += 1) {
    const digit = numberText[index];
    const segments = SEVEN_SEGMENT_DIGITS[digit];
    if (!segments) continue;

    const digitCentreX = firstDigitCentreX + index * (DIGIT_WIDTH_UNITS + DIGIT_SPACING_UNITS) * unitScale;

    for (const segmentKey of segments) {
      const box = SEVEN_SEGMENT_BOXES[segmentKey];
      if (!box) continue;

      const centre = [
        right[0] * (digitCentreX + box.x * unitScale) + up[0] * (box.y * unitScale) + forward[0] * surfaceCentreDist,
        right[1] * (digitCentreX + box.x * unitScale) + up[1] * (box.y * unitScale) + forward[1] * surfaceCentreDist,
        right[2] * (digitCentreX + box.x * unitScale) + up[2] * (box.y * unitScale) + forward[2] * surfaceCentreDist
      ];

      triangles.push(
        ...buildOrientedBoxTriangles(
          centre,
          right,
          up,
          forward,
          ((box.width + SEGMENT_OVERLAP_UNITS) * unitScale) / 2,
          ((box.height + SEGMENT_OVERLAP_UNITS) * unitScale) / 2,
          halfDepth
        )
      );
    }
  }

  return CSG.fromTriangles(triangles);
}

function rotatePointIntoBasis(point, basis) {
  return [
    vecDot(point, basis.right),
    vecDot(point, basis.up),
    vecDot(point, basis.forward)
  ];
}

function placeTrianglesOnBuildPlate(triangles) {
  let minZ = Infinity;

  for (const triangle of triangles) {
    minZ = Math.min(minZ, triangle.a[2], triangle.b[2], triangle.c[2]);
  }

  if (!Number.isFinite(minZ)) return triangles;
  const zOffset = -minZ;

  return triangles.map(triangle => ({
    a: [triangle.a[0], triangle.a[1], triangle.a[2] + zOffset],
    b: [triangle.b[0], triangle.b[1], triangle.b[2] + zOffset],
    c: [triangle.c[0], triangle.c[1], triangle.c[2] + zOffset]
  }));
}

function orientTrianglesForPrint(triangles, faceDirection) {
  const basis = buildFeatureBasis(faceDirection);
  const rotated = triangles.map(triangle => ({
    a: rotatePointIntoBasis(triangle.a, basis),
    b: rotatePointIntoBasis(triangle.b, basis),
    c: rotatePointIntoBasis(triangle.c, basis)
  }));

  return placeTrianglesOnBuildPlate(rotated);
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

    const engravingDir = findFeatureDirection(tubeDirs);
    const systemRank = rankMap.get(systemName);
    if (Number.isFinite(systemRank)) {
      csgResult = csgResult.subtract(
        buildNumberEngravingCSG(String(systemRank), engravingDir, radius)
      );
    }

    const orientedTriangles = orientTrianglesForPrint(csgResult.toTriangles(), engravingDir);
    const stlBuffer = trianglesToBinarySTL(orientedTriangles);
    starsFolder.file(`${sanitizeFilename(systemName)}.stl`, stlBuffer);
    starCount += 1;
  }

  connectorsFolder.file(
    'tube_joint.stl',
    trianglesToBinarySTL(placeTrianglesOnBuildPlate(buildJointTriangles()))
  );

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
