let cachedWebGLAvailable = null;

export function isWebGLAvailable(documentRef = globalThis.document) {
  if (!documentRef?.createElement) return false;
  if (documentRef === globalThis.document && cachedWebGLAvailable !== null) {
    return cachedWebGLAvailable;
  }

  let available = false;
  try {
    const canvas = documentRef.createElement('canvas');
    const context =
      canvas.getContext?.('webgl2') ||
      canvas.getContext?.('webgl') ||
      canvas.getContext?.('experimental-webgl');
    available = Boolean(context);
    context?.getExtension?.('WEBGL_lose_context')?.loseContext?.();
  } catch {
    available = false;
  }

  if (documentRef === globalThis.document) cachedWebGLAvailable = available;
  return available;
}

export function assertWebGLAvailable(documentRef = globalThis.document) {
  if (!isWebGLAvailable(documentRef)) {
    throw new Error('WebGL is unavailable in this browser or graphics environment.');
  }
}

export function addWebGLContextLossHandlers(canvas, { onLost, onRestored } = {}) {
  if (!canvas?.addEventListener || !canvas?.removeEventListener) return () => {};

  const handleLost = event => {
    event.preventDefault?.();
    onLost?.(event);
  };
  const handleRestored = event => {
    onRestored?.(event);
  };

  canvas.addEventListener('webglcontextlost', handleLost, false);
  canvas.addEventListener('webglcontextrestored', handleRestored, false);

  return () => {
    canvas.removeEventListener('webglcontextlost', handleLost, false);
    canvas.removeEventListener('webglcontextrestored', handleRestored, false);
  };
}
