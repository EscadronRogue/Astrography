import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';

export const CONSTELLATION_LINE_COLOR = 0x5e98ff;
export const CONSTELLATION_LINE_RGBA = { r: 94, g: 152, b: 255 };
export const CONSTELLATION_LABEL_FILL = '#dce8ff';
export const CONSTELLATION_LABEL_STROKE = '#163b6a';
export const CONSTELLATION_LABEL_SHADOW = 'rgba(94, 152, 255, 0.75)';

export function makeConstellationLineColor() {
  return new THREE.Color(CONSTELLATION_LINE_COLOR);
}

export function constellationLineCss(opacity = 1) {
  const a = Math.max(0, Math.min(1, opacity));
  return `rgba(${CONSTELLATION_LINE_RGBA.r}, ${CONSTELLATION_LINE_RGBA.g}, ${CONSTELLATION_LINE_RGBA.b}, ${a})`;
}

export function applyCanvasConstellationLabelStyle(ctx, opacity = 1) {
  const a = Math.max(0, Math.min(1, opacity));
  ctx.font = '20px Oswald';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = 5;
  ctx.strokeStyle = withAlpha(CONSTELLATION_LABEL_STROKE, Math.min(1, a * 0.95));
  ctx.fillStyle = withAlpha(CONSTELLATION_LABEL_FILL, a);
  ctx.shadowColor = `rgba(${CONSTELLATION_LINE_RGBA.r}, ${CONSTELLATION_LINE_RGBA.g}, ${CONSTELLATION_LINE_RGBA.b}, ${Math.min(1, a * 0.65)})`;
  ctx.shadowBlur = 8;
}

export function createConstellationLabelCanvas(text, opacity = 1, fontSize = 300) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  ctx.font = `${fontSize}px Oswald`;
  const metrics = ctx.measureText(text);
  const paddingX = Math.ceil(fontSize * 0.18);
  const paddingY = Math.ceil(fontSize * 0.2);
  const textWidth = Math.ceil(metrics.width);
  canvas.width = textWidth + paddingX * 2;
  canvas.height = Math.ceil(fontSize * 1.2) + paddingY * 2;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `${fontSize}px Oswald`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = Math.ceil(fontSize * 0.12);
  ctx.strokeStyle = withAlpha(CONSTELLATION_LABEL_STROKE, Math.min(1, opacity * 0.95));
  ctx.fillStyle = withAlpha(CONSTELLATION_LABEL_FILL, opacity);
  ctx.shadowColor = `rgba(${CONSTELLATION_LINE_RGBA.r}, ${CONSTELLATION_LINE_RGBA.g}, ${CONSTELLATION_LINE_RGBA.b}, ${Math.min(1, opacity * 0.65)})`;
  ctx.shadowBlur = Math.ceil(fontSize * 0.1);

  const x = canvas.width / 2;
  const y = canvas.height / 2;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  return canvas;
}

function withAlpha(hexColor, opacity) {
  const { r, g, b } = hexToRgb(hexColor);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacity))})`;
}

function hexToRgb(hexColor) {
  const normalized = String(hexColor).replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map(c => c + c).join('')
    : normalized.padEnd(6, '0').slice(0, 6);
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}
