import { getStellarClassData } from './stellarClassData.js';
import { getStableConstellationColor } from './densityColorUtils.js';

export function applyColorFilter(stars, filters) {
  const stellarClassData = getStellarClassData();

  if (filters.color === 'stellar-class') {
    stars.forEach(star => {
      const primaryClass = star.Stellar_class ? star.Stellar_class.charAt(0).toUpperCase() : 'G';
      const classData = stellarClassData[primaryClass];
      star.displayColor = classData ? classData.color : '#FFFFFF';
    });
  } else if (filters.color === 'constellation') {
    stars.forEach(star => {
      star.displayColor = getStableConstellationColor((star.Constellation || '').toUpperCase()) || '#FFFFFF';
    });
  } else if (filters.color === 'galactic-plane') {
    const maxZ = Math.max(1e-9, ...stars.map(s => Math.abs(Number.isFinite(s.z_coordinate) ? s.z_coordinate : 0)));
    stars.forEach(star => {
      const z = Number.isFinite(star.z_coordinate) ? star.z_coordinate : 0;
      const factor = Math.abs(z) / maxZ;
      if (z < 0) star.displayColor = interpolateHex('#ffffff', '#0000ff', factor);
      else if (z > 0) star.displayColor = interpolateHex('#ffffff', '#ff0000', factor);
      else star.displayColor = '#ffffff';
    });
  } else {
    stars.forEach(star => {
      if (!star.displayColor) star.displayColor = '#FFFFFF';
    });
  }
  return stars;
}

function interpolateHex(hex1, hex2, factor) {
  const c1 = hexToRgb(hex1);
  const c2 = hexToRgb(hex2);
  const r = Math.round(c1.r + factor * (c2.r - c1.r));
  const g = Math.round(c1.g + factor * (c2.g - c1.g));
  const b = Math.round(c1.b + factor * (c2.b - c1.b));
  return rgbToHex(r, g, b);
}
function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const bigint = parseInt(normalized, 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}
function rgbToHex(r, g, b) {
  const componentToHex = c => c.toString(16).padStart(2, '0');
  return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b);
}
