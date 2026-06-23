export function createAbortError() {
  const error = new Error('STL kit export cancelled.');
  error.name = 'AbortError';
  return error;
}

export function assertNotAborted(signal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

export function yieldToBrowser(signal) {
  assertNotAborted(signal);
  return new Promise((resolve, reject) => {
    let timeoutId = null;
    const cleanup = () => signal?.removeEventListener?.('abort', onAbort);
    const onAbort = () => {
      if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
      cleanup();
      reject(createAbortError());
    };

    signal?.addEventListener?.('abort', onAbort, { once: true });
    timeoutId = globalThis.setTimeout(() => {
      cleanup();
      resolve();
    }, 0);
  });
}

export function reportExportProgress(options, progress, label) {
  if (typeof options?.onProgress !== 'function') return;
  options.onProgress({
    progress: Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0)),
    label
  });
}

export function reportBuildProgress(options, progress, label) {
  if (typeof options?.onBuildProgress !== 'function') return;
  options.onBuildProgress({
    progress: Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0)),
    label
  });
}
