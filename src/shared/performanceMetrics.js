const STORE_KEY = '__astrographyPerformance';
const MAX_STORED_MEASURES = 300;

function getNow() {
  return typeof globalThis.performance?.now === 'function'
    ? globalThis.performance.now()
    : Date.now();
}

function getStore() {
  if (!globalThis[STORE_KEY]) {
    Object.defineProperty(globalThis, STORE_KEY, {
      value: [],
      configurable: true,
      writable: true
    });
  }
  return globalThis[STORE_KEY];
}

function mark(name) {
  if (typeof globalThis.performance?.mark !== 'function') return;
  try {
    globalThis.performance.mark(name);
  } catch {
    // Performance marks are diagnostic only.
  }
}

function measure(name, startMark, endMark) {
  if (typeof globalThis.performance?.measure !== 'function') return;
  try {
    globalThis.performance.measure(name, startMark, endMark);
  } catch {
    // Performance measures are diagnostic only.
  }
}

export function startPerformanceMeasure(name, metadata = {}) {
  const start = getNow();
  const safeName = String(name || 'measure');
  const id = `${safeName}-${Math.round(start * 1000)}-${Math.random().toString(36).slice(2, 8)}`;
  const startMark = `${id}:start`;
  mark(startMark);
  return { name: safeName, start, startMark, metadata };
}

export function endPerformanceMeasure(token, metadata = {}) {
  if (!token) return null;
  const end = getNow();
  const endMark = `${token.startMark}:end`;
  mark(endMark);
  measure(token.name, token.startMark, endMark);

  const entry = {
    name: token.name,
    durationMs: Math.max(0, end - token.start),
    startTime: token.start,
    metadata: {
      ...(token.metadata || {}),
      ...(metadata || {})
    }
  };
  const store = getStore();
  store.push(entry);
  if (store.length > MAX_STORED_MEASURES) {
    store.splice(0, store.length - MAX_STORED_MEASURES);
  }
  return entry;
}

export function getStoredPerformanceMeasures() {
  return [...getStore()];
}
