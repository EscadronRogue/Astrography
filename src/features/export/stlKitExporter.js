/**
 * @file 3D-printable STL kit exporter for the True Coordinates map.
 *
 * Produces a ZIP file containing:
 * - stars/  → one STL per star system (sphere with connection holes + engraved rank)
 * - tubes/  → branchable tube parts, including Y pieces where star holes merge
 *
 * Assembly: tubes slide directly into the matching holes in star spheres.
 * No separate joints or connectors.
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

// Flattened crown and label on tubes
const TUBE_FLAT_WIDTH = 3.6;      // mm chord width of the shaved top
const TUBE_FLAT_END_MARGIN = 1.2; // keep rounded ends so the crown feels carved, not stitched on
const LABEL_ENGRAVE_DEPTH = 0.5;
const LABEL_ENGRAVE_BLEED = 0.25;
const LABEL_TEXT_WIDTH_FACTOR = 0.85;
const LABEL_TEXT_HEIGHT_FACTOR = 0.78;

// Overlapping-hole merge / external Y splitters
const HOLE_CLUSTER_CLEARANCE = 0.4;
const Y_JUNCTION_OUTSIDE = 4.5;      // mm outside the sphere surface for a usable trunk
const BRANCH_NODE_RADIUS = KIT_TUBE_RADIUS + 0.25;

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
  return vecLength([a[0] - b[0], a[1] - b[1], a[2] - b[2]]);
}

function unionAllCSG(solids) {
  if (!Array.isArray(solids) || solids.length === 0) return CSG.fromPolygons([]);
  let result = solids[0];
  for (let i = 1; i < solids.length; i += 1) {
    result = result.union(solids[i]);
  }
  return result;
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

function buildNodeSphereCSG(centre, radius, widthSegs = 20, heightSegs = 20) {
  return CSG.fromTriangles(
    buildSphereTriangles(centre[0], centre[1], centre[2], radius, widthSegs, heightSegs)
  );
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

function buildHoleCSG(direction, innerDist, outerDist) {
  const [nx, ny, nz] = direction;
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

// ═══════════════════════════════════════════════════════════════════════════
// Tube flattened crown + engraved text
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Compute the shaved-flat crown geometry for a tube.
 */
function getTubeFlatLayout(tubeLength) {
  const flatWidth = Math.min(TUBE_FLAT_WIDTH, KIT_TUBE_RADIUS * 2 - 0.15);
  const flatLength = Math.max(0, tubeLength - 2 * TUBE_FLAT_END_MARGIN);
  if (flatLength < 2.5) return null;

  return {
    flatLength,
    flatWidth,
    surfaceZ: Math.sqrt(Math.max(0, KIT_TUBE_RADIUS * KIT_TUBE_RADIUS - (flatWidth * flatWidth) / 4))
  };
}

/**
 * Compute label layout for a tube crown. Returns null if the tube is too short
 * for any label.
 */
function computeLabelLayout(text, flatLayout) {
  if (!flatLayout) return null;

  const availableWidth = flatLayout.flatLength * LABEL_TEXT_WIDTH_FACTOR;
  const availableHeight = flatLayout.flatWidth * LABEL_TEXT_HEIGHT_FACTOR;
  const candidateLines = [[text]];

  if (text.length > 1) {
    candidateLines.push(text.split('').map(ch => ch));
  }

  for (const lines of candidateLines) {
    const maxWidthUnits = Math.max(
      ...lines.map(line => line.length * DIGIT_WIDTH_UNITS + Math.max(0, line.length - 1) * DIGIT_SPACING_UNITS)
    );
    const totalHeightUnits = lines.length * DIGIT_HEIGHT_UNITS
      + Math.max(0, lines.length - 1) * DIGIT_LINE_SPACING_UNITS;
    const unitScale = Math.min(
      availableWidth / Math.max(maxWidthUnits, 1),
      availableHeight / Math.max(totalHeightUnits, 1)
    );

    if (Number.isFinite(unitScale) && unitScale > 0) {
      return { ...flatLayout, lines };
    }
  }

  return null;
}

/**
 * Build the flat trim cutter in canonical tube orientation (tube along X).
 */
