import { ATLAS_WIDTH, ATLAS_HEIGHT } from '../shared/constants.js';
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
  canvas.width = ATLAS_WIDTH;
  canvas.height = ATLAS_HEIGHT;
  const ctx = canvas.getContext?.('2d');
  if (!ctx) {
    throw new Error('2D canvas context unavailable');
  }
  return { canvas, ctx };
}
