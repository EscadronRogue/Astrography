export function getDisplayDistance(star, fallback = Number.NaN) {
  const viewpointDistance = star?.viewpointDistance;
  if (Number.isFinite(viewpointDistance)) return viewpointDistance;
  const distance = star?.distance;
  return Number.isFinite(distance) ? distance : fallback;
}

export function normalizeDisplayOpacity(value, fallback = 1) {
  const numeric = Number.parseFloat(value);
  if (!Number.isFinite(numeric)) return fallback;
  const unitValue = numeric > 1 ? numeric / 100 : numeric;
  return Math.max(0, Math.min(1, unitValue));
}

export function getStarDisplayOpacity(star, globalOpacity = 1) {
  const perStarOpacity = Number.isFinite(star?.displayOpacity) ? star.displayOpacity : 1;
  const baseOpacity = Number.isFinite(globalOpacity) ? globalOpacity : 1;
  return Math.max(0, Math.min(1, perStarOpacity * baseOpacity));
}
