function getStarCartesianPosition(star) {
  if (star?.truePosition) {
    return star.truePosition;
  }
  return star;
}

function getFiniteCoordinate(position, key) {
  const value = Number(position?.[key]);
  return Number.isFinite(value) ? value : null;
}

function normalizeStarEntries(stars) {
  const safeStars = Array.isArray(stars) ? stars : [];
  const entries = [];

  safeStars.forEach(star => {
    const position = getStarCartesianPosition(star);
    const x = getFiniteCoordinate(position, 'x');
    const y = getFiniteCoordinate(position, 'y');
    const z = getFiniteCoordinate(position, 'z');
    if (x === null || y === null || z === null) return;
    entries.push({ star, x, y, z });
  });

  return entries;
}

function getCacheEntries(cacheOrStars) {
  if (Array.isArray(cacheOrStars?.stars)) return cacheOrStars.stars;
  return normalizeStarEntries(cacheOrStars);
}

function distanceFromCellToEntry(cell, entry) {
  const dx = cell.tcPos.x - entry.x;
  const dy = cell.tcPos.y - entry.y;
  const dz = cell.tcPos.z - entry.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function insertBoundedDistance(distances, distance, limit) {
  if (!(limit > 0) || !Number.isFinite(distance)) return;
  if (distances.length === limit && distance >= distances[distances.length - 1]) return;

  let insertAt = distances.length;
  while (insertAt > 0 && distances[insertAt - 1] > distance) insertAt -= 1;
  distances.splice(insertAt, 0, distance);
  if (distances.length > limit) distances.length = limit;
}

function bucketKey(ix, iy, iz) {
  return `${ix},${iy},${iz}`;
}

export function populateCellDistanceCaches(cells, stars) {
  const safeCells = Array.isArray(cells) ? cells : [];
  const cache = { stars: normalizeStarEntries(stars) };

  safeCells.forEach(cell => {
    cell.distanceCache = cache;
    cell.nearestDistanceCache = new Map();
    cell.nearestStar = null;
    delete cell.distances;
  });

  return cache;
}

export function getNearestCellDistance(cell, tolerance = 0) {
  const entries = getCacheEntries(cell?.distanceCache);
  if (!cell?.tcPos || entries.length === 0) return Number.POSITIVE_INFINITY;

  const toleranceIndex = Math.max(0, Math.floor(Number.isFinite(tolerance) ? tolerance : 0));
  if (cell.nearestDistanceCache?.has(toleranceIndex)) {
    return cell.nearestDistanceCache.get(toleranceIndex);
  }

  const nearestDistances = [];
  const limit = toleranceIndex + 1;
  let nearestStar = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  entries.forEach(entry => {
    const distance = distanceFromCellToEntry(cell, entry);
    insertBoundedDistance(nearestDistances, distance, limit);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestStar = entry.star;
    }
  });

  cell.nearestStar = nearestStar;
  const result = nearestDistances[toleranceIndex] ?? Number.POSITIVE_INFINITY;
  cell.nearestDistanceCache?.set(toleranceIndex, result);
  return result;
}

export function buildDistanceQueryIndex(cacheOrStars, radius) {
  const entries = getCacheEntries(cacheOrStars);
  const safeRadius = Number(radius);
  if (!(safeRadius > 0) || entries.length === 0) {
    return { buckets: new Map(), bucketSize: 1, entries: [] };
  }

  const bucketSize = safeRadius;
  const buckets = new Map();
  entries.forEach(entry => {
    const ix = Math.floor(entry.x / bucketSize);
    const iy = Math.floor(entry.y / bucketSize);
    const iz = Math.floor(entry.z / bucketSize);
    const key = bucketKey(ix, iy, iz);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(entry);
  });

  return { buckets, bucketSize, entries };
}

export function sumWeightedDistancesWithinRadius(cell, radius, tolerance = 0, queryIndex = null) {
  const safeRadius = Number(radius);
  if (!(safeRadius > 0) || !cell?.tcPos) return 0;

  const index = queryIndex || buildDistanceQueryIndex(cell.distanceCache, safeRadius);
  const radiusSquared = safeRadius * safeRadius;
  const baseIx = Math.floor(cell.tcPos.x / index.bucketSize);
  const baseIy = Math.floor(cell.tcPos.y / index.bucketSize);
  const baseIz = Math.floor(cell.tcPos.z / index.bucketSize);
  const distances = [];
  let total = 0;
  const toleranceIndex = Math.max(0, Math.floor(Number.isFinite(tolerance) ? tolerance : 0));

  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        const bucket = index.buckets.get(bucketKey(baseIx + dx, baseIy + dy, baseIz + dz));
        if (!bucket) continue;
        bucket.forEach(entry => {
          const deltaX = cell.tcPos.x - entry.x;
          const deltaY = cell.tcPos.y - entry.y;
          const deltaZ = cell.tcPos.z - entry.z;
          const distanceSquared = deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ;
          if (distanceSquared > radiusSquared) return;

          const distance = Math.sqrt(distanceSquared);
          if (toleranceIndex > 0) {
            distances.push(distance);
          } else {
            total += 1 - distance / safeRadius;
          }
        });
      }
    }
  }

  if (toleranceIndex === 0) return total;

  distances.sort((a, b) => a - b);
  for (let index = toleranceIndex; index < distances.length; index += 1) {
    total += 1 - distances[index] / safeRadius;
  }
  return total;
}
