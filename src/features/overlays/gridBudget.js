export const DEFAULT_OVERLAY_MAX_CELLS = 75000;

function normalizePositiveNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

export function estimateOverlayGridCells(maxDistance, gridSize) {
  const safeMaxDistance = Math.max(0, Number(maxDistance) || 0);
  const safeGridSize = normalizePositiveNumber(gridSize, 2);
  if (safeMaxDistance === 0) return 1;
  const halfExtent = Math.ceil(safeMaxDistance / safeGridSize) * safeGridSize;
  const axisCells = Math.floor((2 * halfExtent) / safeGridSize) + 1;
  return axisCells ** 3;
}

export function getBudgetedOverlayGridSettings(minDistance, maxDistance, requestedGridSize, options = {}) {
  const maxCells = Math.max(1, Math.floor(normalizePositiveNumber(options.maxCells, DEFAULT_OVERLAY_MAX_CELLS)));
  const safeMinDistance = Math.max(0, Number(minDistance) || 0);
  const safeMaxDistance = Math.max(safeMinDistance, Math.max(0, Number(maxDistance) || 0));
  const requested = normalizePositiveNumber(requestedGridSize, 2);
  let gridSize = requested;
  let estimatedCellCount = estimateOverlayGridCells(safeMaxDistance, gridSize);

  for (let guard = 0; estimatedCellCount > maxCells && guard < 16; guard += 1) {
    const scale = Math.max(1.05, Math.cbrt(estimatedCellCount / maxCells));
    gridSize *= scale;
    estimatedCellCount = estimateOverlayGridCells(safeMaxDistance, gridSize);
  }

  return {
    minDistance: safeMinDistance,
    maxDistance: safeMaxDistance,
    requestedGridSize: requested,
    gridSize,
    estimatedCellCount,
    maxCells,
    wasClamped: gridSize > requested + 1e-9
  };
}
