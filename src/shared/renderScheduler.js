let renderRequester = null;

export function scheduleAnimationFrame(callback, globalRef = globalThis) {
  const requestFrame = globalRef?.requestAnimationFrame;
  if (typeof requestFrame === 'function') {
    return requestFrame.call(globalRef, callback);
  }

  const setTimeoutFn = typeof globalRef?.setTimeout === 'function'
    ? globalRef.setTimeout.bind(globalRef)
    : setTimeout;
  return setTimeoutFn(() => callback(Date.now()), 16);
}

export function scheduleAfterPaint(callback, globalRef = globalThis) {
  return scheduleAnimationFrame(() => {
    const setTimeoutFn = typeof globalRef?.setTimeout === 'function'
      ? globalRef.setTimeout.bind(globalRef)
      : setTimeout;
    setTimeoutFn(callback, 0);
  }, globalRef);
}

export function cancelScheduledAnimationFrame(handle, globalRef = globalThis) {
  if (handle === undefined || handle === null) return;

  const cancelFrame = globalRef?.cancelAnimationFrame;
  if (typeof cancelFrame === 'function') {
    cancelFrame.call(globalRef, handle);
    return;
  }

  const clearTimeoutFn = typeof globalRef?.clearTimeout === 'function'
    ? globalRef.clearTimeout.bind(globalRef)
    : clearTimeout;
  clearTimeoutFn(handle);
}

export function setRenderRequester(requester) {
  renderRequester = typeof requester === 'function' ? requester : null;
}

export function requestRenderIfAvailable(targets) {
  if (renderRequester) {
    renderRequester(targets);
  }
}
