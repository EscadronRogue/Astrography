export function clampUnitInterval(value) {
  return Math.max(0, Math.min(1, value));
}

export function normalizePercentToUnit(value, fallback = 1) {
  const numericValue = Number.parseFloat(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return clampUnitInterval(numericValue > 1 ? numericValue / 100 : numericValue);
}

export function normalizeOpacitySelection(value) {
  if (value === null || value === undefined || value === '') return value;
  const numericValue = Number.parseFloat(value);
  if (!Number.isFinite(numericValue)) return value;
  return normalizePercentToUnit(numericValue);
}
