import * as THREE from '../../vendor/three.js';

import {
  cachedRadToSphere,
  vectorToRaDecRad
} from '../../shared/geometryUtils.js';
import {
  getConstellationBoundaries,
  getConstellationCenters,
  getConstellationFullNames
} from './constellationDataService.js';
import { measureConstellationLabelWorldSize } from './constellationStyle.js';

const R = 100;
const BASE_CONSTELLATION_FONT_SIZE = 300;
const MIN_CONSTELLATION_FONT_SCALE = 0.6;
const FONT_SCALE_STEP = 0.05;
const MIN_LABEL_SEARCH_STEP = 0.18;
const LABEL_PADDING_FLOOR = 0.12;
const LABEL_SEARCH_EPSILON = 1e-6;

function buildConstellationGroups() {
  const groups = {};
  getConstellationBoundaries().forEach(seg => {
    const c1 = seg.const1 ? seg.const1.toUpperCase() : null;
    const c2 = seg.const2 ? seg.const2.toUpperCase() : null;
    if (c1) {
      if (!groups[c1]) groups[c1] = [];
      groups[c1].push(seg);
    }
    if (c2 && c2 !== c1) {
      if (!groups[c2]) groups[c2] = [];
      groups[c2].push(seg);
    }
  });
  return groups;
}

function orderConstellationVertices(segs) {
  if (!Array.isArray(segs) || segs.length === 0) return [];
  const ordered = [];
  const used = new Array(segs.length).fill(false);
  const adjacency = new Map();
  const getPoint = (seg, endpoint) => cachedRadToSphere(
    endpoint === 0 ? seg.ra1 : seg.ra2,
    endpoint === 0 ? seg.dec1 : seg.dec2,
    R
  );
  const getKey = (seg, endpoint) => {
    if (endpoint === 0) return seg.key1 || `${seg.ra1}|${seg.dec1}`;
    return seg.key2 || `${seg.ra2}|${seg.dec2}`;
  };

  segs.forEach((seg, index) => {
    const key1 = getKey(seg, 0);
    const key2 = getKey(seg, 1);
    if (!adjacency.has(key1)) adjacency.set(key1, []);
    if (!adjacency.has(key2)) adjacency.set(key2, []);
    adjacency.get(key1).push(index);
    adjacency.get(key2).push(index);
  });

  const startSeg = segs[0];
  const startKey = getKey(startSeg, 0);
  let currentKey = getKey(startSeg, 1);
  ordered.push(getPoint(startSeg, 0).clone());
  ordered.push(getPoint(startSeg, 1).clone());
  used[0] = true;

  let iteration = 1;
  while (iteration < segs.length) {
    const candidates = (adjacency.get(currentKey) || []).filter(index => !used[index]);
    if (candidates.length === 0) break;

    const nextSeg = segs[candidates[0]];
    const key1 = getKey(nextSeg, 0);
    const key2 = getKey(nextSeg, 1);
    used[candidates[0]] = true;

    if (key1 === currentKey) {
      ordered.push(getPoint(nextSeg, 1).clone());
      currentKey = key2;
    } else if (key2 === currentKey) {
      ordered.push(getPoint(nextSeg, 0).clone());
      currentKey = key1;
    } else {
      return [];
    }

    iteration++;
  }

  if (ordered.length !== segs.length + 1) return [];
  if (currentKey !== startKey) return [];
  ordered.pop();
  return ordered;
}

function computeLocalBasis(vertices) {
  const normal = new THREE.Vector3();
  vertices.forEach(v => normal.add(v));
  if (normal.lengthSq() < 1e-8) return null;
  normal.normalize();

  let up = new THREE.Vector3(0, 1, 0);
  if (Math.abs(normal.dot(up)) > 0.95) up = new THREE.Vector3(1, 0, 0);

  const tangent = up.clone().sub(normal.clone().multiplyScalar(normal.dot(up))).normalize();
  const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
  return { normal, tangent, bitangent };
}

function projectToLocal2D(point, basis) {
  return new THREE.Vector2(point.dot(basis.tangent), point.dot(basis.bitangent));
}

