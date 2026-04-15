import { parseRA, parseDec, degToRad } from '../../shared/geometryUtils.js';

let boundaryData = [];
let centerData = [];
let fullNameData = null;

export async function loadConstellationBoundaries() {
  try {
    const resp = await fetch('constellation_boundaries.txt');
    if (!resp.ok) throw new Error(`Failed to load constellation_boundaries.txt: ${resp.status}`);
    const raw = await resp.text();
    const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    boundaryData = [];
    for (const line of lines) {
      const parts = line.split(/\s+/);
      if (parts.length < 8) continue;
      const ra1 = parseRA(parts[2]);
      const dec1 = parseDec(parts[3]);
      const ra2 = parseRA(parts[4]);
      const dec2 = parseDec(parts[5]);
      boundaryData.push({ ra1, dec1, ra2, dec2, const1: parts[6], const2: parts[7] });
    }
  } catch (err) {
    console.error('Error loading constellation boundaries:', err);
    boundaryData = [];
  }
}

export async function loadConstellationCenters() {
  try {
    const resp = await fetch('constellation_center.json');
    if (!resp.ok) throw new Error(`Failed to load constellation_center.json: ${resp.status}`);
    const raw = await resp.json();
    centerData = raw.map(entry => ({ ra: degToRad(entry.raDeg), dec: degToRad(entry.decDeg), name: entry.name }));
  } catch (err) {
    console.error('Error loading constellation centers:', err);
    centerData = [];
  }
}

export async function loadConstellationFullNames() {
  if (fullNameData) return fullNameData;
  try {
    const resp = await fetch('constellation_full_names.json');
    if (!resp.ok) throw new Error(`Failed to load constellation_full_names.json: ${resp.status}`);
    fullNameData = await resp.json();
  } catch (err) {
    console.error('Error loading constellation full names:', err);
    fullNameData = {};
  }
  return fullNameData;
}

export function getConstellationCenters() {
  return centerData;
}

export function getConstellationBoundaries() {
  return boundaryData;
}

export function getConstellationFullNames() {
  return fullNameData || {};
}
