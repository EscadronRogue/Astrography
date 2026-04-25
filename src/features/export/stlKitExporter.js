/**
 * @file 3D-printable STL kit exporter for the True Coordinates map.
 *
 * Produces a ZIP file containing:
 * - stars/  → one STL per star system (sphere with connection holes + engraved rank)
 * - tubes/  → one STL per connection span (flattened-top tube with engraved rank pair)
 * - splitters/  → one STL per merged-hole Y splitter
 *
 * Assembly: regular tubes still slide directly into sphere holes.
 * Where hole bores would overlap, a printed Y splitter plugs into one merged hole.
 *
 * Physical scale:
 *   1 LY  = 5 mm
 *   Standard star diameter = 16 mm
 *   Tube diameter = 4 mm
 */

import { CSG } from '../../vendor/csg.js';
import { getPrimaryClass } from '../../shared/stellarClassUtils.js';
import {
  filterMainStars,
  buildSphereTriangles,
  buildTubeTriangles,
  trianglesToBinarySTL
} from './stlExporter.js';

// ═══════════════════════════════════════════════════════════════════════════
// Physical dimensions (mm)
// ═══════════════════════════════════════════════════════════════════════════

const KIT_MM_PER_LY = 5;

// Stars
const STANDARD_DIAMETER_MM = 16;
const STANDARD_RADIUS = STANDARD_DIAMETER_MM / 2; // 8
const REDUCED_STAR_SCALE = 0.75;
const STANDARD_SIZE_CLASSES = new Set(['O', 'B', 'A', 'F', 'G', 'K']);

// Tubes
const KIT_TUBE_RADIUS = 2; // 4 mm diameter
const KIT_TUBE_SEGMENTS = 24;

// Holes for tube insertion (press-fit)
const HOLE_TOLERANCE = 0.15;
const HOLE_RADIUS = KIT_TUBE_RADIUS + HOLE_TOLERANCE;
const TUBE_INSERTION_DEPTH = 4; // mm into sphere
const HOLE_SEGMENTS = 24;
const MIN_TUBE_LENGTH = 2; // skip connections shorter than this (mm)

// Hole clustering / Y splitters
const HOLE_CLUSTER_MARGIN = 0.35;
const SPLITTER_BRANCH_RADIUS = HOLE_RADIUS + 0.8;
const SPLITTER_HUB_RADIUS = SPLITTER_BRANCH_RADIUS + 0.85;
const SPLITTER_SOCKET_CLEARANCE = 2 * HOLE_RADIUS + 0.35;
const SPLITTER_SOCKET_OFFSET_MIN = 3;
const SPLITTER_SOCKET_OFFSET_MAX = 9;
const SPLITTER_JUNCTION_OFFSET_MIN = 1.8;
const SPLITTER_JUNCTION_OFFSET_FACTOR = 0.55;
const SPLITTER_SPHERE_SEGMENTS = 18;

// Flat-top label on tubes
const TUBE_FACET_TARGET_WIDTH = KIT_TUBE_RADIUS * 1.9;
const TUBE_FACET_END_MARGIN = 1.2;
const TUBE_FACET_MAX_LENGTH = 26;
const LABEL_ENGRAVE_DEPTH = 0.5;
const LABEL_ENGRAVE_BLEED = 0.25;
const LABEL_TEXT_WIDTH_FACTOR = 0.85;
const LABEL_TEXT_HEIGHT_FACTOR = 0.78;

// Star-face engraving
const FACET_DEPTH_FACTOR = 0.3;
const FACET_BOX_HALF_DEPTH_FACTOR = 1.5;
const FACET_BOX_HALF_EXTENT_FACTOR = 2.2;
const STAR_ENGRAVE_DEPTH = 0.5;
const STAR_ENGRAVE_BLEED = 0.25;
const STAR_ENGRAVE_WIDTH_FACTOR = 0.8;
const STAR_ENGRAVE_HEIGHT_FACTOR = 0.72;

// Glyph stroke geometry
const DIGIT_WIDTH_UNITS = 1;
const DIGIT_HEIGHT_UNITS = 1;
const DIGIT_SPACING_UNITS = 0.22;
const DIGIT_LINE_SPACING_UNITS = 0.3;
const STAR_STROKE_WIDTH_UNITS = 0.16;
const LABEL_STROKE_WIDTH_UNITS = 0.28; // thicker for tube labels
const STROKE_SEGMENT_OVERLAP_UNITS = 0.06;

// ═══════════════════════════════════════════════════════════════════════════
// Vector glyph definitions (0-9 and dash)
// ═══════════════════════════════════════════════════════════════════════════

