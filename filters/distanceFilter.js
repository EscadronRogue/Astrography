export function applyDistanceFilter(stars, filters) {
  const minDist = filters.minDistance !== null && filters.minDistance !== undefined ? parseFloat(filters.minDistance) : 0;
  const maxDist = filters.maxDistance !== null && filters.maxDistance !== undefined ? parseFloat(filters.maxDistance) : 20;
  return stars.filter(star => Number.isFinite(star.distance) && star.distance >= minDist && star.distance <= maxDist);
}
