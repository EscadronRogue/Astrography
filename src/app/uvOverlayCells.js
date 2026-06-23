import { ATLAS_HEIGHT, ATLAS_WIDTH, GLOBE_RADIUS } from '../shared/constants.js';
import { clamp01 } from './uvCanvasLayers.js';

function hasFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

export function getOverlayCellRaDec(cell) {
  if (!hasFiniteNumber(cell?.raRad) || !hasFiniteNumber(cell?.decRad)) return null;
  return { ra: Number(cell.raRad), dec: Number(cell.decRad) };
}

export function getOverlayCellUv(cell, {
  raDecToUV,
  spherePositionToUv,
  sphereRadius = GLOBE_RADIUS
} = {}) {
  const raDec = getOverlayCellRaDec(cell);
  if (raDec) return raDecToUV?.(raDec.ra, raDec.dec) || null;

  const position = cell?.globeMesh?.position;
  if (!position) return null;
  return spherePositionToUv?.(position, sphereRadius) || null;
}

export function getOverlayCellAtlasPoint(cell, projectors) {
  const uv = getOverlayCellUv(cell, projectors);
  if (!uv) return null;
  return {
    u: uv.u,
    v: uv.v,
    x: uv.u * ATLAS_WIDTH,
    y: uv.v * ATLAS_HEIGHT
  };
}

export function getOverlayMaterial(cell, meshKey = 'tcMesh') {
  return cell?.[meshKey]?.material || null;
}

export function getOverlayCellColor(cell, meshKey = 'tcMesh', fallback = '#ffffff') {
  const color = getOverlayMaterial(cell, meshKey)?.color;
  return color?.getHexString ? `#${color.getHexString()}` : fallback;
}

export function getOverlayCellOpacity(cell, meshKey = 'tcMesh', fallback = 0) {
  const opacity = getOverlayMaterial(cell, meshKey)?.opacity;
  return hasFiniteNumber(opacity) ? Number(opacity) : fallback;
}

export function getOverlayCellAlpha(cell, {
  meshKey = 'tcMesh',
  fallbackOpacity = 0,
  opacityFactor = 1
} = {}) {
  return clamp01(getOverlayCellOpacity(cell, meshKey, fallbackOpacity) * opacityFactor);
}

export function getAverageOverlayAlpha(cell1, cell2, {
  meshKey = 'tcMesh',
  opacityFactor = 1
} = {}) {
  const avg = (getOverlayCellOpacity(cell1, meshKey, 0) + getOverlayCellOpacity(cell2, meshKey, 0)) / 2;
  return clamp01(avg * opacityFactor);
}

export function getOverlayDistanceRatio(cell, maxDistance, fallback = 0.5) {
  const length = cell?.tcPos?.length?.();
  const distance = hasFiniteNumber(length) ? Number(length) : null;
  const limit = hasFiniteNumber(maxDistance) && Number(maxDistance) > 0 ? Number(maxDistance) : null;
  if (distance === null || limit === null) return fallback;
  return clamp01(distance / limit);
}

export function getScaledOverlayRadius(cell, overlay, {
  minRadius,
  radiusFactor,
  maxDistance = overlay?.maxDistance,
  fallbackDistanceRatio = 0.5
}) {
  const gridSize = hasFiniteNumber(overlay?.gridSize) ? Number(overlay.gridSize) : 0;
  const distRatio = getOverlayDistanceRatio(cell, maxDistance, fallbackDistanceRatio);
  const distanceScale = 12 + (1 - 12) * distRatio;
  return Math.max(minRadius, gridSize * distanceScale * radiusFactor);
}
