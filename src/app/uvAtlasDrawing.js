import * as THREE from '../vendor/three.js';
import {
  spherePositionToUv,
  splitWrappedUvSegment,
  unwrapUvSequence
} from '../shared/uvUtils.js';
import { ATLAS_WIDTH, ATLAS_HEIGHT } from '../shared/constants.js';

/**
 * Draw a filled circle at (x, y) with wrapping copies at +/- ATLAS_WIDTH
 * so the circle seamlessly spans the left/right atlas edges.
 */
export function drawWrappedCircle(ctx, x, y, radius) {
  [-ATLAS_WIDTH, 0, ATLAS_WIDTH].forEach(shiftX => {
    const drawX = x + shiftX;
    if (drawX + radius < 0 || drawX - radius > ATLAS_WIDTH) return;
    ctx.beginPath();
    ctx.arc(drawX, y, radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * Stroke a UV-space line segment from `s` to `e`, drawing three copies
 * (offset by -1, 0, +1 atlas widths) so the segment wraps correctly.
 */
export function strokeUvSegment(ctx, s, e) {
  [-1, 0, 1].forEach(copyOffset => {
    const x1 = (s.u + copyOffset) * ATLAS_WIDTH;
    const y1 = s.v * ATLAS_HEIGHT;
    const x2 = (e.u + copyOffset) * ATLAS_WIDTH;
    const y2 = e.v * ATLAS_HEIGHT;
    if (Math.max(x1, x2) < 0 || Math.min(x1, x2) > ATLAS_WIDTH) return;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  });
}

/**
 * Wrap a pixel X coordinate into [0, ATLAS_WIDTH).
 */
export function wrapPixelX(value) {
  let wrapped = value % ATLAS_WIDTH;
  if (wrapped < 0) wrapped += ATLAS_WIDTH;
  return wrapped;
}

/**
 * Test whether point (x, y) lies inside a rectangle, accounting for wrapping.
 */
export function pointInWrappedRect(x, y, rect) {
  if (y < rect.y || y > rect.y + rect.height) return false;
  for (const shift of [-ATLAS_WIDTH, 0, ATLAS_WIDTH]) {
    const shiftedX = x + shift;
    if (shiftedX >= rect.x && shiftedX <= rect.x + rect.width) return true;
  }
  return false;
}

/**
 * Test whether two axis-aligned boxes overlap, accounting for horizontal wrapping.
 */
export function boxesOverlapWrapped(a, b) {
  const yOverlap = a.y < (b.y + b.height) && (a.y + a.height) > b.y;
  if (!yOverlap) return false;
  for (const shift of [-ATLAS_WIDTH, 0, ATLAS_WIDTH]) {
    const bx = b.x + shift;
    const xOverlap = a.x < (bx + b.width) && (a.x + a.width) > bx;
    if (xOverlap) return true;
  }
  return false;
}

/**
 * Unwrap a triangle's UV coordinates so adjacent vertices don't jump across
 * the 0/1 seam.
 */
export function normalizeWrappedTriangle(triangle) {
  return unwrapUvSequence(triangle.map(point => ({ ...point })));
}

/**
 * Fill a single triangle whose vertices are given as 3D sphere-surface vectors.
 * Converts to UV, normalizes wrapping, then draws three offset copies.
 */
export function fillWrappedTriangle(ctx, aVec, bVec, cVec) {
  const tri = [spherePositionToUv(aVec, 100), spherePositionToUv(bVec, 100), spherePositionToUv(cVec, 100)];
  const normalized = normalizeWrappedTriangle(tri);
  [-1, 0, 1].forEach(copyOffset => {
    const points = normalized.map(({ u, v }) => ({ x: (u + copyOffset) * ATLAS_WIDTH, y: v * ATLAS_HEIGHT }));
    const xs = points.map(p => p.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    if (maxX < -8 || minX > ATLAS_WIDTH + 8) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.lineTo(points[2].x, points[2].y);
    ctx.closePath();
    ctx.fill();
  });
}

/**
 * Fill all triangles in a Three.js mesh (indexed or non-indexed geometry),
 * projecting each face from 3D to UV atlas space.
 * @param {CanvasRenderingContext2D} ctx
 * @param {THREE.Mesh} mesh
 * @param {string} fillStyle — pre-computed CSS color string (e.g. from rgbaFromHex)
 */
// Pre-allocated vectors to avoid per-triangle allocations in fillProjectedMesh
const _triA = new THREE.Vector3();
const _triB = new THREE.Vector3();
const _triC = new THREE.Vector3();

export function fillProjectedMesh(ctx, mesh, fillStyle) {
  const geometry = mesh?.geometry;
  const positionAttr = geometry?.getAttribute?.('position');
  if (!positionAttr) return;
  const index = geometry.index;
  ctx.save();
  ctx.fillStyle = fillStyle;
  if (index) {
    for (let i = 0; i <= index.count - 3; i += 3) {
      _triA.fromBufferAttribute(positionAttr, index.getX(i)).applyMatrix4(mesh.matrixWorld);
      _triB.fromBufferAttribute(positionAttr, index.getX(i + 1)).applyMatrix4(mesh.matrixWorld);
      _triC.fromBufferAttribute(positionAttr, index.getX(i + 2)).applyMatrix4(mesh.matrixWorld);
      fillWrappedTriangle(ctx, _triA, _triB, _triC);
    }
  } else {
    for (let i = 0; i <= positionAttr.count - 3; i += 3) {
      _triA.fromBufferAttribute(positionAttr, i).applyMatrix4(mesh.matrixWorld);
      _triB.fromBufferAttribute(positionAttr, i + 1).applyMatrix4(mesh.matrixWorld);
      _triC.fromBufferAttribute(positionAttr, i + 2).applyMatrix4(mesh.matrixWorld);
      fillWrappedTriangle(ctx, _triA, _triB, _triC);
    }
  }
  ctx.restore();
}

/**
 * Split a UV segment at the wrapping boundary, delegating to splitWrappedUvSegment.
 */
export function splitWrappedSegment(a, b) {
  return splitWrappedUvSegment(a, b);
}
