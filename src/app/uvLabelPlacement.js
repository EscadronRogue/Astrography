import * as THREE from '../vendor/three.js';
import {
  EQUIRECT_WIDTH,
  EQUIRECT_HEIGHT,
  getStarEquirectangularPosition,
  unwrapUvAroundReference
} from '../shared/uvUtils.js';
import { wrapPixelX, boxesOverlapWrapped, pointInWrappedRect } from './uvAtlasDrawing.js';
import { getAtlasHeight, getAtlasWidth } from './uvAtlasConfig.js';

const LABEL_MARGIN_Y = 10;
const GRID_CELL_SIZE = 128;

/**
 * Lightweight spatial index for placed label boxes.
 * Partitions the active atlas into a grid of GRID_CELL_SIZE cells,
 * so overlap/containment queries only check boxes in neighbouring cells.
 */
export class LabelSpatialIndex {
  constructor({
    atlasWidth = getAtlasWidth(),
    atlasHeight = getAtlasHeight(),
    gridCellSize = GRID_CELL_SIZE
  } = {}) {
    this.atlasWidth = atlasWidth;
    this.atlasHeight = atlasHeight;
    this.gridCellSize = gridCellSize;
    this.gridCols = Math.ceil(this.atlasWidth / this.gridCellSize);
    this.gridRows = Math.ceil(this.atlasHeight / this.gridCellSize);
    this.cells = new Array(this.gridCols * this.gridRows);
    for (let i = 0; i < this.cells.length; i++) this.cells[i] = [];
  }

  _cellRange(box) {
    const minCol = Math.max(0, Math.floor(box.x / this.gridCellSize));
    const maxCol = Math.min(this.gridCols - 1, Math.floor((box.x + box.width) / this.gridCellSize));
    const minRow = Math.max(0, Math.floor(box.y / this.gridCellSize));
    const maxRow = Math.min(this.gridRows - 1, Math.floor((box.y + box.height) / this.gridCellSize));
    return { minCol, maxCol, minRow, maxRow };
  }

  insert(box) {
    const { minCol, maxCol, minRow, maxRow } = this._cellRange(box);
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        this.cells[r * this.gridCols + c].push(box);
      }
    }
    // Also insert wrapped copies for boxes near edges
    if (box.x + box.width > this.atlasWidth) {
      const wrapped = { ...box, x: box.x - this.atlasWidth };
      const wr = this._cellRange(wrapped);
      for (let r = wr.minRow; r <= wr.maxRow; r++) {
        for (let c = Math.max(0, wr.minCol); c <= Math.min(this.gridCols - 1, wr.maxCol); c++) {
          this.cells[r * this.gridCols + c].push(box);
        }
      }
    }
  }

  queryOverlap(bounds) {
    const { minCol, maxCol, minRow, maxRow } = this._cellRange(bounds);
    const seen = new Set();
    const results = [];
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        for (const box of this.cells[r * this.gridCols + c]) {
          if (!seen.has(box)) {
            seen.add(box);
            results.push(box);
          }
        }
      }
    }
    return results;
  }
}

/**
 * Compute a priority score for a star label. Higher = placed first.
 */
export function getLabelPriority(star) {
  const nameWeight = Math.max(1, (star.displayName || '').length * 0.05);
  const sizeWeight = star.displayLabelSize !== undefined ? star.displayLabelSize : (star.displaySize || 1);
  const magWeight = Number.isFinite(star.absoluteMagnitude) ? (8 - star.absoluteMagnitude) * 0.35 : 0;
  return sizeWeight * 2 + magWeight + nameWeight;
}

/**
 * Find the best label position for a star, avoiding overlap with already-placed
 * labels and other visible stars. Returns null if no acceptable placement exists.
 */
