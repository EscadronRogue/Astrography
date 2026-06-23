import * as THREE from '../vendor/three.js';
import { GLOBE_RADIUS } from '../shared/constants.js';
import { spherePositionToUv } from '../shared/uvUtils.js';
import { clamp01, rgbaFromHex } from './uvCanvasLayers.js';
import { splitWrappedSegment, strokeUvSegment } from './uvAtlasDrawing.js';

export function drawUvCloudsOverlay(ctx, {
  sourceScene = null,
  showClouds = false,
  cloudOpacity = 1
} = {}) {
  const overlays = sourceScene?.userData?.cloudOverlays;
  if (!showClouds || !Array.isArray(overlays)) return;

  const opacity = clamp01(cloudOpacity);
  if (opacity <= 0.001) return;

  overlays.forEach(lineSegments => {
    const position = lineSegments?.geometry?.getAttribute?.('position');
    if (!position) return;

    const color = lineSegments.material?.color
      ? `#${lineSegments.material.color.getHexString()}`
      : '#ff6600';
    const alpha = clamp01((lineSegments.material?.opacity ?? 0.8) * opacity);
    if (alpha <= 0.001) return;

    ctx.save();
    ctx.strokeStyle = rgbaFromHex(color, alpha);
    ctx.lineWidth = 1.6;
    const startPoint = new THREE.Vector3();
    const endPoint = new THREE.Vector3();
    for (let i = 0; i <= position.count - 2; i += 2) {
      startPoint.fromBufferAttribute(position, i);
      endPoint.fromBufferAttribute(position, i + 1);
      const startUv = spherePositionToUv(startPoint, GLOBE_RADIUS);
      const endUv = spherePositionToUv(endPoint, GLOBE_RADIUS);
      splitWrappedSegment(startUv, endUv).forEach(([start, end]) => {
        strokeUvSegment(ctx, start, end);
      });
    }
    ctx.restore();
  });
}