const VECTOR_GLYPHS = {
  '0': [
    [[0.24, 0.02], [0.08, 0.18], [0.08, 0.82], [0.24, 0.98], [0.76, 0.98], [0.92, 0.82], [0.92, 0.18], [0.76, 0.02], [0.24, 0.02]]
  ],
  '1': [
    [[0.3, 0.78], [0.5, 0.98], [0.5, 0.02]],
    [[0.24, 0.02], [0.76, 0.02]]
  ],
  '2': [
    [[0.1, 0.78], [0.24, 0.98], [0.76, 0.98], [0.9, 0.8], [0.9, 0.62], [0.12, 0.02], [0.9, 0.02]]
  ],
  '3': [
    [[0.1, 0.98], [0.78, 0.98], [0.56, 0.56], [0.78, 0.48], [0.92, 0.28], [0.76, 0.02], [0.14, 0.02]]
  ],
  '4': [
    [[0.78, 0.02], [0.78, 0.98]],
    [[0.12, 0.34], [0.9, 0.34]],
    [[0.12, 0.34], [0.58, 0.98]]
  ],
  '5': [
    [[0.9, 0.98], [0.18, 0.98], [0.14, 0.54], [0.72, 0.54], [0.9, 0.38], [0.9, 0.16], [0.72, 0.02], [0.14, 0.02]]
  ],
  '6': [
    [[0.86, 0.84], [0.72, 0.98], [0.24, 0.98], [0.08, 0.8], [0.08, 0.18], [0.24, 0.02], [0.78, 0.02], [0.92, 0.18], [0.92, 0.42], [0.76, 0.56], [0.24, 0.56], [0.08, 0.42]]
  ],
  '7': [
    [[0.08, 0.98], [0.92, 0.98], [0.34, 0.02]]
  ],
  '8': [
    [[0.24, 0.02], [0.08, 0.18], [0.08, 0.4], [0.24, 0.56], [0.76, 0.56], [0.92, 0.4], [0.92, 0.18], [0.76, 0.02], [0.24, 0.02]],
    [[0.24, 0.56], [0.08, 0.72], [0.08, 0.82], [0.24, 0.98], [0.76, 0.98], [0.92, 0.82], [0.92, 0.72], [0.76, 0.56]]
  ],
  '9': [
    [[0.92, 0.56], [0.76, 0.42], [0.24, 0.42], [0.08, 0.58], [0.08, 0.82], [0.24, 0.98], [0.76, 0.98], [0.92, 0.82], [0.92, 0.18], [0.74, 0.02], [0.28, 0.02]]
  ],
  '-': [
    [[0.15, 0.50], [0.85, 0.50]]
  ]
};

// ═══════════════════════════════════════════════════════════════════════════
// Feature-direction candidates (26 directions on the unit cube)
// ═══════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════
// Utility helpers
// ═══════════════════════════════════════════════════════════════════════════

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

function getPrintableRadius(star) {
  const cls = getPrimaryClass(star);
  const multiplier = STANDARD_SIZE_CLASSES.has(cls) ? 1 : REDUCED_STAR_SCALE;
  return STANDARD_RADIUS * multiplier;
}

// ═══════════════════════════════════════════════════════════════════════════
// Vector math
// ═══════════════════════════════════════════════════════════════════════════

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