function buildTubeFlatTrimCSG(layout) {
  const halfLen = layout.flatLength / 2;
  const halfWidth = KIT_TUBE_RADIUS + 1.5;
  const halfZ = KIT_TUBE_RADIUS + 2;
  const centreZ = layout.surfaceZ + halfZ;

  return CSG.fromTriangles(
    buildOrientedBoxTriangles(
      [0, 0, centreZ],
      [1, 0, 0], // along tube
      [0, 1, 0], // across tube
      [0, 0, 1], // up
      halfLen,
      halfWidth,
      halfZ
    )
  );
}

/**
 * Build engraved label text CSG in canonical tube orientation.
 * Text runs along X, character height along Y, engrave depth along -Z.
 */
function buildLabelTextCSG(text, layout) {
  const maxWidth = layout.flatLength * LABEL_TEXT_WIDTH_FACTOR;
  const maxHeight = layout.flatWidth * LABEL_TEXT_HEIGHT_FACTOR;

  return buildTextCSG(
    text,
    [1, 0, 0], // right
    [0, 1, 0], // up
    [0, 0, 1], // forward
    layout.surfaceZ,
    maxWidth,
    maxHeight,
    LABEL_STROKE_WIDTH_UNITS,
    LABEL_ENGRAVE_DEPTH,
    LABEL_ENGRAVE_BLEED,
    layout.lines
  );
}

function clusterHoleEndpoints(endpoints, sphereRadius) {
  if (!Array.isArray(endpoints) || endpoints.length === 0) return [];

  const visited = new Array(endpoints.length).fill(false);
  const overlapLimit = 2 * HOLE_RADIUS + HOLE_CLUSTER_CLEARANCE;
  const clusters = [];

  for (let startIndex = 0; startIndex < endpoints.length; startIndex += 1) {
    if (visited[startIndex]) continue;

    const stack = [startIndex];
    visited[startIndex] = true;
    const members = [];

    while (stack.length) {
      const index = stack.pop();
      const entry = endpoints[index];
      members.push(entry);

      for (let otherIndex = 0; otherIndex < endpoints.length; otherIndex += 1) {
        if (visited[otherIndex]) continue;

        const other = endpoints[otherIndex];
        const centreA = vecScale(entry.dir, sphereRadius);
        const centreB = vecScale(other.dir, sphereRadius);
        if (vecDistance(centreA, centreB) >= overlapLimit) continue;

        visited[otherIndex] = true;
        stack.push(otherIndex);
      }
    }

    clusters.push(members);
  }

  return clusters;
}

function getClusterMergedDirection(cluster) {
  let sx = 0;
  let sy = 0;
  let sz = 0;

  for (const member of cluster) {
    sx += member.dir[0];
    sy += member.dir[1];
    sz += member.dir[2];
  }

  return vecNormalise(sx, sy, sz);
}

function buildSystemSocketPlan(systemName, endpoints, sphereRadius) {
  const connectionClusters = new Map();
  const openingDirections = [];
  const negativeSolids = [];
  const clusters = [];

  const groupedClusters = clusterHoleEndpoints(endpoints, sphereRadius);
  for (let index = 0; index < groupedClusters.length; index += 1) {
    const cluster = groupedClusters[index];
    const merged = cluster.length > 1;
    const holeDir = merged ? getClusterMergedDirection(cluster) : cluster[0].dir;
    const anchorLocal = vecScale(holeDir, sphereRadius - TUBE_INSERTION_DEPTH);
    const pieceLocal = merged
      ? vecScale(holeDir, sphereRadius + Y_JUNCTION_OUTSIDE)
      : anchorLocal;
    const clusterId = `${sanitizeFilename(systemName)}__${index}`;
    const connectionIds = [];

    openingDirections.push(holeDir);
    negativeSolids.push(
      buildHoleCSG(holeDir, sphereRadius - TUBE_INSERTION_DEPTH, sphereRadius + 1)
    );

    for (const member of cluster) {
      connectionClusters.set(member.connectionId, clusterId);
      connectionIds.push(member.connectionId);
    }

    clusters.push({
      id: clusterId,
      systemName,
      merged,
      holeDir,
      anchorLocal,
      pieceLocal,
      connectionIds
    });
  }

  return { connectionClusters, clusters, openingDirections, negativeSolids };
}

