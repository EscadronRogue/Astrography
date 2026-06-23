import { galacticToEquatorial, eclipticToEquatorial } from '../features/planes/planeDefinitions.js';
import { normalizeRightAscension, raDecToUV } from '../shared/uvUtils.js';
import { clamp01, rgbaFromHex } from './uvCanvasLayers.js';
import { splitWrappedSegment, strokeUvSegment } from './uvAtlasDrawing.js';

const TAU = Math.PI * 2;
const PLANE_SAMPLES = 256;

export function drawUvEquatorialCurve(ctx, curveFn, color, opacity) {
  ctx.save();
  ctx.strokeStyle = rgbaFromHex(color, opacity * 0.95);
  ctx.lineWidth = 2.25;
  let prev = null;
  for (let i = 0; i <= PLANE_SAMPLES; i += 1) {
    const t = (i / PLANE_SAMPLES) * TAU;
    const coordinates = curveFn(t);
    const current = raDecToUV(coordinates.ra, coordinates.dec);
    if (prev) {
      splitWrappedSegment(prev, current).forEach(([start, end]) => strokeUvSegment(ctx, start, end));
    }
    prev = current;
  }
  ctx.restore();
}

export function drawUvPlanes(ctx, state = {}, planeOpacity = 0.5) {
  const opacity = clamp01(planeOpacity);
  if (opacity <= 0.001) return;

  if (state.showGalacticPlaneFlag) {
    drawUvEquatorialCurve(ctx, angle => galacticToEquatorial(angle, 0), '#7effb2', opacity);
  }
  if (state.showEclipticPlaneFlag) {
    drawUvEquatorialCurve(ctx, angle => eclipticToEquatorial(angle, 0), '#ffcb6b', opacity);
  }
  if (state.showCelestialEquatorFlag) {
    drawUvEquatorialCurve(ctx, angle => ({ ra: normalizeRightAscension(angle), dec: 0 }), '#8fb5ff', opacity);
  }
}
