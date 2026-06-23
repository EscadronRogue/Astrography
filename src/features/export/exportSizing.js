import { EXPORT_MAX_TILE_SIZE, EXPORT_TARGET_WIDTH } from '../../shared/constants.js';
import { getCanvasDisplaySize } from '../../shared/canvasSizing.js';

export const DEFAULT_MOLLWEIDE_VIEW_BOX = { minX: -200, minY: -100, width: 400, height: 200 };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

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

export function getMollweideCropPixels(rect, canvas, baseWidth, baseHeight) {
  if (!rect || rect.width < 2 || rect.height < 2) {
    return { cropX: 0, cropY: 0, cropW: baseWidth, cropH: baseHeight };
  }

  const safeBaseWidth = Math.max(1, Math.round(baseWidth));
  const safeBaseHeight = Math.max(1, Math.round(baseHeight));
  const displaySize = getCanvasDisplaySize(canvas, { width: baseWidth, height: baseHeight });
  const scaleX = safeBaseWidth / displaySize.width;
  const scaleY = safeBaseHeight / displaySize.height;
  const cropX = clamp(Math.round(rect.x * scaleX), 0, safeBaseWidth - 1);
  const cropY = clamp(Math.round(rect.y * scaleY), 0, safeBaseHeight - 1);
  const cropRight = clamp(Math.round((rect.x + rect.width) * scaleX), cropX + 1, safeBaseWidth);
  const cropBottom = clamp(Math.round((rect.y + rect.height) * scaleY), cropY + 1, safeBaseHeight);

  return {
    cropX,
    cropY,
    cropW: cropRight - cropX,
    cropH: cropBottom - cropY
  };
}

export function getMollweideSvgViewBox(rect, canvas, frustumSize, cameraPosition = {}) {
  if (!rect || rect.width < 2 || rect.height < 2) {
    return { ...DEFAULT_MOLLWEIDE_VIEW_BOX };
  }

  const displaySize = getCanvasDisplaySize(canvas);
  const aspect = displaySize.width / displaySize.height;
  const viewWidth = frustumSize * aspect;
  const viewHeight = frustumSize;
  const camX = Number.isFinite(cameraPosition.x) ? cameraPosition.x : 0;
  const camY = Number.isFinite(cameraPosition.y) ? cameraPosition.y : 0;
  const leftWorld = camX - viewWidth / 2 + (rect.x / displaySize.width) * viewWidth;
  const topWorld = camY + viewHeight / 2 - (rect.y / displaySize.height) * viewHeight;

  return {
    minX: leftWorld,
    minY: -topWorld,
    width: (rect.width / displaySize.width) * viewWidth,
    height: (rect.height / displaySize.height) * viewHeight
  };
}
