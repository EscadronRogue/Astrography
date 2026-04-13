const dataCache = new Map();

export async function loadCachedCloudData(fileUrl) {
  if (dataCache.has(fileUrl)) {
    return dataCache.get(fileUrl);
  }
  const response = await fetch(fileUrl);
  if (!response.ok) {
    throw new Error(`Failed to load cloud data from ${fileUrl}`);
  }
  const data = await response.json();
  dataCache.set(fileUrl, data);
  return data;
}

export function clearCloudDataCache() {
  dataCache.clear();
}