function pointToSphere(x, y, basis) {
  const radialSq = Math.max(0, R * R - x * x - y * y);
  const z = Math.sqrt(radialSq);
  return basis.tangent.clone().multiplyScalar(x)
    .add(basis.bitangent.clone().multiplyScalar(y))
    .add(basis.normal.clone().multiplyScalar(z))
    .normalize()
    .multiplyScalar(R);
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-12) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function distToSegmentSquared(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const denom = abx * abx + aby * aby;
  const t = denom <= 1e-12 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / denom));
  const dx = a.x + abx * t - p.x;
  const dy = a.y + aby * t - p.y;
  return dx * dx + dy * dy;
}

function signedDistance(point, polygon) {
  if (polygon.length === 0) return -Infinity;
  let minDistSq = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    minDistSq = Math.min(minDistSq, distToSegmentSquared(point, a, b));
  }
  const dist = Math.sqrt(minDistSq);
  return pointInPolygon(point, polygon) ? dist : -dist;
}

function polylabel(polygon, precision = 0.25) {
  if (!Array.isArray(polygon) || polygon.length < 3) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  polygon.forEach(p => {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  });

  const width = maxX - minX;
  const height = maxY - minY;
  if (width <= 1e-6 && height <= 1e-6) return polygon[0].clone();

  const makeCell = (x, y, h) => {
    const d = signedDistance(new THREE.Vector2(x, y), polygon);
    return { x, y, h, d, max: d + h * Math.SQRT2 };
  };

  let cellSize = Math.max(width, height);
  let h = cellSize / 2;
  const cells = [];
  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) {
      cells.push(makeCell(x + h, y + h, h));
    }
  }

  const bboxCenter = makeCell(minX + width / 2, minY + height / 2, 0);
  let bestCell = bboxCenter;

  for (const p of polygon) {
    const candidate = makeCell(p.x, p.y, 0);
    if (candidate.d > bestCell.d) bestCell = candidate;
  }

  while (cells.length > 0) {
    cells.sort((a, b) => b.max - a.max);
    const cell = cells.shift();
    if (cell.d > bestCell.d) bestCell = cell;
    if (cell.max - bestCell.d <= precision) continue;
    h = cell.h / 2;
    cells.push(makeCell(cell.x - h, cell.y - h, h));
    cells.push(makeCell(cell.x + h, cell.y - h, h));
    cells.push(makeCell(cell.x - h, cell.y + h, h));
    cells.push(makeCell(cell.x + h, cell.y + h, h));
  }

  return new THREE.Vector2(bestCell.x, bestCell.y);
}

function getCenterAnchor(abbrev) {
  return getConstellationCenters().find(entry => {
    const key = (entry.abbrev || entry.key || entry.code || '').toUpperCase();
    if (key && key === abbrev) return true;
    const name = (entry.name || '').toUpperCase();
    return name === abbrev;
  });
}

function fallbackAnchor(abbrev) {
  const center = getCenterAnchor(abbrev);
  if (center) return { ra: center.ra, dec: center.dec, name: center.name || abbrev };
  return null;
}

function computeLabelPadding(width, height) {
  return Math.max(LABEL_PADDING_FLOOR, Math.min(width, height) * 0.05);
}

function buildPolygonEdges(polygon) {
  return polygon.map((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    return {
      a: point,
      b: next,
      minX: Math.min(point.x, next.x),
      maxX: Math.max(point.x, next.x),
      minY: Math.min(point.y, next.y),
      maxY: Math.max(point.y, next.y)
    };
  });
}

function makeLabelRectangle(center, width, height, padding) {
  const halfWidth = width / 2 + padding;
  const halfHeight = height / 2 + padding;
  const corners = [
    new THREE.Vector2(center.x - halfWidth, center.y - halfHeight),
    new THREE.Vector2(center.x + halfWidth, center.y - halfHeight),
    new THREE.Vector2(center.x + halfWidth, center.y + halfHeight),
    new THREE.Vector2(center.x - halfWidth, center.y + halfHeight)
  ];

  return {
    minX: center.x - halfWidth,
    maxX: center.x + halfWidth,
    minY: center.y - halfHeight,
    maxY: center.y + halfHeight,
    corners,
    edges: [
      { a: corners[0], b: corners[1] },
      { a: corners[1], b: corners[2] },
      { a: corners[2], b: corners[3] },
      { a: corners[3], b: corners[0] }
    ]
  };
}