function buildEndpointMap(connections) {
  const endpointMap = new Map();

  for (const conn of connections) {
    if (!endpointMap.has(conn.sysA)) endpointMap.set(conn.sysA, []);
    if (!endpointMap.has(conn.sysB)) endpointMap.set(conn.sysB, []);
    endpointMap.get(conn.sysA).push({ connectionId: conn.id, dir: conn.dirA, otherSystem: conn.sysB });
    endpointMap.get(conn.sysB).push({ connectionId: conn.id, dir: conn.dirB, otherSystem: conn.sysA });
  }

  return endpointMap;
}

function buildSystemSocketPlans(systemInfo, connections) {
  const endpointMap = buildEndpointMap(connections);
  const plans = new Map();

  for (const [systemName, info] of systemInfo) {
    plans.set(
      systemName,
      buildSystemSocketPlan(systemName, endpointMap.get(systemName) || [], info.radius)
    );
  }

  return plans;
}

function toWorldPoint(info, localPoint) {
  return [
    info.posMM.x + localPoint[0],
    info.posMM.y + localPoint[1],
    info.posMM.z + localPoint[2]
  ];
}

function buildClusterWorldMap(systemInfo, socketPlans) {
  const clusterMap = new Map();

  for (const [systemName, plan] of socketPlans) {
    const info = systemInfo.get(systemName);
    if (!info) continue;

    for (const cluster of plan.clusters) {
      clusterMap.set(cluster.id, {
        ...cluster,
        rank: info.rank,
        anchorWorld: toWorldPoint(info, cluster.anchorLocal),
        pieceWorld: toWorldPoint(info, cluster.pieceLocal)
      });
    }
  }

  return clusterMap;
}

function buildTubeComponents(systemInfo, socketPlans, connections) {
  const clusterMap = buildClusterWorldMap(systemInfo, socketPlans);
  const edges = [];
  const adjacency = new Map();

  const touch = (clusterId, edgeIndex) => {
    let bucket = adjacency.get(clusterId);
    if (!bucket) {
      bucket = [];
      adjacency.set(clusterId, bucket);
    }
    bucket.push(edgeIndex);
  };

  for (const conn of connections) {
    const planA = socketPlans.get(conn.sysA);
    const planB = socketPlans.get(conn.sysB);
    const clusterIdA = planA?.connectionClusters.get(conn.id);
    const clusterIdB = planB?.connectionClusters.get(conn.id);
    if (!clusterIdA || !clusterIdB) continue;

    const clusterA = clusterMap.get(clusterIdA);
    const clusterB = clusterMap.get(clusterIdB);
    if (!clusterA || !clusterB) continue;

    const edgeIndex = edges.length;
    edges.push({
      id: conn.id,
      clusterIdA,
      clusterIdB,
      pointA: clusterA.pieceWorld,
      pointB: clusterB.pieceWorld
    });
    touch(clusterIdA, edgeIndex);
    touch(clusterIdB, edgeIndex);
  }

  const visited = new Set();
  const components = [];

  for (const startClusterId of adjacency.keys()) {
    if (visited.has(startClusterId)) continue;

    const queue = [startClusterId];
    visited.add(startClusterId);
    const clusterIds = new Set();
    const edgeIndexes = new Set();

    while (queue.length) {
      const clusterId = queue.shift();
      clusterIds.add(clusterId);

      for (const edgeIndex of adjacency.get(clusterId) || []) {
        edgeIndexes.add(edgeIndex);
        const edge = edges[edgeIndex];
        const otherId = edge.clusterIdA === clusterId ? edge.clusterIdB : edge.clusterIdA;
        if (!visited.has(otherId)) {
          visited.add(otherId);
          queue.push(otherId);
        }
      }
    }

    const componentClusters = Array.from(clusterIds)
      .map(clusterId => clusterMap.get(clusterId))
      .filter(Boolean);
    const componentEdges = Array.from(edgeIndexes).map(index => edges[index]);

    if (componentClusters.length && componentEdges.length) {
      components.push({
        clusters: componentClusters,
        edges: componentEdges,
        clusterMap: new Map(componentClusters.map(cluster => [cluster.id, cluster]))
      });
    }
  }

  return components;
}

function getSegmentLength(segment) {
  return vecDistance(segment.start, segment.end);
}

