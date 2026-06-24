import { CSG } from '../../vendor/csg.js';
import { buildTubeTriangles } from './stlExporter.js';
import { STL_TUBE_RADIUS_MM } from './stlScale.js';
import {
  DIGIT_WIDTH_UNITS,
  DIGIT_HEIGHT_UNITS,
  DIGIT_SPACING_UNITS,
  DIGIT_LINE_SPACING_UNITS,
  STAR_STROKE_WIDTH_UNITS,
  LABEL_STROKE_WIDTH_UNITS,
  STROKE_SEGMENT_OVERLAP_UNITS,
  VECTOR_GLYPHS,
  getGlyphLineMetrics,
  layoutDigits
} from './stlTextGlyphs.js';
import { buildFeatureBasis } from './stlPrintOrientation.js';
import {
  getFacetBoxHalfDepth,
  getFacetBoxHalfExtent,
  getFacetDepth,
  getFacetDiameter,
  getFacetPlaneOffset,
  makePointOnFacet
} from './stlFacetGeometry.js';
import {
  vecAdd,
  vecCross,
  vecDistance,
  vecDot,
  vecLength,
  vecNormalise,
  vecScale,
  vecSub
} from './stlVectorMath.js';
import { HOLE_RADIUS } from './stlSocketPlanning.js';
import {
  buildSegmentLabelBasis,
  computeTubeLabelLayout,
  getTubeFlatLayout,
  getTubeLabelMaxHeight,
  getTubeLabelMaxWidth
} from './stlTubeLabelLayout.js';

const KIT_TUBE_RADIUS = STL_TUBE_RADIUS_MM;
const KIT_TUBE_SEGMENTS = 24;
const HOLE_SEGMENTS = 24;

const LABEL_ENGRAVE_DEPTH = 0.5;
const LABEL_ENGRAVE_BLEED = 0.25;
const BRANCH_NODE_RADIUS = KIT_TUBE_RADIUS + 0.25;

