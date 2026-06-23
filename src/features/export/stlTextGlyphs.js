export const DIGIT_WIDTH_UNITS = 1;
export const DIGIT_HEIGHT_UNITS = 1;
export const DIGIT_SPACING_UNITS = 0.22;
export const DIGIT_LINE_SPACING_UNITS = 0.3;
export const STAR_STROKE_WIDTH_UNITS = 0.16;
export const LABEL_STROKE_WIDTH_UNITS = 0.28;
export const STROKE_SEGMENT_OVERLAP_UNITS = 0.06;

export const VECTOR_GLYPHS = Object.freeze({
  '0': [
    [[0.24, 0.02], [0.08, 0.18], [0.08, 0.82], [0.24, 0.98], [0.76, 0.98], [0.92, 0.82], [0.92, 0.18], [0.76, 0.02], [0.24, 0.02]]
  ],
  '1': [
    [[0.3, 0.78], [0.5, 0.98], [0.5, 0.02]],
    [[0.24, 0.02], [0.76, 0.02]]
  ],
  '2': [
    [[0.1, 0.78], [0.24, 0.98], [0.76, 0.98], [0.9, 0.8], [0.9, 0.62], [0.12, 0.02], [0.9, 0.02]]
  ],
  '3': [
    [[0.1, 0.98], [0.78, 0.98], [0.56, 0.56], [0.78, 0.48], [0.92, 0.28], [0.76, 0.02], [0.14, 0.02]]
  ],
  '4': [
    [[0.78, 0.02], [0.78, 0.98]],
    [[0.12, 0.34], [0.9, 0.34]],
    [[0.12, 0.34], [0.58, 0.98]]
  ],
  '5': [
    [[0.9, 0.98], [0.18, 0.98], [0.14, 0.54], [0.72, 0.54], [0.9, 0.38], [0.9, 0.16], [0.72, 0.02], [0.14, 0.02]]
  ],
  '6': [
    [[0.86, 0.84], [0.72, 0.98], [0.24, 0.98], [0.08, 0.8], [0.08, 0.18], [0.24, 0.02], [0.78, 0.02], [0.92, 0.18], [0.92, 0.42], [0.76, 0.56], [0.24, 0.56], [0.08, 0.42]]
  ],
  '7': [
    [[0.08, 0.98], [0.92, 0.98], [0.34, 0.02]]
  ],
  '8': [
    [[0.24, 0.02], [0.08, 0.18], [0.08, 0.4], [0.24, 0.56], [0.76, 0.56], [0.92, 0.4], [0.92, 0.18], [0.76, 0.02], [0.24, 0.02]],
    [[0.24, 0.56], [0.08, 0.72], [0.08, 0.82], [0.24, 0.98], [0.76, 0.98], [0.92, 0.82], [0.92, 0.72], [0.76, 0.56]]
  ],
  '9': [
    [[0.92, 0.56], [0.76, 0.42], [0.24, 0.42], [0.08, 0.58], [0.08, 0.82], [0.24, 0.98], [0.76, 0.98], [0.92, 0.82], [0.92, 0.18], [0.74, 0.02], [0.28, 0.02]]
  ],
  '-': [
    [[0.15, 0.50], [0.85, 0.50]]
  ]
});

function splitBalanced(text, parts) {
  const lines = [];
  let index = 0;

  for (let part = 0; part < parts; part += 1) {
    const remainingChars = text.length - index;
    const remainingParts = parts - part;
    const size = Math.ceil(remainingChars / remainingParts);
    lines.push(text.slice(index, index + size));
    index += size;
  }

  return lines.filter(Boolean);
}

export function layoutDigits(text) {
  if (text.length <= 2) return [text];
  if (text.length <= 4) return splitBalanced(text, 2);
  return splitBalanced(text, 3);
}

export function getGlyphLineMetrics(lines) {
  return {
    maxWidthUnits: Math.max(
      ...lines.map(line => line.length * DIGIT_WIDTH_UNITS + Math.max(0, line.length - 1) * DIGIT_SPACING_UNITS)
    ),
    totalHeightUnits: lines.length * DIGIT_HEIGHT_UNITS
      + Math.max(0, lines.length - 1) * DIGIT_LINE_SPACING_UNITS
  };
}
