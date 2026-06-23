import { hashString, mixHash } from '../../shared/hashUtils.js';

export function getConnectionPairKey(pair) {
  return pair?.pairKey || `${pair?.starA?.starId || 'a'}|${pair?.starB?.starId || 'b'}`;
}

export function haveSameKeys(left = [], right = []) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function buildConnectionVisualSignature(connectionObjs, viewpointStarId = 'sol') {
  const connections = Array.isArray(connectionObjs) ? connectionObjs : [];
  let hash = 2166136261;
  hash = mixHash(hash, hashString(viewpointStarId || 'sol'));
  connections.forEach(pair => {
    hash = mixHash(hash, hashString(getConnectionPairKey(pair)));
    hash = mixHash(hash, hashString(pair?.starA?.displayColor || ''));
    hash = mixHash(hash, hashString(pair?.starB?.displayColor || ''));
  });
  return `${connections.length}:${hash}`;
}

export function buildConnectionBoundsSignature(connectionObjs) {
  const connections = Array.isArray(connectionObjs) ? connectionObjs : [];
  let hash = 2166136261;
  connections.forEach(pair => {
    hash = mixHash(hash, hashString(getConnectionPairKey(pair)));
    hash = mixHash(hash, hashString(Number(pair?.distance).toPrecision(12)));
  });
  return `${connections.length}:${hash}`;
}

let cachedBounds = null;
let cachedBoundsSignature = '';

export function getConnectionDistanceBounds(connectionObjs) {
  const connections = Array.isArray(connectionObjs) ? connectionObjs : [];
  if (!connections.length) {
    return { largestDistance: 0, smallestDistance: 0 };
  }

  const signature = buildConnectionBoundsSignature(connections);
  if (cachedBounds && cachedBoundsSignature === signature) {
    return cachedBounds;
  }

  let largest = -Infinity;
  let smallest = Infinity;
  connections.forEach(pair => {
    const distance = Number(pair?.distance);
    if (!Number.isFinite(distance)) return;
    if (distance > largest) largest = distance;
    if (distance < smallest) smallest = distance;
  });

  cachedBounds = Number.isFinite(largest) && Number.isFinite(smallest)
    ? { largestDistance: largest, smallestDistance: smallest }
    : { largestDistance: 0, smallestDistance: 0 };
  cachedBoundsSignature = signature;
  return cachedBounds;
}

export function resetConnectionDistanceBoundsCache() {
  cachedBounds = null;
  cachedBoundsSignature = '';
}
