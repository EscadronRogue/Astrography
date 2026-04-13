import { degToRad } from '../utils/geometryUtils.js';

let densityCenterData = null;

export async function loadDensityCenterData() {
  if (densityCenterData !== null) return densityCenterData;
  try {
    const response = await fetch('constellation_center.json');
    if (!response.ok) throw new Error(`Failed to fetch constellation_center.json: ${response.status}`);
    const raw = await response.json();
    densityCenterData = raw.map(entry => ({ name: entry.name, ra: degToRad(entry.raDeg), dec: degToRad(entry.decDeg) }));
    return densityCenterData;
  } catch (err) {
    densityCenterData = [];
    console.error('Error loading constellation_center.json:', err);
    return densityCenterData;
  }
}

export function getDensityCenterData() {
  return densityCenterData;
}
