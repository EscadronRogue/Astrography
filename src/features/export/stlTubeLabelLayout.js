import { STL_TUBE_RADIUS_MM } from './stlScale.js';
import { getGlyphLineMetrics } from './stlTextGlyphs.js';
import {
  vecCross,
  vecDot,
  vecLength,
  vecNormalise,
  vecScale,
  vecSub
} from './stlVectorMath.js';

export const TUBE_FLAT_WIDTH = 3.6;
export const TUBE_FLAT_END_MARGIN = 1.2;
export const LABEL_TEXT_WIDTH_FACTOR = 0.85;
export const LABEL_TEXT_HEIGHT_FACTOR = 0.78;

export function getTubeFlatLayout(tubeLength, tubeRadius = STL_TUBE_RADIUS_MM) {
  const flatWidth = Math.min(TUBE_FLAT_WIDTH, tubeRadius * 2 - 0.15);
  const flatLength = Math.max(0, tubeLength - 2 * TUBE_FLAT_END_MARGIN);
  if (flatLength < 2.5) return null;

  return {
    flatLength,
    flatWidth,
    surfaceZ: Math.sqrt(Math.max(0, tubeRadius * tubeRadius - (flatWidth * flatWidth) / 4))
  };
}

export function getTubeLabelMaxWidth(layout) {
  return layout.flatLength * LABEL_TEXT_WIDTH_FACTOR;
}

export function getTubeLabelMaxHeight(layout) {
  return layout.flatWidth * LABEL_TEXT_HEIGHT_FACTOR;
}

export function computeTubeLabelLayout(text, flatLayout) {
  if (!flatLayout) return null;

  const availableWidth = getTubeLabelMaxWidth(flatLayout);
  const availableHeight = getTubeLabelMaxHeight(flatLayout);
  const candidateLines = [[text]];
  let bestLayout = null;
  let bestScale = -Infinity;

  if (String(text).length > 1) {
    candidateLines.push(String(text).split('').map(ch => ch));
  }

  for (const lines of candidateLines) {
    const { maxWidthUnits, totalHeightUnits } = getGlyphLineMetrics(lines);
    const unitScale = Math.min(
      availableWidth / Math.max(maxWidthUnits, 1),
      availableHeight / Math.max(totalHeightUnits, 1)
    );

    if (Number.isFinite(unitScale) && unitScale > bestScale) {
      bestScale = unitScale;
      bestLayout = { ...flatLayout, lines };
    }
  }

  return bestLayout;
}

export function buildSegmentLabelBasis(direction, preferredUp = [0, 0, 1]) {
  let axisX = vecNormalise(...direction);
  let axisZ = vecSub(preferredUp, vecScale(axisX, vecDot(preferredUp, axisX)));

  if (vecLength(axisZ) < 1e-5) {
    const fallback = Math.abs(axisX[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    axisZ = vecSub(fallback, vecScale(axisX, vecDot(fallback, axisX)));
  }

  axisZ = vecNormalise(...axisZ);
  const axisY = vecNormalise(...vecCross(axisZ, axisX));
  axisZ = vecNormalise(...vecCross(axisX, axisY));

  return { axisX, axisY, axisZ };
}
