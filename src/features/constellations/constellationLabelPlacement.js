import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';

import {
  cachedRadToSphere,
  vectorToRaDecRad
} from '../../shared/geometryUtils.js';
import {
  getConstellationBoundaries,
  getConstellationCenters,
  getConstellationFullNames
} from './constellationDataService.js';

const R = 100;
const TOLERANCE = 0.1;

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
  const convert = (seg, endpoint) => cachedRadToSphere(
    endpoint === 0 ? seg.ra1 : seg.ra2,
    endpoint === 0 ? seg.dec1 : seg.dec2,
    R
  );

  let currentPoint = convert(segs[0], 0);
  ordered.push(currentPoint.clone());
  used[0] = true;
  let currentEnd = convert(segs[0], 1);
  ordered.push(currentEnd.clone());

  let changed = true;
  let iteration = 0;
  while (changed && iteration < segs.length) {
    changed = false;
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      const seg = segs[i];
      const p0 = convert(seg, 0);
      const p1 = convert(seg, 1);
      if (p0.distanceTo(currentEnd) < TOLERANCE) {
        ordered.push(p1.clone());
        currentEnd = p1;
        used[i] = true;
        changed = true;
      } else if (p1.distanceTo(currentEnd) < TOLERANCE) {
        ordered.push(p0.clone());
        currentEnd = p0;
        used[i] = true;
        changed = true;
      }
    }
    iteration++;
  }

  if (ordered.length < 4) return [];
  if (ordered[0].distanceTo(ordered[ordered.length - 1]) > TOLERANCE) return [];
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

function fallbackAnchor(abbrev) {
  const center = getConstellationCenters().find(entry => {
    const key = (entry.abbrev || entry.key || entry.code || '').toUpperCase();
    if (key && key === abbrev) return true;
    const name = (entry.name || '').toUpperCase();
    return name === abbrev;
  });
  if (center) return { ra: center.ra, dec: center.dec, name: center.name || abbrev };
  return null;
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
    let best2D = polylabel(polygon2D, 0.15);

    if (!best2D || signedDistance(best2D, polygon2D) <= 0) {
      const centroid2D = polygon2D.reduce((sum, p) => sum.add(p.clone()), new THREE.Vector2()).multiplyScalar(1 / polygon2D.length);
      best2D = pointInPolygon(centroid2D, polygon2D) ? centroid2D : polylabel(polygon2D, 0.5);
    }

    if (!best2D) {
      const fallback = fallbackAnchor(abbrev);
      if (fallback) anchors.push(fallback);
      return;
    }

    const best3D = pointToSphere(best2D.x, best2D.y, basis);
    const { ra, dec } = vectorToRaDecRad(best3D, R);
    anchors.push({
      ra,
      dec,
      name: fullNames[abbrev] || abbrev,
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