function pointInRectangle(point, rect) {
  return (
    point.x >= rect.minX - LABEL_SEARCH_EPSILON &&
    point.x <= rect.maxX + LABEL_SEARCH_EPSILON &&
    point.y >= rect.minY - LABEL_SEARCH_EPSILON &&
    point.y <= rect.maxY + LABEL_SEARCH_EPSILON
  );
}

function orientation(a, b, c) {
  const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (Math.abs(cross) <= LABEL_SEARCH_EPSILON) return 0;
  return cross > 0 ? 1 : -1;
}

function pointOnSegment(a, b, point) {
  return (
    point.x >= Math.min(a.x, b.x) - LABEL_SEARCH_EPSILON &&
    point.x <= Math.max(a.x, b.x) + LABEL_SEARCH_EPSILON &&
    point.y >= Math.min(a.y, b.y) - LABEL_SEARCH_EPSILON &&
    point.y <= Math.max(a.y, b.y) + LABEL_SEARCH_EPSILON
  );
}

function segmentsIntersectInclusive(a, b, c, d) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && pointOnSegment(a, b, c)) return true;
  if (o2 === 0 && pointOnSegment(a, b, d)) return true;
  if (o3 === 0 && pointOnSegment(c, d, a)) return true;
  if (o4 === 0 && pointOnSegment(c, d, b)) return true;
  return false;
}

function doesLabelBoxFit(point, polygon, polygonEdges, width, height) {
  const padding = computeLabelPadding(width, height);
  const rect = makeLabelRectangle(point, width, height, padding);

  if (!rect.corners.every(corner => signedDistance(corner, polygon) > LABEL_SEARCH_EPSILON)) {
    return false;
  }

  for (const edge of polygonEdges) {
    if (
      edge.maxX < rect.minX - LABEL_SEARCH_EPSILON ||
      edge.minX > rect.maxX + LABEL_SEARCH_EPSILON ||
      edge.maxY < rect.minY - LABEL_SEARCH_EPSILON ||
      edge.minY > rect.maxY + LABEL_SEARCH_EPSILON
    ) {
      continue;
    }

    if (pointInRectangle(edge.a, rect) || pointInRectangle(edge.b, rect)) {
      return false;
    }

    for (const rectEdge of rect.edges) {
      if (segmentsIntersectInclusive(edge.a, edge.b, rectEdge.a, rectEdge.b)) {
        return false;
      }
    }
  }

  return true;
}

function buildSearchBounds(polygon, width, height) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  polygon.forEach(point => {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  });

  const padding = computeLabelPadding(width, height);
  const insetX = width / 2 + padding;
  const insetY = height / 2 + padding;
  const bounds = {
    minX: minX + insetX,
    maxX: maxX - insetX,
    minY: minY + insetY,
    maxY: maxY - insetY
  };

  if (bounds.minX > bounds.maxX || bounds.minY > bounds.maxY) {
    return null;
  }

  return bounds;
}

function clampPointToBounds(point, bounds) {
  return new THREE.Vector2(
    THREE.MathUtils.clamp(point.x, bounds.minX, bounds.maxX),
    THREE.MathUtils.clamp(point.y, bounds.minY, bounds.maxY)
  );
}

function tryLabelCandidate(best, point, preferred, polygon, polygonEdges, width, height, bounds) {
  if (
    point.x < bounds.minX - LABEL_SEARCH_EPSILON ||
    point.x > bounds.maxX + LABEL_SEARCH_EPSILON ||
    point.y < bounds.minY - LABEL_SEARCH_EPSILON ||
    point.y > bounds.maxY + LABEL_SEARCH_EPSILON
  ) {
    return best;
  }

  if (!doesLabelBoxFit(point, polygon, polygonEdges, width, height)) {
    return best;
  }

  const dist2 = preferred.distanceToSquared(point);
  const clearance = signedDistance(point, polygon);
  const candidate = { point: point.clone(), dist2, clearance };

  if (!best) return candidate;
  if (candidate.dist2 < best.dist2 - LABEL_SEARCH_EPSILON) return candidate;
  if (Math.abs(candidate.dist2 - best.dist2) <= LABEL_SEARCH_EPSILON && candidate.clearance > best.clearance + LABEL_SEARCH_EPSILON) {
    return candidate;
  }
  return best;
}

