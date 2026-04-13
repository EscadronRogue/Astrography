export function applyStarsShownFilter(stars, filters) {
  const limit = Number.isFinite(Number(filters.visibleMagnitudeLimit))
    ? Number(filters.visibleMagnitudeLimit)
    : 6;
  if (filters.starsShown !== 'visible') {
    return [...stars];
  }
  return stars.filter(star => Number.isFinite(star.apparentMagnitude) && star.apparentMagnitude <= limit);
}