function chooseComponentLabelSegment(component) {
  const trunkSegments = component.clusters
    .filter(cluster => cluster.merged)
    .map(cluster => ({
      type: 'trunk',
      clusterId: cluster.id,
      start: cluster.anchorWorld,
      end: cluster.pieceWorld
    }))
    .sort((left, right) => getSegmentLength(right) - getSegmentLength(left));

  if (trunkSegments.length) return trunkSegments[0];

  const edge = component.edges
    .slice()
    .sort((left, right) => vecDistance(right.pointA, right.pointB) - vecDistance(left.pointA, left.pointB))[0];

  return edge
    ? { type: 'edge', edgeId: edge.id, start: edge.pointA, end: edge.pointB }
    : null;
}

function chooseComponentReference(component, labelSegment, axis) {
  if (labelSegment?.type === 'trunk') {
    for (const edge of component.edges) {
      if (edge.clusterIdA !== labelSegment.clusterId && edge.clusterIdB !== labelSegment.clusterId) continue;
      const junction = component.clusterMap.get(labelSegment.clusterId)?.pieceWorld;
      const other = edge.clusterIdA === labelSegment.clusterId ? edge.pointB : edge.pointA;
      const candidate = vecSub(other, junction);
      if (vecLength(vecCross(axis, candidate)) > 1e-5) return candidate;
    }
  }

  for (const edge of component.edges) {
    const candidate = vecSub(edge.pointB, edge.pointA);
    if (vecLength(vecCross(axis, candidate)) > 1e-5) return candidate;
  }

  return Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1];
}

function buildComponentBasis(component, labelSegment) {
  const axis = vecNormalise(...vecSub(labelSegment.end, labelSegment.start));
  const reference = chooseComponentReference(component, labelSegment, axis);
  let forward = vecCross(axis, reference);

  if (vecLength(forward) < 1e-5) {
    forward = vecCross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1]);
  }

  const basisForward = vecNormalise(...forward);
  const basisUp = vecNormalise(...vecCross(basisForward, axis));

  return {
    origin: [
      (labelSegment.start[0] + labelSegment.end[0]) / 2,
      (labelSegment.start[1] + labelSegment.end[1]) / 2,
      (labelSegment.start[2] + labelSegment.end[2]) / 2
    ],
    right: axis,
    up: basisUp,
    forward: basisForward
  };
}

function transformPointToBasis(point, basis) {
  const relative = vecSub(point, basis.origin);
  return [
    vecDot(relative, basis.right),
    vecDot(relative, basis.up),
    vecDot(relative, basis.forward)
  ];
}

