function getStarId(star) {
  return (
    star?.starId ||
    star?.Common_name_of_the_star ||
    star?.Common_name_of_the_star_system ||
    star?.HD ||
    `${star?.RA_in_degrees}_${star?.DEC_in_degrees}`
  );
}

function getSystemName(star) {
  return star?.Common_name_of_the_star_system
      || star?.Common_name_of_the_star
      || star?.starId
      || 'Unknown';
}

function getPosition(star) {
  const source = star?.truePosition || star;
  const x = Number(source?.x ?? source?.x_coordinate);
  const y = Number(source?.y ?? source?.y_coordinate);
  const z = Number(source?.z ?? source?.z_coordinate);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return { x, y, z };
}

function getDistance(left, right) {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  const dz = left.z - right.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function createPairKey(starA, starB) {
  const idA = getStarId(starA);
  const idB = getStarId(starB);
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

function getGridCoordinates(position, cellSize) {
  return {
    x: Math.floor(position.x / cellSize),
    y: Math.floor(position.y / cellSize),
    z: Math.floor(position.z / cellSize)
  };
}

function getGridKey(x, y, z) {
  return `${x},${y},${z}`;
}

function insertNearestSystem(neighbours, candidate, limit) {
  if (!(limit > 0) || !Number.isFinite(candidate.distance)) return;
  if (neighbours.length === limit && candidate.distance >= neighbours[neighbours.length - 1].distance) return;

  let insertAt = neighbours.length;
  while (insertAt > 0 && neighbours[insertAt - 1].distance > candidate.distance) insertAt -= 1;
  neighbours.splice(insertAt, 0, candidate);
  if (neighbours.length > limit) neighbours.length = limit;
}

export function buildSystemSpatialIndex(systems) {
  const bounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity
  };

  systems.forEach(({ position }) => {
    bounds.minX = Math.min(bounds.minX, position.x);
    bounds.maxX = Math.max(bounds.maxX, position.x);
    bounds.minY = Math.min(bounds.minY, position.y);
    bounds.maxY = Math.max(bounds.maxY, position.y);
    bounds.minZ = Math.min(bounds.minZ, position.z);
    bounds.maxZ = Math.max(bounds.maxZ, position.z);
  });

  const extent = Math.max(
    bounds.maxX - bounds.minX,
    bounds.maxY - bounds.minY,
    bounds.maxZ - bounds.minZ,
    1
  );
  const targetAxisBuckets = Math.max(1, Math.cbrt(systems.length));
  const cellSize = Math.max(1e-6, extent / targetAxisBuckets);
  const gridBounds = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity
  };
  const buckets = new Map();

  systems.forEach((system, index) => {
    const coords = getGridCoordinates(system.position, cellSize);
    gridBounds.minX = Math.min(gridBounds.minX, coords.x);
    gridBounds.maxX = Math.max(gridBounds.maxX, coords.x);
    gridBounds.minY = Math.min(gridBounds.minY, coords.y);
    gridBounds.maxY = Math.max(gridBounds.maxY, coords.y);
    gridBounds.minZ = Math.min(gridBounds.minZ, coords.z);
    gridBounds.maxZ = Math.max(gridBounds.maxZ, coords.z);

    const key = getGridKey(coords.x, coords.y, coords.z);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(index);
  });

  return { buckets, cellSize, bounds: gridBounds };
}

export function findKNearestSystemNeighbours(systems, currentIndex, spatialIndex, limit) {
  const current = systems[currentIndex];
  const { buckets, cellSize, bounds } = spatialIndex;
  const center = getGridCoordinates(current.position, cellSize);
  const neighbours = [];
  const seen = new Set([currentIndex]);
  const maxRange = Math.max(
    center.x - bounds.minX,
    bounds.maxX - center.x,
    center.y - bounds.minY,
    bounds.maxY - center.y,
    center.z - bounds.minZ,
    bounds.maxZ - center.z
  );

  for (let range = 0; range <= maxRange; range += 1) {
    for (let ix = center.x - range; ix <= center.x + range; ix += 1) {
      for (let iy = center.y - range; iy <= center.y + range; iy += 1) {
        for (let iz = center.z - range; iz <= center.z + range; iz += 1) {
          if (
            range > 0 &&
            ix !== center.x - range &&
            ix !== center.x + range &&
            iy !== center.y - range &&
            iy !== center.y + range &&
            iz !== center.z - range &&
            iz !== center.z + range
          ) {
            continue;
          }

          const bucket = buckets.get(getGridKey(ix, iy, iz));
          if (!bucket) continue;
          bucket.forEach(otherIndex => {
            if (seen.has(otherIndex)) return;
            seen.add(otherIndex);
            insertNearestSystem(neighbours, {
              idx: otherIndex,
              distance: getDistance(current.position, systems[otherIndex].position)
            }, limit);
          });
        }
      }
    }

    if (neighbours.length >= limit) {
      const farthestKept = neighbours[neighbours.length - 1].distance;
      const nextShellDistance = range * cellSize;
      if (nextShellDistance > farthestKept) break;
    }
  }

  return neighbours;
}

export function computeKNearestPairs(stars, k) {
  if (!Array.isArray(stars) || stars.length < 2 || !(k > 0)) return [];

  const systemMap = new Map();
  for (const star of stars) {
    const sys = getSystemName(star);
    const position = getPosition(star);
    if (!position || systemMap.has(sys)) continue;
    systemMap.set(sys, { star, position });
  }

  const systems = Array.from(systemMap.values());
  if (systems.length < 2) return [];

  const spatialIndex = buildSystemSpatialIndex(systems);
  const pairSet = new Map();

  for (let i = 0; i < systems.length; i += 1) {
    const self = systems[i];
    const closest = findKNearestSystemNeighbours(systems, i, spatialIndex, k);

    closest.forEach(nb => {
      const other = systems[nb.idx];
      const pairKey = createPairKey(self.star, other.star);
      if (pairSet.has(pairKey)) return;
      pairSet.set(pairKey, {
        starA: self.star,
        starB: other.star,
        distance: nb.distance,
        pairKey
      });
    });
  }

  const pairs = Array.from(pairSet.values());
  pairs.sort((left, right) => left.pairKey.localeCompare(right.pairKey));
  return pairs;
}