function vecAdd(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vecSub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vecScale(v, scalar) {
  return [v[0] * scalar, v[1] * scalar, v[2] * scalar];
}

function vecLength(v) {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function vecDistance(a, b) {
  return vecLength(vecSub(a, b));
}

function vecProjectOnPlane(v, normal) {
  return vecSub(v, vecScale(normal, vecDot(v, normal)));
}

// ═══════════════════════════════════════════════════════════════════════════
// Geometry primitives
// ═══════════════════════════════════════════════════════════════════════════

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

function getDirectionChordDistance(directionA, directionB, radius) {
  if (radius <= 0) return 0;
  return radius * vecLength(vecSub(directionA, directionB));
}

function doHoleDirectionsOverlap(directionA, directionB, sphereRadius) {
  const mergeDistance = 2 * HOLE_RADIUS + HOLE_CLUSTER_MARGIN;
  const surfaceDistance = getDirectionChordDistance(directionA, directionB, sphereRadius);
  const innerDistance = getDirectionChordDistance(
    directionA,
    directionB,
    Math.max(0, sphereRadius - TUBE_INSERTION_DEPTH)
  );

  return surfaceDistance < mergeDistance || innerDistance < mergeDistance;
}

function mergeEndpointCluster(endpoints) {
  let sum = [0, 0, 0];
  for (const endpoint of endpoints) {
    sum = vecAdd(sum, endpoint.direction);
  }
  return {
    endpoints,
    direction: vecNormalise(sum[0], sum[1], sum[2])
  };
}

function clusterConnectionEndpoints(endpoints, sphereRadius) {
  const clusters = endpoints.map(endpoint => mergeEndpointCluster([endpoint]));

  let merged = true;
  while (merged) {
    merged = false;

    for (let i = 0; i < clusters.length; i += 1) {
      for (let j = i + 1; j < clusters.length; j += 1) {
        const clusterA = clusters[i];
        const clusterB = clusters[j];
        const memberOverlap = clusterA.endpoints.some(endpointA =>
          clusterB.endpoints.some(endpointB =>
            doHoleDirectionsOverlap(endpointA.direction, endpointB.direction, sphereRadius)
          )
        );
        const mergedCentreOverlap = doHoleDirectionsOverlap(clusterA.direction, clusterB.direction, sphereRadius);

        if (!memberOverlap && !mergedCentreOverlap) continue;

        clusters.splice(j, 1);
        clusters[i] = mergeEndpointCluster(clusterA.endpoints.concat(clusterB.endpoints));
        merged = true;
        break;
      }

      if (merged) break;
    }
  }

  return clusters;
}

function computeSplitterSocketOffset(port, sphereRadius) {
  let socketOffset = SPLITTER_SOCKET_OFFSET_MIN;

  for (let i = 0; i < port.endpoints.length; i += 1) {
    for (let j = i + 1; j < port.endpoints.length; j += 1) {
      const chordFactor = vecLength(vecSub(port.endpoints[i].direction, port.endpoints[j].direction));
      if (chordFactor < 1e-6) continue;
      const requiredOffset = SPLITTER_SOCKET_CLEARANCE / chordFactor - sphereRadius;
      if (requiredOffset > socketOffset) socketOffset = requiredOffset;
    }
  }

  return Math.min(SPLITTER_SOCKET_OFFSET_MAX, Math.max(SPLITTER_SOCKET_OFFSET_MIN, socketOffset));
}

// ═══════════════════════════════════════════════════════════════════════════
// Star engraving (flat facet + rank number on sphere)
// ═══════════════════════════════════════════════════════════════════════════

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

function layoutDigits(text) {
  if (text.length <= 2) return [text];
  if (text.length <= 4) return splitBalanced(text, 2);
  return splitBalanced(text, 3);
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

// ═══════════════════════════════════════════════════════════════════════════
// Shared stroke-rendering primitives
// ═══════════════════════════════════════════════════════════════════════════

function makePointOnFacet(right, up, forward, x, y, forwardOffset) {
  return [
    right[0] * x + up[0] * y + forward[0] * forwardOffset,
    right[1] * x + up[1] * y + forward[1] * forwardOffset,
    right[2] * x + up[2] * y + forward[2] * forwardOffset
  ];
}

function buildStrokeSegmentCSG(startPt, endPt, strokeWidth, right, up, forward, forwardOffset, halfDepth) {
  const dx = endPt[0] - startPt[0];
  const dy = endPt[1] - startPt[1];
  const length = Math.sqrt(dx * dx + dy * dy);
  if (length < 1e-8) return CSG.fromPolygons([]);

  const centre = makePointOnFacet(
    right, up, forward,
    (startPt[0] + endPt[0]) / 2,
    (startPt[1] + endPt[1]) / 2,
    forwardOffset
  );
  const axisAlong = vecNormalise(
    right[0] * dx + up[0] * dy,
    right[1] * dx + up[1] * dy,
    right[2] * dx + up[2] * dy
  );
  const axisAcross = vecNormalise(...vecCross(forward, axisAlong));

  return CSG.fromTriangles(
    buildOrientedBoxTriangles(
      centre,
      axisAlong,
      axisAcross,
      forward,
      length / 2 + strokeWidth * STROKE_SEGMENT_OVERLAP_UNITS,
      strokeWidth / 2,
      halfDepth
    )
  );
}

function buildStrokeNodeCSG(point, strokeWidth, right, up, forward, forwardOffset, halfDepth) {
  const start = makePointOnFacet(right, up, forward, point[0], point[1], forwardOffset - halfDepth);
  const end = makePointOnFacet(right, up, forward, point[0], point[1], forwardOffset + halfDepth);
  return CSG.fromTriangles(
    buildTubeTriangles(
      start[0], start[1], start[2],
      end[0], end[1], end[2],
      strokeWidth / 2,
      12
    )
  );
}

/**
 * Render a line of glyphs into a CSG solid using vector strokes.
 *
 * @param {string}   text            Characters to render (digits + dash).
 * @param {number[]} right           Basis: character-advance direction.
 * @param {number[]} up              Basis: character-height direction.
 * @param {number[]} forward         Basis: depth direction (into/out of surface).
 * @param {number}   surfaceOffset   Distance along forward to the surface.
 * @param {number}   maxWidth        Available width (mm) for the text.
 * @param {number}   maxHeight       Available height (mm) for the text.
 * @param {number}   strokeWidthU    Stroke width in glyph-unit space.
 * @param {number}   engraveDepth    Depth of engraving (mm).
 * @param {number}   engraveBleed    Extra protrusion above surface (mm).
 * @param {string[]} [lines]         Pre-split lines; defaults to single line.
 */
function buildTextCSG(text, right, up, forward, surfaceOffset, maxWidth, maxHeight, strokeWidthU, engraveDepth, engraveBleed, lines) {
  if (!text) return CSG.fromPolygons([]);

  if (!lines) lines = [text];

  const maxWidthUnits = Math.max(
    ...lines.map(line => line.length * DIGIT_WIDTH_UNITS + Math.max(0, line.length - 1) * DIGIT_SPACING_UNITS)
  );
  const totalHeightUnits = lines.length * DIGIT_HEIGHT_UNITS
    + Math.max(0, lines.length - 1) * DIGIT_LINE_SPACING_UNITS;

  const unitScale = Math.min(
    maxWidth / Math.max(maxWidthUnits, 1),
    maxHeight / Math.max(totalHeightUnits, 1)
  );

  const halfDepth = (engraveBleed + engraveDepth) / 2;
  const forwardOffset = surfaceOffset + (engraveBleed - engraveDepth) / 2;
  const strokeWidth = strokeWidthU * unitScale;
  const totalHeightMM = totalHeightUnits * unitScale;
  const topLineCentreY = totalHeightMM / 2 - (DIGIT_HEIGHT_UNITS * unitScale) / 2;

  let result = CSG.fromPolygons([]);

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const lineWidthUnits = line.length * DIGIT_WIDTH_UNITS + Math.max(0, line.length - 1) * DIGIT_SPACING_UNITS;
    const lineWidthMM = lineWidthUnits * unitScale;
    const firstCharCentreX = -lineWidthMM / 2 + (DIGIT_WIDTH_UNITS * unitScale) / 2;
    const charCentreY = topLineCentreY - lineIndex * (DIGIT_HEIGHT_UNITS + DIGIT_LINE_SPACING_UNITS) * unitScale;

    for (let index = 0; index < line.length; index += 1) {
      const ch = line[index];
      const strokes = VECTOR_GLYPHS[ch];
      if (!strokes) continue;

      const charCentreX = firstCharCentreX + index * (DIGIT_WIDTH_UNITS + DIGIT_SPACING_UNITS) * unitScale;
      const charOriginX = charCentreX - (DIGIT_WIDTH_UNITS * unitScale) / 2;
      const charOriginY = charCentreY - (DIGIT_HEIGHT_UNITS * unitScale) / 2;

      for (const stroke of strokes) {
        if (!Array.isArray(stroke) || stroke.length === 0) continue;

        const points = stroke.map(([x, y]) => [
          charOriginX + x * DIGIT_WIDTH_UNITS * unitScale,
          charOriginY + y * DIGIT_HEIGHT_UNITS * unitScale
        ]);

        result = result.union(
          buildStrokeNodeCSG(points[0], strokeWidth, right, up, forward, forwardOffset, halfDepth)
        );

        for (let pi = 1; pi < points.length; pi += 1) {
          result = result.union(
            buildStrokeSegmentCSG(points[pi - 1], points[pi], strokeWidth, right, up, forward, forwardOffset, halfDepth)
          );
          result = result.union(
            buildStrokeNodeCSG(points[pi], strokeWidth, right, up, forward, forwardOffset, halfDepth)
          );
        }
      }
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// Star number engraving (uses multi-line layout for large numbers)
// ═══════════════════════════════════════════════════════════════════════════

function buildStarNumberCSG(numberText, dir, facet) {
  const { right, up, forward } = buildFeatureBasis(dir);
  const lines = layoutDigits(numberText);
  const maxWidth = facet.facetDiameter * STAR_ENGRAVE_WIDTH_FACTOR;
  const maxHeight = facet.facetDiameter * STAR_ENGRAVE_HEIGHT_FACTOR;

  return buildTextCSG(
    numberText, right, up, forward,
    facet.facetPlaneOffset, maxWidth, maxHeight,
    STAR_STROKE_WIDTH_UNITS, STAR_ENGRAVE_DEPTH, STAR_ENGRAVE_BLEED,
    lines
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Hole subtraction (cylindrical bore for tube insertion)
// ═══════════════════════════════════════════════════════════════════════════

function buildHoleCSG(direction, openingDistance) {
  const [nx, ny, nz] = direction;
  // Cylinder extends from slightly outside the opening to TUBE_INSERTION_DEPTH inside
  const outerDist = openingDistance + 1;
  const innerDist = openingDistance - TUBE_INSERTION_DEPTH;
  const start = [nx * outerDist, ny * outerDist, nz * outerDist];
  const end = [nx * innerDist, ny * innerDist, nz * innerDist];

  return CSG.fromTriangles(
    buildTubeTriangles(
      start[0], start[1], start[2],
      end[0], end[1], end[2],
      HOLE_RADIUS,
      HOLE_SEGMENTS
    )
  );
}

function getEndpointReceptacle(endpoint, sphereRadius) {
  const usesSplitter = endpoint.port && endpoint.port.endpoints.length > 1;
  const openingDistance = usesSplitter ? sphereRadius + endpoint.port.socketOffset : sphereRadius;

  return {
    axis: endpoint.direction,
    openingCenter: vecScale(endpoint.direction, openingDistance)
  };
}

function buildPortSplitterCSG(port, sphereRadius) {
  const trunkStart = vecScale(port.direction, Math.max(0.2, sphereRadius - TUBE_INSERTION_DEPTH));
  const junctionPoint = vecScale(port.direction, sphereRadius + port.junctionOffset);

  let csg = CSG.fromTriangles(
    buildTubeTriangles(
      trunkStart[0], trunkStart[1], trunkStart[2],
      junctionPoint[0], junctionPoint[1], junctionPoint[2],
      KIT_TUBE_RADIUS,
      KIT_TUBE_SEGMENTS
    )
  );

  csg = csg.union(CSG.fromTriangles(
    buildSphereTriangles(
      junctionPoint[0], junctionPoint[1], junctionPoint[2],
      SPLITTER_HUB_RADIUS,
      SPLITTER_SPHERE_SEGMENTS,
      SPLITTER_SPHERE_SEGMENTS
    )
  ));

  for (const endpoint of port.endpoints) {
    const receptacle = getEndpointReceptacle(endpoint, sphereRadius);

    csg = csg.union(CSG.fromTriangles(
      buildTubeTriangles(
        junctionPoint[0], junctionPoint[1], junctionPoint[2],
        receptacle.openingCenter[0], receptacle.openingCenter[1], receptacle.openingCenter[2],
        SPLITTER_BRANCH_RADIUS,
        KIT_TUBE_SEGMENTS
      )
    ));

    csg = csg.union(CSG.fromTriangles(
      buildSphereTriangles(
        receptacle.openingCenter[0], receptacle.openingCenter[1], receptacle.openingCenter[2],
        SPLITTER_BRANCH_RADIUS,
        SPLITTER_SPHERE_SEGMENTS,
        SPLITTER_SPHERE_SEGMENTS
      )
    ));
  }

  for (const endpoint of port.endpoints) {
    csg = csg.subtract(buildHoleCSG(endpoint.direction, sphereRadius + port.socketOffset));
  }

  return csg;
}

// ═══════════════════════════════════════════════════════════════════════════
// Tube flat-top label (integrated milled facet + engraved text)
// ═══════════════════════════════════════════════════════════════════════════

function getTubeFacetWidth() {
  return Math.min(TUBE_FACET_TARGET_WIDTH, KIT_TUBE_RADIUS * 2 - 0.12);
}

function getTubeFacetPlaneOffset(facetWidth = getTubeFacetWidth()) {
  const halfWidth = facetWidth / 2;
  return Math.sqrt(Math.max(0, KIT_TUBE_RADIUS * KIT_TUBE_RADIUS - halfWidth * halfWidth));
}

function getTextBlockUnitScale(lines, maxWidth, maxHeight) {
  const maxWidthUnits = Math.max(
    ...lines.map(line => line.length * DIGIT_WIDTH_UNITS + Math.max(0, line.length - 1) * DIGIT_SPACING_UNITS),
    1
  );
  const totalHeightUnits = lines.length * DIGIT_HEIGHT_UNITS
    + Math.max(0, lines.length - 1) * DIGIT_LINE_SPACING_UNITS;

  return Math.min(
    maxWidth / maxWidthUnits,
    maxHeight / Math.max(totalHeightUnits, 1)
  );
}

function getTubeLabelLineCandidates(text) {
  const seen = new Set();
  const candidates = [];

  for (let parts = 1; parts <= Math.min(4, Math.max(1, text.length)); parts += 1) {
    const lines = parts === 1 ? [text] : splitBalanced(text, parts);
    const key = lines.join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(lines);
  }

  return candidates;
}

function computeTubeLabelLayout(text, tubeLength) {
  const facetLength = Math.min(TUBE_FACET_MAX_LENGTH, tubeLength - 2 * TUBE_FACET_END_MARGIN);
  if (facetLength < 4) return null;

  const facetWidth = getTubeFacetWidth();
  const maxWidth = facetLength * LABEL_TEXT_WIDTH_FACTOR;
  const maxHeight = facetWidth * LABEL_TEXT_HEIGHT_FACTOR;

  let bestLines = null;
  let bestScale = -Infinity;

  for (const lines of getTubeLabelLineCandidates(text)) {
    const unitScale = getTextBlockUnitScale(lines, maxWidth, maxHeight);
    if (unitScale > bestScale) {
      bestScale = unitScale;
      bestLines = lines;
    }
  }

  return {
    facetLength,
    facetWidth,
    facetPlaneOffset: getTubeFacetPlaneOffset(facetWidth),
    lines: bestLines
  };
}

function buildTubeFacetTrimCSG(facetLength, facetWidth) {
  const planeOffset = getTubeFacetPlaneOffset(facetWidth);
  const halfDepth = KIT_TUBE_RADIUS * 2;
  const halfAcross = KIT_TUBE_RADIUS * 2;

  return {
    facetPlaneOffset: planeOffset,
    csg: CSG.fromTriangles(
      buildOrientedBoxTriangles(
        [0, 0, planeOffset + halfDepth],
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
        facetLength / 2,
        halfAcross,
        halfDepth
      )
    )
  };
}

function buildLabelTextCSG(text, layout) {
  const maxWidth = layout.facetLength * LABEL_TEXT_WIDTH_FACTOR;
  const maxHeight = layout.facetWidth * LABEL_TEXT_HEIGHT_FACTOR;

  return buildTextCSG(
    text,
    [1, 0, 0], // right
    [0, 1, 0], // up
    [0, 0, 1], // forward
    layout.facetPlaneOffset,
    maxWidth,
    maxHeight,
    LABEL_STROKE_WIDTH_UNITS,
    LABEL_ENGRAVE_DEPTH,
    LABEL_ENGRAVE_BLEED,
    layout.lines
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Orientation and build-plate helpers
// ═══════════════════════════════════════════════════════════════════════════

function rotatePointIntoBasis(point, basis) {
  return [
    vecDot(point, basis.right),
    vecDot(point, basis.up),
    vecDot(point, basis.forward)
  ];
}

function rotatePointIntoAxes(point, axes) {
  return [
    vecDot(point, axes.x),
    vecDot(point, axes.y),
    vecDot(point, axes.z)
  ];
}

function buildPrimaryAxes(primary, hintVectors = []) {
  let yAxis = null;

  for (const hint of hintVectors) {
    const projected = vecProjectOnPlane(hint, primary);
    if (vecLength(projected) > 1e-5) {
      yAxis = vecNormalise(projected[0], projected[1], projected[2]);
      break;
    }
  }

  if (!yAxis) {
    const fallback = Math.abs(primary[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const projectedFallback = vecProjectOnPlane(fallback, primary);
    yAxis = vecNormalise(projectedFallback[0], projectedFallback[1], projectedFallback[2]);
  }

  let zAxis = vecCross(primary, yAxis);
  zAxis = vecNormalise(zAxis[0], zAxis[1], zAxis[2]);
  yAxis = vecCross(zAxis, primary);
  yAxis = vecNormalise(yAxis[0], yAxis[1], yAxis[2]);

  return { x: primary, y: yAxis, z: zAxis };
}

function placeTrianglesOnBuildPlate(triangles) {
  let minZ = Infinity;
  for (const tri of triangles) {
    minZ = Math.min(minZ, tri.a[2], tri.b[2], tri.c[2]);
  }
  if (!Number.isFinite(minZ)) return triangles;

  const zOffset = -minZ;
  return triangles.map(tri => ({
    a: [tri.a[0], tri.a[1], tri.a[2] + zOffset],
    b: [tri.b[0], tri.b[1], tri.b[2] + zOffset],
    c: [tri.c[0], tri.c[1], tri.c[2] + zOffset]
  }));
}

/**
 * Rotate a star so the engraved facet faces +Z, then place on build plate.
 */
function orientStarForPrint(triangles, faceDirection) {
  const basis = buildFeatureBasis(faceDirection);
  const rotated = triangles.map(tri => ({
    a: rotatePointIntoBasis(tri.a, basis),
    b: rotatePointIntoBasis(tri.b, basis),
    c: rotatePointIntoBasis(tri.c, basis)
  }));
  return placeTrianglesOnBuildPlate(rotated);
}

function orientSplitterForPrint(triangles, port) {
  const hintVectors = port.endpoints.map(endpoint => vecProjectOnPlane(endpoint.direction, port.direction));
  const axes = buildPrimaryAxes(port.direction, hintVectors);
  const rotated = triangles.map(tri => ({
    a: rotatePointIntoAxes(tri.a, axes),
    b: rotatePointIntoAxes(tri.b, axes),
    c: rotatePointIntoAxes(tri.c, axes)
  }));
  return placeTrianglesOnBuildPlate(rotated);
}

// ═══════════════════════════════════════════════════════════════════════════
// System rank map
// ═══════════════════════════════════════════════════════════════════════════

function buildSystemRankMap(sourceStars) {
  const rankedStars = filterMainStars(Array.isArray(sourceStars) ? sourceStars : [])
    .slice()
    .sort((a, b) => {
      const dd = getRankingDistance(a) - getRankingDistance(b);
      if (dd !== 0) return dd;
      return getSystemName(a).localeCompare(getSystemName(b));
    });

  const rankMap = new Map();
  rankedStars.forEach((star, index) => {
    rankMap.set(getSystemName(star), index + 1);
  });
  return rankMap;
}

// ═══════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Export a 3D-printable kit as a ZIP of individual STL files.
 *
 * The ZIP contains:
 *   stars/   – one STL per system (sphere with holes + engraved rank)
 *   tubes/   – one STL per connection span (flattened-top tube with engraved rank pair)
 *   splitters/  – one STL per merged-hole Y splitter
 *
 * @param {Array}  stars       Currently filtered/displayed stars.
 * @param {Array}  connections Current connection pairs.
 * @param {Object} [options]
 * @param {Array}  [options.allStars] Full heliocentric dataset for global numbering.
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

  // ── Build system info ────────────────────────────────────────────────
  const mainStars = filterMainStars(stars);
  const rankMap = buildSystemRankMap(options.allStars?.length ? options.allStars : stars);
  const systemInfo = new Map();

  for (const star of mainStars) {
    if (!star.truePosition) continue;
    const systemName = getSystemName(star);
    systemInfo.set(systemName, {
      star,
      radius: getPrintableRadius(star),
      rank: rankMap.get(systemName),
      posMM: {
        x: star.truePosition.x * KIT_MM_PER_LY,
        y: star.truePosition.y * KIT_MM_PER_LY,
        z: star.truePosition.z * KIT_MM_PER_LY
      }
    });
  }

  // ── Build all connection pairs ───────────────────────────────────────
  const allConnections = [];
  const systemEndpointMap = new Map();

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

      const dirAtoB = vecNormalise(dx, dy, dz);
      const dirBtoA = [-dirAtoB[0], -dirAtoB[1], -dirAtoB[2]];
      const connection = {
        id: pairKey,
        sysA,
        sysB,
        distance
      };

      connection.endpointA = {
        connection,
        systemName: sysA,
        otherSystem: sysB,
        direction: dirAtoB,
        port: null
      };
      connection.endpointB = {
        connection,
        systemName: sysB,
        otherSystem: sysA,
        direction: dirBtoA,
        port: null
      };

      allConnections.push(connection);

      if (!systemEndpointMap.has(sysA)) systemEndpointMap.set(sysA, []);
      if (!systemEndpointMap.has(sysB)) systemEndpointMap.set(sysB, []);
      systemEndpointMap.get(sysA).push(connection.endpointA);
      systemEndpointMap.get(sysB).push(connection.endpointB);
    }
  }

  // ── Build ZIP ────────────────────────────────────────────────────────
  const systemPortMap = new Map();
  for (const [systemName, info] of systemInfo) {
    const endpoints = systemEndpointMap.get(systemName) || [];
    const ports = clusterConnectionEndpoints(endpoints, info.radius).map((cluster, index) => {
      const usesSplitter = cluster.endpoints.length > 1;
      const port = {
        id: `${systemName}:${index}`,
        systemName,
        direction: cluster.direction,
        endpoints: cluster.endpoints,
        socketOffset: usesSplitter ? computeSplitterSocketOffset(cluster, info.radius) : 0,
        junctionOffset: 0
      };

      if (usesSplitter) {
        port.junctionOffset = Math.max(
          SPLITTER_JUNCTION_OFFSET_MIN,
          port.socketOffset * SPLITTER_JUNCTION_OFFSET_FACTOR
        );
      }

      for (const endpoint of cluster.endpoints) {
        endpoint.port = port;
      }

      return port;
    });

    systemPortMap.set(systemName, ports);
  }

  const zip = new JSZip();
  const starsFolder = zip.folder('stars');
  const tubesFolder = zip.folder('tubes');
  const splittersFolder = zip.folder('splitters');

  const maxRank = Math.max(rankMap.size, systemInfo.size, 1);
  const padDigits = String(maxRank).length;
  const padRank = (r) => String(r).padStart(padDigits, '0');

  let starCount = 0;
  let tubeCount = 0;
  let splitterCount = 0;

  // ── Stars ────────────────────────────────────────────────────────────
  for (const [systemName, info] of systemInfo) {
    const radius = info.radius;
    const ports = systemPortMap.get(systemName) || [];
    const holeDirs = ports.map(port => port.direction);

    // Find best direction for engraved rank number (away from holes)
    const engravingDir = findFeatureDirection(holeDirs);

    // Build sphere
    let csg = CSG.fromTriangles(buildSphereTriangles(0, 0, 0, radius, 32, 32));

    // Cut flat facet for engraved number
    const facet = buildFacetTrimCSG(engravingDir, radius);
    csg = csg.subtract(facet.csg);

    // Engrave rank number
    if (Number.isFinite(info.rank)) {
      const engravingCSG = buildStarNumberCSG(String(info.rank), engravingDir, facet);
      csg = csg.subtract(engravingCSG);
    }

    // Subtract one hole per resolved port
    for (const port of ports) {
      csg = csg.subtract(buildHoleCSG(port.direction, radius));
    }

    // Orient for print (engraved face up) and place on build plate
    const triangles = orientStarForPrint(csg.toTriangles(), engravingDir);
    const stlBuffer = trianglesToBinarySTL(triangles);

    const rankStr = Number.isFinite(info.rank) ? padRank(info.rank) : '00';
    starsFolder.file(`${rankStr}_${sanitizeFilename(systemName)}.stl`, stlBuffer);
    starCount += 1;
  }

  // ── Splitters ────────────────────────────────────────────────────────
  for (const [systemName, info] of systemInfo) {
    const ports = systemPortMap.get(systemName) || [];
    const rankStr = Number.isFinite(info.rank) ? padRank(info.rank) : '00';

    for (const port of ports) {
      if (port.endpoints.length < 2) continue;

      const splitterCSG = buildPortSplitterCSG(port, info.radius);
      const triangles = orientSplitterForPrint(splitterCSG.toTriangles(), port);
      const stlBuffer = trianglesToBinarySTL(triangles);

      const branchRanks = port.endpoints
        .map(endpoint => rankMap.get(endpoint.otherSystem))
        .filter(rank => Number.isFinite(rank))
        .sort((a, b) => a - b)
        .map(rank => padRank(rank));
      const branchNameFallback = port.endpoints
        .map(endpoint => sanitizeFilename(endpoint.otherSystem))
        .sort()
        .join('_');
      const targetSuffix = branchRanks.length ? branchRanks.join('-') : (branchNameFallback || 'shared');

      splittersFolder.file(
        `${rankStr}_${sanitizeFilename(systemName)}__to_${targetSuffix}.stl`,
        stlBuffer
      );
      splitterCount += 1;
    }
  }

  // ── Tubes ────────────────────────────────────────────────────────────
  for (const conn of allConnections) {
    const infoA = systemInfo.get(conn.sysA);
    const infoB = systemInfo.get(conn.sysB);
    if (!infoA || !infoB) continue;
    const rankA = infoA.rank;
    const rankB = infoB.rank;

    // Skip if either star has no rank (not in the global dataset)
    if (!Number.isFinite(rankA) || !Number.isFinite(rankB)) continue;

    // Label text: lower rank first (e.g. "1-2", "4-17")
    const labelRankA = Math.min(rankA, rankB);
    const labelRankB = Math.max(rankA, rankB);
    const labelText = `${labelRankA}-${labelRankB}`;

    const receptacleA = getEndpointReceptacle(conn.endpointA, infoA.radius);
    const receptacleB = getEndpointReceptacle(conn.endpointB, infoB.radius);
    const start = vecSub(receptacleA.openingCenter, vecScale(receptacleA.axis, TUBE_INSERTION_DEPTH));
    const end = vecSub(receptacleB.openingCenter, vecScale(receptacleB.axis, TUBE_INSERTION_DEPTH));
    const tubeLength = vecDistance(start, end);
    if (tubeLength < MIN_TUBE_LENGTH) continue;
    const halfLen = tubeLength / 2;

    // Build tube in canonical orientation: along X, centred at origin
    let csg = CSG.fromTriangles(
      buildTubeTriangles(-halfLen, 0, 0, halfLen, 0, 0, KIT_TUBE_RADIUS, KIT_TUBE_SEGMENTS)
    );

    // Cut an integrated facet into the tube, then engrave the label inside it
    const layout = computeTubeLabelLayout(labelText, tubeLength);
    if (layout) {
      const facet = buildTubeFacetTrimCSG(layout.facetLength, layout.facetWidth);
      csg = csg.subtract(facet.csg);
      const textCSG = buildLabelTextCSG(labelText, layout);
      csg = csg.subtract(textCSG);
    }

    // Already in print orientation (tube along X, label faces +Z up)
    const triangles = placeTrianglesOnBuildPlate(csg.toTriangles());
    const stlBuffer = trianglesToBinarySTL(triangles);

    const fileRankA = padRank(labelRankA);
    const fileRankB = padRank(labelRankB);
    tubesFolder.file(`${fileRankA}-${fileRankB}.stl`, stlBuffer);
    tubeCount += 1;
  }

  // ── Download ─────────────────────────────────────────────────────────
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'star_map_3d_print_kit.zip';
  link.click();
  URL.revokeObjectURL(url);

  console.log(
    `3D-print kit exported – ${starCount} stars, ${tubeCount} tubes, ${splitterCount} splitters ` +
    `(scale: 1 LY = ${KIT_MM_PER_LY} mm, star ⌀ ${STANDARD_DIAMETER_MM} mm, tube ⌀ ${KIT_TUBE_RADIUS * 2} mm).`
  );
}
