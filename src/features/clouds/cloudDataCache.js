/**
 * @file Caching layer for dust cloud data files.
 * Provides bounded LRU cache with response validation.
 */
import { fetchWithTimeout } from '../../data/fetchWithTimeout.js';
import { validateCloudData } from '../../data/dataValidation.js';

/** Maximum number of cloud data files to cache. */
const MAX_CACHE_SIZE = 50;

/** @type {Map<string, Array>} URL → parsed cloud data (insertion order = recency). */
const dataCache = new Map();

/**
 * Loads cloud data from a URL, returning a cached copy if available.
 * Implements true LRU: cache hits refresh recency, eviction drops the least-recently-used entry.
 * @param {string} fileUrl - URL to the cloud data JSON file.
 * @returns {Promise<Array>} Parsed cloud data array.
 * @throws {Error} If the fetch fails, returns non-OK status, or payload is not an array.
 */
export async function loadCachedCloudData(fileUrl) {
  if (dataCache.has(fileUrl)) {
    // Refresh recency: delete and re-insert to move to end of Map iteration order
    const cached = dataCache.get(fileUrl);
    dataCache.delete(fileUrl);
    dataCache.set(fileUrl, cached);
    return cached;
  }

  const response = await fetchWithTimeout(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to load cloud data from ${fileUrl}: ${response.status} ${response.statusText}`);
  }

  const data = validateCloudData(await response.json(), fileUrl);

  // Evict least-recently-used entry if cache is full
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