function searchSpiralForLabelCenter(preferred, polygon, polygonEdges, width, height, bounds, maxRadius = Infinity) {
  const step = Math.max(MIN_LABEL_SEARCH_STEP, Math.min(width, height) / 8);
  const diagonal = Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);
  const radiusLimit = Math.min(maxRadius, diagonal);
  let best = null;

  const centerPoint = clampPointToBounds(preferred, bounds);
  best = tryLabelCandidate(best, centerPoint, preferred, polygon, polygonEdges, width, height, bounds);
  if (best && best.dist2 <= LABEL_SEARCH_EPSILON) {
    return { best, step };
  }

  for (let radius = step; radius <= radiusLimit + LABEL_SEARCH_EPSILON; radius += step) {
    const samples = Math.max(16, Math.ceil((2 * Math.PI * radius) / step));
    let ringBest = null;

    for (let i = 0; i < samples; i++) {
      const angle = (i / samples) * Math.PI * 2;
      const point = new THREE.Vector2(
        preferred.x + Math.cos(angle) * radius,
        preferred.y + Math.sin(angle) * radius
      );
      ringBest = tryLabelCandidate(ringBest, point, preferred, polygon, polygonEdges, width, height, bounds);
    }

    if (ringBest) {
      return { best: ringBest, step };
    }
  }

  return { best: null, step };
}

function searchGridForLabelCenter(preferred, polygon, polygonEdges, width, height, bounds) {
  const step = Math.max(MIN_LABEL_SEARCH_STEP, Math.min(width, height) / 8);
  let best = null;

  for (let y = bounds.minY; y <= bounds.maxY + LABEL_SEARCH_EPSILON; y += step) {
    for (let x = bounds.minX; x <= bounds.maxX + LABEL_SEARCH_EPSILON; x += step) {
      best = tryLabelCandidate(
        best,
        new THREE.Vector2(x, y),
        preferred,
        polygon,
        polygonEdges,
        width,
        height,
        bounds
      );
    }
  }

  return { best, step };
}

function refineLabelCenterCandidate(best, preferred, polygon, polygonEdges, width, height, bounds, initialStep) {
  let refined = best;
  let step = initialStep;

  for (let pass = 0; pass < 4; pass++) {
    step /= 2;
    let localBest = refined;

    for (let iy = -2; iy <= 2; iy++) {
      for (let ix = -2; ix <= 2; ix++) {
        if (ix === 0 && iy === 0) continue;
        const point = new THREE.Vector2(
          refined.point.x + ix * step,
          refined.point.y + iy * step
        );
        localBest = tryLabelCandidate(
          localBest,
          point,
          preferred,
          polygon,
          polygonEdges,
          width,
          height,
          bounds
        );
      }
    }

    refined = localBest;
  }

  return refined;
}

