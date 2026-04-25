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

const FACET_DEPTH_FACTOR = 0.3;
const FACET_BOX_HALF_DEPTH_FACTOR = 1.5;
const FACET_BOX_HALF_EXTENT_FACTOR = 2.2;
const ENGRAVE_DEPTH = 0.5;
const ENGRAVE_OUTSIDE_BLEED = 0.25;
const ENGRAVE_WIDTH_FACTOR = 0.8;
const ENGRAVE_HEIGHT_FACTOR = 0.72;
const DIGIT_WIDTH_UNITS = 8;
const DIGIT_HEIGHT_UNITS = 10;
const DIGIT_SPACING_UNITS = 1;
const DIGIT_LINE_SPACING_UNITS = 2;
const DIGIT_STROKE_WIDTH_UNITS = 1.3;
const STROKE_LENGTH_BLEED_UNITS = 0.35;

const VECTOR_DIGIT_GLYPHS = {
  '0': [
    [[-2.2, 5], [2.2, 5], [3.4, 3.8], [3.4, -3.8], [2.2, -5], [-2.2, -5], [-3.4, -3.8], [-3.4, 3.8], [-2.2, 5]]
  ],
  '1': [
    [[-1.6, 2.8], [0, 5], [0, -5]],
    [[-1.8, -5], [1.8, -5]]
  ],
  '2': [
    [[-3.2, 3.6], [-2.2, 5], [2.2, 5], [3.2, 4], [3.2, 2], [-3.2, -3.5], [-3.2, -5], [3.2, -5]]
  ],
  '3': [
    [[-3, 5], [2, 5], [3.2, 3.8], [3.2, 1.4], [2.2, 0.2], [-0.2, 0]],
    [[-0.2, 0], [2.2, -0.2], [3.2, -1.4], [3.2, -3.8], [2, -5], [-3, -5]]
  ],
  '4': [
    [[2.6, 5], [2.6, -5]],
    [[-3, 1.2], [3, 1.2]],
    [[-3, 1.2], [1.4, 5]]
  ],
  '5': [
    [[3, 5], [-3, 5], [-3, 0.8], [1.8, 0.8], [3.2, -0.6], [3.2, -3.8], [2, -5], [-3, -5]]
  ],
  '6': [
    [[3, 4.2], [2, 5], [-2.2, 5], [-3.4, 3.6], [-3.4, -3.6], [-2.2, -5], [2.2, -5], [3.4, -3.8], [3.4, -1.4], [2.2, -0.2], [-3.2, -0.2]]
  ],
  '7': [
    [[-3, 5], [3.4, 5], [0, -5]]
  ],
  '8': [
    [[-2.2, 5], [2.2, 5], [3.4, 3.8], [3.4, 1.4], [2.2, 0], [-2.2, 0], [-3.4, 1.4], [-3.4, 3.8], [-2.2, 5]],
    [[-2.2, 0], [2.2, 0], [3.4, -1.4], [3.4, -3.8], [2.2, -5], [-2.2, -5], [-3.4, -3.8], [-3.4, -1.4], [-2.2, 0]]
  ],
  '9': [
    [[-3.2, -4.2], [-2.2, -5], [2.2, -5], [3.4, -3.6], [3.4, 3.6], [2.2, 5], [-2.2, 5], [-3.4, 3.8], [-3.4, 1.4], [-2.2, 0.2], [3.2, 0.2]]
  ]
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

function getFacetDepth(sphereRadius) {
  return sphereRadius * FACET_DEPTH_FACTOR;
}

function getFacetPlaneOffset(sphereRadius, facetDepth = getFacetDepth(sphereRadius)) {
  return sphereRadius - facetDepth;
}

function getFacetDiameter(sphereRadius, facetDepth = getFacetDepth(sphereRadius)) {
  const planeOffset = getFacetPlaneOffset(sphereRadius, facetDepth);
  return 2 * Math.sqrt(Math.max(0, sphereRadius * sphereRadius - planeOffset * planeOffset));
}

function buildFacetTrimCSG(dir, sphereRadius) {
  const { right, up, forward } = buildFeatureBasis(dir);
  const facetDepth = getFacetDepth(sphereRadius);
  const planeOffset = getFacetPlaneOffset(sphereRadius, facetDepth);
  const halfDepth = sphereRadius * FACET_BOX_HALF_DEPTH_FACTOR;
  const halfExtent = sphereRadius * FACET_BOX_HALF_EXTENT_FACTOR;
  const centreDist = planeOffset + halfDepth;
  const centre = [
    forward[0] * centreDist,
    forward[1] * centreDist,
    forward[2] * centreDist
  ];

  return {
    facetDepth,
    facetDiameter: getFacetDiameter(sphereRadius, facetDepth),
    facetPlaneOffset: planeOffset,
    csg: CSG.fromTriangles(
      buildOrientedBoxTriangles(centre, right, up, forward, halfExtent, halfExtent, halfDepth)
    )
  };
}

function layoutDigits(numberText) {
  if (numberText.length <= 2) return [numberText];
  if (numberText.length <= 4) return splitBalanced(numberText, 2);
  return splitBalanced(numberText, 3);
}

function buildStrokeSegmentCSG(start, end, basis, unitScale, surfaceCentreDist, halfDepth) {
  const startX = start[0] * unitScale;
  const startY = start[1] * unitScale;
  const endX = end[0] * unitScale;
  const endY = end[1] * unitScale;
  const dx = endX - startX;
  const dy = endY - startY;
  const length = Math.sqrt(dx * dx + dy * dy);

  if (length < 1e-6) return CSG.fromPolygons([]);

  const along = vecNormalise(
    basis.right[0] * dx + basis.up[0] * dy,
    basis.right[1] * dx + basis.up[1] * dy,
    basis.right[2] * dx + basis.up[2] * dy
  );
  const across = vecNormalise(
    basis.right[0] * -dy + basis.up[0] * dx,
    basis.right[1] * -dy + basis.up[1] * dx,
    basis.right[2] * -dy + basis.up[2] * dx
  );
  const centre = [
    basis.right[0] * ((startX + endX) / 2) + basis.up[0] * ((startY + endY) / 2) + basis.forward[0] * surfaceCentreDist,
    basis.right[1] * ((startX + endX) / 2) + basis.up[1] * ((startY + endY) / 2) + basis.forward[1] * surfaceCentreDist,
    basis.right[2] * ((startX + endX) / 2) + basis.up[2] * ((startY + endY) / 2) + basis.forward[2] * surfaceCentreDist
  ];

  return CSG.fromTriangles(
    buildOrientedBoxTriangles(
      centre,
      across,
      along,
      basis.forward,
      (DIGIT_STROKE_WIDTH_UNITS * unitScale) / 2,
      length / 2 + (STROKE_LENGTH_BLEED_UNITS * unitScale) / 2,
      halfDepth
    )
  );
}

function buildGlyphStrokeCSG(polylines, offsetXUnits, offsetYUnits, basis, unitScale, surfaceCentreDist, halfDepth) {
  let result = CSG.fromPolygons([]);

  for (const polyline of polylines) {
    for (let index = 0; index < polyline.length - 1; index += 1) {
      const start = [polyline[index][0] + offsetXUnits, polyline[index][1] + offsetYUnits];
      const end = [polyline[index + 1][0] + offsetXUnits, polyline[index + 1][1] + offsetYUnits];
      result = result.union(buildStrokeSegmentCSG(start, end, basis, unitScale, surfaceCentreDist, halfDepth));
    }
  }

  return result;
}

function buildNumberEngravingCSG(numberText, dir, facet) {
  if (!numberText) return CSG.fromPolygons([]);

  const { right, up, forward } = buildFeatureBasis(dir);
  const lines = layoutDigits(numberText);
  const maxWidth = facet.facetDiameter * ENGRAVE_WIDTH_FACTOR;
  const maxHeight = facet.facetDiameter * ENGRAVE_HEIGHT_FACTOR;
  const maxWidthUnits = Math.max(
    ...lines.map(line => line.length * DIGIT_WIDTH_UNITS + Math.max(0, line.length - 1) * DIGIT_SPACING_UNITS)
  );
  const totalHeightUnits = lines.length * DIGIT_HEIGHT_UNITS + Math.max(0, lines.length - 1) * DIGIT_LINE_SPACING_UNITS;
  const unitScale = Math.min(
    maxWidth / Math.max(maxWidthUnits, 1),
    maxHeight / Math.max(totalHeightUnits, 1)
  );
  const surfaceCentreDist = facet.facetPlaneOffset + (ENGRAVE_OUTSIDE_BLEED - ENGRAVE_DEPTH) / 2;
  const halfDepth = (ENGRAVE_OUTSIDE_BLEED + ENGRAVE_DEPTH) / 2;
  const topLineCentreYUnits = totalHeightUnits / 2 - DIGIT_HEIGHT_UNITS / 2;
  const basis = { right, up, forward };
  let result = CSG.fromPolygons([]);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const lineWidthUnits = line.length * DIGIT_WIDTH_UNITS + Math.max(0, line.length - 1) * DIGIT_SPACING_UNITS;
    const firstDigitCentreXUnits = -lineWidthUnits / 2 + DIGIT_WIDTH_UNITS / 2;
    const digitCentreYUnits = topLineCentreYUnits - lineIndex * (DIGIT_HEIGHT_UNITS + DIGIT_LINE_SPACING_UNITS);

    for (let index = 0; index < line.length; index += 1) {
      const digit = line[index];
      const glyphPolylines = VECTOR_DIGIT_GLYPHS[digit];
      if (!glyphPolylines) continue;

      const digitCentreXUnits = firstDigitCentreXUnits + index * (DIGIT_WIDTH_UNITS + DIGIT_SPACING_UNITS);
      result = result.union(
        buildGlyphStrokeCSG(
          glyphPolylines,
          digitCentreXUnits,
          digitCentreYUnits,
          basis,
          unitScale,
          surfaceCentreDist,
          halfDepth
        )
      );
    }
  }

  return result;
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
    const facet = buildFacetTrimCSG(engravingDir, radius);
    csgResult = csgResult.subtract(facet.csg);
    const systemRank = rankMap.get(systemName);
    if (Number.isFinite(systemRank)) {
      csgResult = csgResult.subtract(
        buildNumberEngravingCSG(String(systemRank), engravingDir, facet)
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
