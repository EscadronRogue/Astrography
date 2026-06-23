import { vecDot, vecNormalise } from './stlVectorMath.js';

export const FEATURE_CANDIDATES = Object.freeze((() => {
  const dirs = [];
  for (let x = -1; x <= 1; x += 1) {
    for (let y = -1; y <= 1; y += 1) {
      for (let z = -1; z <= 1; z += 1) {
        if (x === 0 && y === 0 && z === 0) continue;
        dirs.push(Object.freeze(vecNormalise(x, y, z)));
      }
    }
  }
  return dirs;
})());

export function findFeatureDirection(connectionDirs, fallback = [0, 1, 0]) {
  if (!connectionDirs || connectionDirs.length === 0) return fallback;

  let bestDir = fallback;
  let bestMinAngle = -Infinity;

  for (const candidate of FEATURE_CANDIDATES) {
    let minAngle = Infinity;
    for (const tubeDir of connectionDirs) {
      const dot = vecDot(candidate, tubeDir);
      const angle = Math.acos(Math.max(-1, Math.min(dot, 1)));
      if (angle < minAngle) minAngle = angle;
    }
    if (minAngle > bestMinAngle) {
      bestMinAngle = minAngle;
      bestDir = candidate;
    }
  }

  return bestDir;
}
