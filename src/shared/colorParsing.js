export function normalizeHexColor(value, fallback = '#ffffff') {
  let raw = value;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    raw = raw.toString(16).padStart(6, '0');
  }
  raw = String(raw || fallback || '#ffffff').trim();
  if (raw.startsWith('#')) raw = raw.slice(1);
  if (raw.toLowerCase().startsWith('0x')) raw = raw.slice(2);
  if (raw.length === 3) {
    raw = raw.split('').map(char => char + char).join('');
  }
  if (!/^[\da-f]{6}$/i.test(raw)) {
    return normalizeHexColor(fallback && fallback !== value ? fallback : '#ffffff', '#ffffff');
  }
  return `#${raw.toLowerCase()}`;
}

export function hexToRgb255(value, fallback = '#ffffff') {
  const normalized = normalizeHexColor(value, fallback).slice(1);
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };
}

export function hexToUnitRgb(value, fallback = '#ffffff') {
  const { r, g, b } = hexToRgb255(value, fallback);
  return {
    r: r / 255,
    g: g / 255,
    b: b / 255
  };
}

export function writeUnitRgb(target, offset, value, fallback = '#ffffff') {
  const color = hexToUnitRgb(value, fallback);
  target[offset] = color.r;
  target[offset + 1] = color.g;
  target[offset + 2] = color.b;
  return color;
}

export function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

export function rgbToHex(r, g, b) {
  const toHex = c => {
    const value = Number(c);
    const clamped = Number.isFinite(value) ? Math.max(0, Math.min(255, Math.round(value))) : 0;
    return clamped.toString(16).padStart(2, '0');
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function normalizeInterpolationFactor(factor) {
  return clamp01(factor);
}

export function interpolateHexColor(color1, color2, factor) {
  const c1 = hexToRgb255(color1, '#ffffff');
  const c2 = hexToRgb255(color2, '#ffffff');
  const t = normalizeInterpolationFactor(factor);
  return rgbToHex(
    c1.r + t * (c2.r - c1.r),
    c1.g + t * (c2.g - c1.g),
    c1.b + t * (c2.b - c1.b)
  );
}

export function interpolateColorNumber(color1, color2, factor) {
  const { r, g, b } = hexToRgb255(interpolateHexColor(color1, color2, factor));
  return (r << 16) + (g << 8) + b;
}

export function hexToRgbaString(hex, opacity) {
  const { r, g, b } = hexToRgb255(hex, '#ffffff');
  return `rgba(${r}, ${g}, ${b}, ${clamp01(opacity)})`;
}