function buildTubeComponentCSG(component) {
  const labelSegment = chooseComponentLabelSegment(component);
  if (!labelSegment) return null;

  const basis = buildComponentBasis(component, labelSegment);
  const solids = [];

  for (const edge of component.edges) {
    const start = transformPointToBasis(edge.pointA, basis);
    const end = transformPointToBasis(edge.pointB, basis);
    solids.push(
      CSG.fromTriangles(
        buildTubeTriangles(
          start[0], start[1], start[2],
          end[0], end[1], end[2],
          KIT_TUBE_RADIUS,
          KIT_TUBE_SEGMENTS
        )
      )
    );
  }

  for (const cluster of component.clusters) {
    if (!cluster.merged) continue;

    const anchor = transformPointToBasis(cluster.anchorWorld, basis);
    const piece = transformPointToBasis(cluster.pieceWorld, basis);
    solids.push(
      CSG.fromTriangles(
        buildTubeTriangles(
          anchor[0], anchor[1], anchor[2],
          piece[0], piece[1], piece[2],
          KIT_TUBE_RADIUS,
          KIT_TUBE_SEGMENTS
        )
      )
    );
    solids.push(buildNodeSphereCSG(piece, BRANCH_NODE_RADIUS, 16, 16));
  }

  if (!solids.length) return null;

  let csg = unionAllCSG(solids);
  const labelRanks = component.clusters
    .map(cluster => cluster.rank)
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
    .filter((rank, index, values) => index === 0 || rank !== values[index - 1]);
  const labelText = labelRanks.join('-');
  const cutSolids = [];
  const flatLayout = getTubeFlatLayout(getSegmentLength(labelSegment));

  if (flatLayout) {
    cutSolids.push(buildTubeFlatTrimCSG(flatLayout));

    const labelLayout = computeLabelLayout(labelText, flatLayout);
    if (labelLayout) {
      cutSolids.push(buildLabelTextCSG(labelText, labelLayout));
    }
  }

  if (cutSolids.length) {
    csg = csg.subtract(unionAllCSG(cutSolids));
  }

  return { csg, labelRanks };
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
 *   tubes/   – straight or branched tube parts, with Y pieces when holes merge
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
  const candidateConnections = [];

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

      // Check if a tube can physically fit between the two spheres
      const tubeLength = distance - infoA.radius - infoB.radius + 2 * TUBE_INSERTION_DEPTH;
      if (tubeLength < MIN_TUBE_LENGTH) continue;

      candidateConnections.push({
        id: candidateConnections.length,
        sysA,
        sysB,
        distance,
        dx,
        dy,
        dz,
        dirA: dirAtoB,
        dirB: dirBtoA
      });
    }
  }

  // ── Build ZIP ────────────────────────────────────────────────────────
  const allConnections = candidateConnections;
  const socketPlans = buildSystemSocketPlans(systemInfo, allConnections);
  const tubeComponents = buildTubeComponents(systemInfo, socketPlans, allConnections);

  const zip = new JSZip();
  const starsFolder = zip.folder('stars');
  const tubesFolder = zip.folder('tubes');

  const maxRank = rankMap.size;
  const padDigits = String(maxRank).length;
  const padRank = (r) => String(r).padStart(padDigits, '0');

  let starCount = 0;
  let tubeCount = 0;

  // ── Stars ────────────────────────────────────────────────────────────
  for (const [systemName, info] of systemInfo) {
    const radius = info.radius;
    const socketPlan = socketPlans.get(systemName) || {
      connectionClusters: new Map(),
      clusters: [],
      openingDirections: [],
      negativeSolids: []
    };
    const holeDirs = socketPlan.openingDirections;

    // Find best direction for engraved rank number (away from holes)
    const engravingDir = findFeatureDirection(holeDirs);

    // Build sphere with only the actual printable hole positions cut into it.
    const positiveSolids = [
      CSG.fromTriangles(buildSphereTriangles(0, 0, 0, radius, 32, 32))
    ];
    const cutSolids = [];

    // Cut flat facet for engraved number
    const facet = buildFacetTrimCSG(engravingDir, radius);
    cutSolids.push(facet.csg);

    // Engrave rank number
    if (Number.isFinite(info.rank)) {
      cutSolids.push(buildStarNumberCSG(String(info.rank), engravingDir, facet));
    }

    // Socket cutters are planned from the same overlap-merge logic used for
    // the branched tube parts, so stars and removable parts stay aligned.
    cutSolids.push(...socketPlan.negativeSolids);

    let csg = unionAllCSG(positiveSolids);
    if (cutSolids.length) {
      csg = csg.subtract(unionAllCSG(cutSolids));
    }

    // Orient for print (engraved face up) and place on build plate
    const triangles = orientStarForPrint(csg.toTriangles(), engravingDir);
    const stlBuffer = trianglesToBinarySTL(triangles);

    const rankStr = Number.isFinite(info.rank) ? padRank(info.rank) : '00';
    starsFolder.file(`${rankStr}_${sanitizeFilename(systemName)}.stl`, stlBuffer);
    starCount += 1;
  }

  // ── Tubes ────────────────────────────────────────────────────────────
  for (const component of tubeComponents) {
    const built = buildTubeComponentCSG(component);
    if (!built) continue;

    const triangles = placeTrianglesOnBuildPlate(built.csg.toTriangles());
    const stlBuffer = trianglesToBinarySTL(triangles);
    const fileLabel = built.labelRanks.map(rank => padRank(rank)).join('-');
    if (!fileLabel) continue;

    tubesFolder.file(`${fileLabel}.stl`, stlBuffer);
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
    `3D-print kit exported – ${starCount} stars, ${tubeCount} tubes ` +
    `(scale: 1 LY = ${KIT_MM_PER_LY} mm, star ⌀ ${STANDARD_DIAMETER_MM} mm, tube ⌀ ${KIT_TUBE_RADIUS * 2} mm).`
  );
}
