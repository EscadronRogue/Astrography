import { DATA_LOAD_TIMEOUT } from '../shared/constants.js';

export async function fetchWithTimeout(url, { timeoutMs = DATA_LOAD_TIMEOUT, ...options } = {}) {
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Data load timed out after ${timeoutMs}ms: ${url}`);
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timer);
  }
}
