/**
 * @file Caching layer for dust cloud data files.
 * Provides bounded LRU-style cache with proper error handling.
 */

/** Maximum number of cloud data files to cache. */
const MAX_CACHE_SIZE = 50;

/** @type {Map<string, Array>} URL → parsed cloud data. */
const dataCache = new Map();

/**
 * Loads cloud data from a URL, returning a cached copy if available.
 * Implements a simple size-bounded cache that evicts the oldest entry when full.
 * @param {string} fileUrl - URL to the cloud data JSON file.
 * @returns {Promise<Array>} Parsed cloud data array.
 * @throws {Error} If the fetch fails or returns non-OK status.
 */
export async function loadCachedCloudData(fileUrl) {
  if (dataCache.has(fileUrl)) {
    return dataCache.get(fileUrl);
  }

  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to load cloud data from ${fileUrl}: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Evict oldest entry if cache is full
  if (dataCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = dataCache.keys().next().value;
    dataCache.delete(oldestKey);
  }

  dataCache.set(fileUrl, data);
  return data;
}

/**
 * Clears the entire cloud data cache.
 */
export function clearCloudDataCache() {
  dataCache.clear();
}
