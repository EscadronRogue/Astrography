function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  return globalThis.localStorage;
}

function reportStorageError(onError, error) {
  if (typeof onError === 'function') {
    onError(error);
  }
}

export function readStorageItem(key, { storage, fallback = null, onError } = {}) {
  try {
    const target = resolveStorage(storage);
    if (!target || typeof target.getItem !== 'function') return fallback;
    const value = target.getItem(key);
    return value === null || value === undefined ? fallback : value;
  } catch (error) {
    reportStorageError(onError, error);
    return fallback;
  }
}

export function writeStorageItem(key, value, { storage, onError } = {}) {
  try {
    const target = resolveStorage(storage);
    if (!target || typeof target.setItem !== 'function') return false;
    target.setItem(key, value);
    return true;
  } catch (error) {
    reportStorageError(onError, error);
    return false;
  }
}

export function removeStorageItem(key, { storage, onError } = {}) {
  try {
    const target = resolveStorage(storage);
    if (!target || typeof target.removeItem !== 'function') return false;
    target.removeItem(key);
    return true;
  } catch (error) {
    reportStorageError(onError, error);
    return false;
  }
}