const STAR_ENGRAVE_DEPTH = 0.5;
const STAR_ENGRAVE_BLEED = 0.25;
const STAR_ENGRAVE_WIDTH_FACTOR = 0.8;
const STAR_ENGRAVE_HEIGHT_FACTOR = 0.72;
export function unionAllCSG(solids) {
  if (!Array.isArray(solids) || solids.length === 0) return CSG.fromPolygons([]);
  let result = solids[0];
  for (let i = 1; i < solids.length; i += 1) {
    result = result.union(solids[i]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Geometry primitives
// ---------------------------------------------------------------------------

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

function buildNodeSphereCSG(centre, radius, widthSegs = 20, heightSegs = 20) {
  return CSG.fromTriangles(
    buildSphereTriangles(centre[0], centre[1], centre[2], radius, widthSegs, heightSegs)
  );
}

function transformTriangles(triangles, centre, axisX, axisY, axisZ) {
  const transformPoint = (point) => ([
    centre[0] + axisX[0] * point[0] + axisY[0] * point[1] + axisZ[0] * point[2],
    centre[1] + axisX[1] * point[0] + axisY[1] * point[1] + axisZ[1] * point[2],
    centre[2] + axisX[2] * point[0] + axisY[2] * point[1] + axisZ[2] * point[2]
  ]);

  return triangles.map(tri => ({
    a: transformPoint(tri.a),
    b: transformPoint(tri.b),
    c: transformPoint(tri.c)
  }));
}

function placeCanonicalCSG(csg, centre, axisX, axisY, axisZ) {
  return CSG.fromTriangles(
    transformTriangles(csg.toTriangles(), centre, axisX, axisY, axisZ)
  );
}

function buildSegmentEndLabelCuts(segmentStart, segmentEnd, text, preferredUp = [0, 0, 1]) {
  if (!text) return [];

  const direction = vecSub(segmentEnd, segmentStart);
  const segmentLength = vecLength(direction);
  const labelLength = Math.min(segmentLength - 0.4, 12);
  if (!(labelLength > 2)) return [];

  const flatLayout = getTubeFlatLayout(labelLength);
  if (!flatLayout) return [];

  const labelLayout = computeTubeLabelLayout(text, flatLayout);
  if (!labelLayout) return [];

  const { axisX, axisY, axisZ } = buildSegmentLabelBasis(direction, preferredUp);
  const centre = vecAdd(segmentStart, vecScale(axisX, labelLength / 2));

  return [
    placeCanonicalCSG(buildTubeFlatTrimCSG(flatLayout), centre, axisX, axisY, axisZ),
    placeCanonicalCSG(buildLabelTextCSG(text, labelLayout), centre, axisX, axisY, axisZ)
  ];
}

// ---------------------------------------------------------------------------
// Star engraving (flat facet + rank number on sphere)
// ---------------------------------------------------------------------------

export function buildFacetTrimCSG(dir, sphereRadius) {
  const { right, up, forward } = buildFeatureBasis(dir);
  const facetDepth = getFacetDepth(sphereRadius);
  const planeOffset = getFacetPlaneOffset(sphereRadius, facetDepth);
  const halfDepth = getFacetBoxHalfDepth(sphereRadius);
  const halfExtent = getFacetBoxHalfExtent(sphereRadius);
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

// ---------------------------------------------------------------------------
// Shared stroke-rendering primitives
// ---------------------------------------------------------------------------

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

  const { maxWidthUnits, totalHeightUnits } = getGlyphLineMetrics(lines);

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

// ---------------------------------------------------------------------------
// Star number engraving (uses multi-line layout for large numbers)
// ---------------------------------------------------------------------------

export function buildStarNumberCSG(numberText, dir, facet) {
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

// ---------------------------------------------------------------------------
// Hole subtraction (cylindrical bore for tube insertion)
// ---------------------------------------------------------------------------

export function buildHoleCSG(direction, innerDist, outerDist) {
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

// ---------------------------------------------------------------------------
// Tube flattened crown + engraved text
// ---------------------------------------------------------------------------

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
  const maxWidth = getTubeLabelMaxWidth(layout);
  const maxHeight = getTubeLabelMaxHeight(layout);

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

export function buildTubeComponentCSG(component) {
  const mainSegment = chooseComponentLabelSegment(component);
  if (!mainSegment) return null;

  const basis = buildComponentBasis(component, mainSegment);
  const solids = [];
  const localEdges = [];
  const localClusters = component.clusters.map(cluster => ({
    ...cluster,
    localAnchor: transformPointToBasis(cluster.anchorWorld, basis),
    localPiece: transformPointToBasis(cluster.pieceWorld, basis)
  }));

  for (const edge of component.edges) {
    const start = transformPointToBasis(edge.pointA, basis);
    const end = transformPointToBasis(edge.pointB, basis);
    localEdges.push({
      ...edge,
      start,
      end
    });
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

  for (const cluster of localClusters) {
    if (!cluster.merged) continue;

    solids.push(
      CSG.fromTriangles(
        buildTubeTriangles(
          cluster.localAnchor[0], cluster.localAnchor[1], cluster.localAnchor[2],
          cluster.localPiece[0], cluster.localPiece[1], cluster.localPiece[2],
          KIT_TUBE_RADIUS,
          KIT_TUBE_SEGMENTS
        )
      )
    );
    solids.push(buildNodeSphereCSG(cluster.localPiece, BRANCH_NODE_RADIUS, 16, 16));
  }

  if (!solids.length) return null;

  let csg = unionAllCSG(solids);
  const labelRanks = component.clusters
    .map(cluster => cluster.rank)
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
    .filter((rank, index, values) => index === 0 || rank !== values[index - 1]);
  const cutSolids = [];
  const preferredUp = [0, 0, 1];

  for (const cluster of localClusters) {
    if (!Number.isFinite(cluster.rank)) continue;

    if (cluster.merged) {
      cutSolids.push(
        ...buildSegmentEndLabelCuts(cluster.localAnchor, cluster.localPiece, String(cluster.rank), preferredUp)
      );
      continue;
    }

    const incidentEdge = localEdges.find(edge => edge.clusterIdA === cluster.id || edge.clusterIdB === cluster.id);
    if (!incidentEdge) continue;
    const segmentEnd = incidentEdge.clusterIdA === cluster.id ? incidentEdge.end : incidentEdge.start;

    cutSolids.push(
      ...buildSegmentEndLabelCuts(cluster.localAnchor, segmentEnd, String(cluster.rank), preferredUp)
    );
  }

  if (cutSolids.length) {
    csg = csg.subtract(unionAllCSG(cutSolids));
  }

  return { csg, labelRanks };
}