export function computeUvLabelPlacement(ctx, star, visibleStarAnchors, placedBoxes, spatialIndex) {
  const starPos = getStarEquirectangularPosition(star);
  const atlasWidth = getAtlasWidth();
  const atlasHeight = getAtlasHeight();
  const starPx = {
    x: ((starPos.x / EQUIRECT_WIDTH) + 0.5) * atlasWidth,
    y: (0.5 - (starPos.y / EQUIRECT_HEIGHT)) * atlasHeight
  };
  const labelSize = star.displayLabelSize !== undefined ? star.displayLabelSize : star.displaySize;
  const fontSize = Math.round(THREE.MathUtils.clamp(10 + labelSize * 4, 10, 28));
  const paddingX = 8;
  const textHeight = Math.max(fontSize + 4, 14);
  ctx.font = `${fontSize}px Oswald`;
  const textWidth = ctx.measureText(star.displayName).width;

  const baseRadius = THREE.MathUtils.clamp((star.displaySize || 1) * 2.8 + 10, 12, 30);
  const directions = [
    new THREE.Vector2(1, 0),
    new THREE.Vector2(-1, 0),
    new THREE.Vector2(0.84, -0.54),
    new THREE.Vector2(0.84, 0.54),
    new THREE.Vector2(-0.84, -0.54),
    new THREE.Vector2(-0.84, 0.54),
    new THREE.Vector2(0, -1),
    new THREE.Vector2(0, 1)
  ];
  const radii = [baseRadius, baseRadius + 8, baseRadius + 16, baseRadius + 24];

  let best = null;
  for (const radius of radii) {
    for (const dir of directions) {
      const candidate = evaluateUvLabelCandidate({
        starPx,
        dir,
        radius,
        textWidth,
        textHeight,
        paddingX,
        fontSize,
        visibleStarAnchors,
        placedBoxes,
        spatialIndex
      });
      if (!candidate) continue;
      if (!best || candidate.score < best.score) {
        best = candidate;
      }
    }
  }

  if (!best) return null;

  const starUv = { u: starPx.x / atlasWidth, v: starPx.y / atlasHeight };
  const anchorUv = { u: best.anchorX / atlasWidth, v: best.anchorY / atlasHeight };
  const endUv = { u: unwrapUvAroundReference(starUv.u, anchorUv.u), v: anchorUv.v };

  return {
    fontSize,
    drawX: best.drawX,
    drawY: best.drawY,
    bounds: best.bounds,
    starPx,
    connector: {
      startUv: starUv,
      endUv
    }
  };
}

/**
 * Score a single label candidate position. Lower score = better placement.
 */
export function evaluateUvLabelCandidate({ starPx, dir, radius, textWidth, textHeight, paddingX, fontSize, visibleStarAnchors, placedBoxes, spatialIndex }) {
  const atlasHeight = getAtlasHeight();
  const anchorXRaw = starPx.x + dir.x * radius;
  const anchorY = THREE.MathUtils.clamp(starPx.y + dir.y * radius, LABEL_MARGIN_Y + textHeight * 0.5, atlasHeight - LABEL_MARGIN_Y - textHeight * 0.5);
  const preferRight = dir.x >= 0;
  const drawXRaw = preferRight ? (anchorXRaw + paddingX) : (anchorXRaw - paddingX - textWidth);
  const drawX = wrapPixelX(drawXRaw);
  const drawY = anchorY;
  const bounds = {
    x: drawX,
    y: drawY - textHeight * 0.5,
    width: textWidth,
    height: textHeight
  };

  let overlapPenalty = 0;
  const candidates = spatialIndex ? spatialIndex.queryOverlap(bounds) : placedBoxes;
  for (const box of candidates) {
    if (boxesOverlapWrapped(bounds, box)) overlapPenalty += 5000;
  }

  let starPenalty = 0;
  const expandedBounds = {
    x: bounds.x - 5,
    y: bounds.y - 4,
    width: bounds.width + 10,
    height: bounds.height + 8
  };
  for (const anchor of visibleStarAnchors) {
    if (anchor.x === starPx.x && anchor.y === starPx.y) continue;
    if (pointInWrappedRect(anchor.x, anchor.y, expandedBounds)) {
      starPenalty += 220;
    }
  }

  const verticalPenalty = Math.abs(anchorY - starPx.y) * 0.28;
  const radialPenalty = radius * 0.9;
  const sideBias = dir.x < 0 ? 6 : 0;
  const polarPenalty = (anchorY < 70 || anchorY > atlasHeight - 70) ? 40 : 0;
  const score = overlapPenalty + starPenalty + verticalPenalty + radialPenalty + sideBias + polarPenalty;

  return {
    score,
    anchorX: wrapPixelX(anchorXRaw),
    anchorY,
    drawX,
    drawY,
    bounds
  };
}
