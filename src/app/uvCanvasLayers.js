import { getAtlasDimensions } from './uvAtlasConfig.js';
import { clamp01, hexToRgbaString } from '../shared/colorParsing.js';

export { clamp01 };

export function rgbaFromHex(hex, alpha = 1) {
  return hexToRgbaString(hex, alpha);
}

export function createLayerCanvas(documentRef = globalThis.document) {
  const canvas = documentRef?.createElement?.('canvas');
  if (!canvas) {
    throw new Error('Canvas document is unavailable');
  }
  const { width, height } = getAtlasDimensions();
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) {
    throw new Error('2D canvas context unavailable');
  }
  return { canvas, ctx };
}
