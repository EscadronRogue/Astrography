import * as THREE from '../../vendor/three.js';
import { clamp01, hexToRgbaString } from '../../shared/colorParsing.js';

export const CONSTELLATION_LINE_COLOR = 0x5e98ff;
export const CONSTELLATION_LINE_RGBA = { r: 94, g: 152, b: 255 };
export const CONSTELLATION_LABEL_FILL = '#a9c4ee';
export const CONSTELLATION_LABEL_STROKE = '#0b1930';
export const CONSTELLATION_LABEL_SHADOW = 'rgba(94, 152, 255, 0.18)';
const labelMeasurementCache = new Map();

export function makeConstellationLineColor() {
  return new THREE.Color(CONSTELLATION_LINE_COLOR);
}

export function constellationLineCss(opacity = 1) {
  const a = clamp01(opacity);
  return `rgba(${CONSTELLATION_LINE_RGBA.r}, ${CONSTELLATION_LINE_RGBA.g}, ${CONSTELLATION_LINE_RGBA.b}, ${a})`;
}

export function applyCanvasConstellationLabelStyle(ctx, opacity = 1) {
  const a = clamp01(opacity);
  ctx.font = '300 18px "Cormorant Garamond", "Times New Roman", serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = withAlpha(CONSTELLATION_LABEL_STROKE, Math.min(1, a * 0.95));
  ctx.fillStyle = withAlpha(CONSTELLATION_LABEL_FILL, a);
  ctx.shadowColor = `rgba(${CONSTELLATION_LINE_RGBA.r}, ${CONSTELLATION_LINE_RGBA.g}, ${CONSTELLATION_LINE_RGBA.b}, ${clamp01(a * 0.65)})`;
  ctx.shadowBlur = 2;
}

export function createConstellationLabelCanvas(text, opacity = 1, fontSize = 300) {
  const a = clamp01(opacity);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  const { canvasWidth, canvasHeight, font } = measureConstellationLabelCanvasBox(text, fontSize);
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = Math.max(1, Math.ceil(fontSize * 0.028));
  ctx.strokeStyle = withAlpha(CONSTELLATION_LABEL_STROKE, clamp01(a * 0.95));
  ctx.fillStyle = withAlpha(CONSTELLATION_LABEL_FILL, a);
  ctx.shadowColor = `rgba(${CONSTELLATION_LINE_RGBA.r}, ${CONSTELLATION_LINE_RGBA.g}, ${CONSTELLATION_LINE_RGBA.b}, ${clamp01(a * 0.65)})`;
  ctx.shadowBlur = Math.ceil(fontSize * 0.02);

  const x = canvas.width / 2;
  const y = canvas.height / 2;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  return canvas;
}

export function measureConstellationLabelWorldSize(text, fontSize = 300) {
  const { canvasWidth, canvasHeight } = measureConstellationLabelCanvasBox(text, fontSize);
  return {
    width: canvasWidth / 100,
    height: canvasHeight / 100
  };
}

function measureConstellationLabelCanvasBox(text, fontSize) {
  const cacheKey = `${fontSize}|${text}`;
  if (labelMeasurementCache.has(cacheKey)) {
    return labelMeasurementCache.get(cacheKey);
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  const font = `300 ${fontSize}px "Cormorant Garamond", "Times New Roman", serif`;
  ctx.font = font;
  const metrics = ctx.measureText(text);
  const paddingX = Math.ceil(fontSize * 0.16);
  const paddingY = Math.ceil(fontSize * 0.12);
  const canvasWidth = Math.ceil(metrics.width) + paddingX * 2;
  const canvasHeight = Math.ceil(fontSize * 1.2) + paddingY * 2;
  const box = { canvasWidth, canvasHeight, font };
  labelMeasurementCache.set(cacheKey, box);
  return box;
}

function withAlpha(hexColor, opacity) {
  return hexToRgbaString(hexColor, opacity);
}
