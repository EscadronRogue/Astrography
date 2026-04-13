// utils.js

export function generateConstellationColors(stars) {
  const constellationColors = {};
  const constellations = [...new Set(stars.map(star => star.Constellation).filter(Boolean))];

  constellations.forEach(constellation => {
    constellationColors[constellation] = colorFromString(constellation);
  });

  return constellationColors;
}

export function colorFromString(value) {
  let hash = 0;
  const input = String(value || '');
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(i)) | 0;
  }

  const hue = Math.abs(hash) % 360;
  return hslToHex(hue, 70, 50);
}

function hslToHex(h, s, l) {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = n => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function interpolateColor(color1, color2, factor) {
  const clampedFactor = Math.max(0, Math.min(1, factor));
  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);

  const r = Math.round(c1.r + clampedFactor * (c2.r - c1.r));
  const g = Math.round(c1.g + clampedFactor * (c2.g - c1.g));
  const b = Math.round(c1.b + clampedFactor * (c2.b - c1.b));

  return (r << 16) + (g << 8) + b;
}

function hexToRgb(hex) {
  if (typeof hex === 'number') {
    hex = `#${hex.toString(16).padStart(6, '0')}`;
  }

  if (typeof hex !== 'string') {
    return { r: 255, g: 255, b: 255 };
  }

  const normalized = hex.trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return { r: 255, g: 255, b: 255 };
  }

  const bigint = parseInt(normalized, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255
  };
}

export function calculateDistance(starA, starB) {
  const dx = starA.x_coordinate - starB.x_coordinate;
  const dy = starA.y_coordinate - starB.y_coordinate;
  const dz = starA.z_coordinate - starB.z_coordinate;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function hexToRGBA(hex, opacity) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function resizeCanvas(canvas) {
  const parent = canvas.parentElement;
  if (!parent) return;
  canvas.width = parent.clientWidth;
  canvas.height = parent.clientHeight;
}

export function minimalRADifference(ra) {
  let out = ra;
  while (out > Math.PI) out -= 2 * Math.PI;
  while (out < -Math.PI) out += 2 * Math.PI;
  return out;
}
