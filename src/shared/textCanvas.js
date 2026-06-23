export function parseFontPixelSize(font, fallback = 16) {
  const match = String(font || '').match(/(\d+(?:\.\d+)?)px/);
  const size = match ? Number(match[1]) : fallback;
  return Number.isFinite(size) && size > 0 ? size : fallback;
}

export function createMeasuredTextCanvas(text, options = {}) {
  const {
    documentRef = globalThis.document,
    font = '16px sans-serif',
    paddingX = 10,
    paddingY = 5,
    height = parseFontPixelSize(font) + paddingY * 2,
    fillStyle = '#ffffff',
    textBaseline = 'middle',
    textAlign = 'left',
    textX = paddingX,
    textY = textBaseline === 'middle' ? height / 2 : parseFontPixelSize(font),
    draw
  } = options;

  const canvas = documentRef?.createElement?.('canvas');
  const ctx = canvas?.getContext?.('2d');
  if (!canvas || !ctx) {
    throw new Error('2D canvas context unavailable');
  }

  ctx.font = font;
  const metrics = ctx.measureText(String(text ?? ''));
  canvas.width = metrics.width + paddingX * 2;
  canvas.height = height;

  ctx.font = font;
  ctx.fillStyle = fillStyle;
  ctx.textBaseline = textBaseline;
  ctx.textAlign = textAlign;

  if (typeof draw === 'function') {
    draw(ctx, canvas, { metrics, textX, textY });
  } else {
    ctx.fillText(String(text ?? ''), textX, textY);
  }

  return { canvas, ctx, metrics, textX, textY };
}
