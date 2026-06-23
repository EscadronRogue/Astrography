export const MAX_RENDER_PIXEL_RATIO = 2;

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function getClampedDevicePixelRatio(maxRatio = MAX_RENDER_PIXEL_RATIO) {
  const ratio = positiveNumber(globalThis.window?.devicePixelRatio)
    || positiveNumber(globalThis.devicePixelRatio)
    || 1;
  return Math.min(ratio, maxRatio);
}

export function getCanvasDisplaySize(canvas, fallback = {}) {
  const rect = canvas?.getBoundingClientRect?.();
  const width = positiveNumber(canvas?.clientWidth)
    || positiveNumber(rect?.width)
    || positiveNumber(canvas?.width)
    || positiveNumber(fallback.width)
    || 1;
  const height = positiveNumber(canvas?.clientHeight)
    || positiveNumber(rect?.height)
    || positiveNumber(canvas?.height)
    || positiveNumber(fallback.height)
    || 1;

  return {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height))
  };
}

export function configureRendererForCanvas(renderer, canvas, options = {}) {
  const size = getCanvasDisplaySize(canvas, options.fallbackSize);
  renderer.setPixelRatio?.(getClampedDevicePixelRatio(options.maxPixelRatio));
  renderer.setSize(size.width, size.height, false);
  return size;
}
