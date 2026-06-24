import { EXPORT_MAX_TILE_SIZE, EXPORT_TARGET_WIDTH } from '../../shared/constants.js';
import { getCanvasDisplaySize } from '../../shared/canvasSizing.js';

export function getSceneSnapshotSize(manager) {
  const canvas = manager?.renderer?.domElement;
  if (!canvas && !manager?.canvas) {
    throw new Error('Map canvas has no exportable size.');
  }

  const { width: baseWidth, height: baseHeight } = getCanvasDisplaySize(manager?.canvas || canvas, {
    width: canvas?.width,
    height: canvas?.height
  });
  const aspect = baseWidth / baseHeight;
  const targetWidth = Math.min(EXPORT_TARGET_WIDTH, EXPORT_MAX_TILE_SIZE);
  const targetHeight = Math.max(1, Math.round(targetWidth / aspect));
  if (targetHeight <= EXPORT_MAX_TILE_SIZE) {
    return { width: targetWidth, height: targetHeight };
  }

  return {
    width: Math.max(1, Math.round(EXPORT_MAX_TILE_SIZE * aspect)),
    height: EXPORT_MAX_TILE_SIZE
  };
}
