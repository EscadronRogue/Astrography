function getStarCartesianPosition(star) {
  if (star?.truePosition) {
    return star.truePosition;
  }
  return star;
}

export function populateCellDistanceCaches(cells, stars) {
  const safeCells = Array.isArray(cells) ? cells : [];
  const safeStars = Array.isArray(stars) ? stars : [];

  safeCells.forEach(cell => {
    const distances = new Array(safeStars.length);
    let nearestStar = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < safeStars.length; index++) {
      const star = safeStars[index];
      const position = getStarCartesianPosition(star);
      const dx = cell.tcPos.x - position.x;
      const dy = cell.tcPos.y - position.y;
      const dz = cell.tcPos.z - position.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      distances[index] = distance;
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestStar = star;
      }
    }

    distances.sort((a, b) => a - b);
    cell.distances = distances;
    cell.nearestStar = nearestStar;
  });
}

export function sumWeightedDistancesWithinRadius(cell, radius, tolerance = 0) {
  if (!(radius > 0) || !Array.isArray(cell?.distances) || cell.distances.length === 0) {
    return 0;
  }

  let total = 0;
  for (let index = Math.max(0, tolerance); index < cell.distances.length; index++) {
    const distance = cell.distances[index];
    if (distance > radius) {
      break;
    }
    total += 1 - distance / radius;
  }
  return total;
}