function findBestLabelPlacement(polygon, preferred, width, height) {
  const bounds = buildSearchBounds(polygon, width, height);
  if (!bounds) return null;

  const polygonEdges = buildPolygonEdges(polygon);
  const preferredPoint = clampPointToBounds(preferred, bounds);
  const seedPoints = [
    preferredPoint,
    new THREE.Vector2((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2)
  ];

  let best = null;
  seedPoints.forEach(point => {
    best = tryLabelCandidate(best, point, preferredPoint, polygon, polygonEdges, width, height, bounds);
  });

  if (best && best.dist2 <= LABEL_SEARCH_EPSILON) {
    return best.point;
  }

  const maxSeedRadius = best ? Math.sqrt(best.dist2) + Math.max(MIN_LABEL_SEARCH_STEP, Math.min(width, height) / 8) : Infinity;
  const spiralResult = searchSpiralForLabelCenter(
    preferredPoint,
    polygon,
    polygonEdges,
    width,
    height,
    bounds,
    maxSeedRadius
  );

  if (spiralResult.best) {
    return refineLabelCenterCandidate(
      spiralResult.best,
      preferredPoint,
      polygon,
      polygonEdges,
      width,
      height,
      bounds,
      spiralResult.step
    ).point;
  }

  const gridResult = searchGridForLabelCenter(
    preferredPoint,
    polygon,
    polygonEdges,
    width,
    height,
    bounds
  );

  if (!gridResult.best) {
    return null;
  }

  return refineLabelCenterCandidate(
    gridResult.best,
    preferredPoint,
    polygon,
    polygonEdges,
    width,
    height,
    bounds,
    gridResult.step
  ).point;
}

let cachedAnchors = null;

export function getConstellationLabelAnchors() {
  if (cachedAnchors) {
    return cachedAnchors.map(anchor => ({ ...anchor }));
  }

  const fullNames = getConstellationFullNames();
  const groups = buildConstellationGroups();
  const anchors = [];

  Object.entries(groups).forEach(([abbrev, segs]) => {
    const displayName = fullNames[abbrev] || abbrev;
    const preferredCenter = getCenterAnchor(abbrev);
    const ordered3D = orderConstellationVertices(segs);
    if (ordered3D.length < 3) {
      const fallback = fallbackAnchor(abbrev);
      if (fallback) anchors.push(fallback);
      return;
    }

    const basis = computeLocalBasis(ordered3D);
    if (!basis) {
      const fallback = fallbackAnchor(abbrev);
      if (fallback) anchors.push(fallback);
      return;
    }

    const polygon2D = ordered3D.map(p => projectToLocal2D(p, basis));
    const polylabel2D = polylabel(polygon2D, 0.15);
    const centroid2D = polygon2D
      .reduce((sum, p) => sum.add(p.clone()), new THREE.Vector2())
      .multiplyScalar(1 / polygon2D.length);

    let preferred2D = null;
    if (preferredCenter) {
      const center3D = cachedRadToSphere(preferredCenter.ra, preferredCenter.dec, R);
      const center2D = projectToLocal2D(center3D, basis);
      if (signedDistance(center2D, polygon2D) > LABEL_SEARCH_EPSILON) {
        preferred2D = center2D;
      }
    }

    if (!preferred2D && polylabel2D && signedDistance(polylabel2D, polygon2D) > LABEL_SEARCH_EPSILON) {
      preferred2D = polylabel2D;
    }

    if (!preferred2D) {
      preferred2D = pointInPolygon(centroid2D, polygon2D) ? centroid2D : polylabel(polygon2D, 0.5);
    }

    if (!preferred2D) {
      preferred2D = centroid2D.clone();
    }

    let best2D = null;
    let fontSize = BASE_CONSTELLATION_FONT_SIZE;
    for (let scale = 1; scale >= MIN_CONSTELLATION_FONT_SCALE - LABEL_SEARCH_EPSILON; scale -= FONT_SCALE_STEP) {
      fontSize = Math.round(BASE_CONSTELLATION_FONT_SIZE * scale);
      const labelSize = measureConstellationLabelWorldSize(displayName, fontSize);
      const candidate = findBestLabelPlacement(polygon2D, preferred2D, labelSize.width, labelSize.height);
      if (candidate) {
        best2D = candidate;
        break;
      }
    }

    if (!best2D) {
      return;
    }

    const best3D = pointToSphere(best2D.x, best2D.y, basis);
    const { ra, dec } = vectorToRaDecRad(best3D, R);
    anchors.push({
      ra,
      dec,
      name: displayName,
      fontSize,
      abbrev
    });
  });

  if (anchors.length === 0) {
    cachedAnchors = getConstellationCenters().map(center => ({ ...center }));
  } else {
    cachedAnchors = anchors.sort((a, b) => a.name.localeCompare(b.name));
  }

  return cachedAnchors.map(anchor => ({ ...anchor }));
}

export function invalidateConstellationLabelAnchors() {
  cachedAnchors = null;
}
