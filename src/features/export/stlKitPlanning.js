import { filterMainStars } from './stlExporter.js';
import { getPrintableRadius, getSystemName } from './stlKitMetadata.js';
import { TUBE_INSERTION_DEPTH } from './stlSocketPlanning.js';
import { vecNormalise } from './stlVectorMath.js';

export const MIN_PRINTABLE_TUBE_LENGTH = 2;

export function buildPrintableSystemInfo(stars, rankMap, { mmPerLy }) {
  const mainStars = filterMainStars(stars || []);
  const systemInfo = new Map();

  for (const star of mainStars) {
    if (!star.truePosition) continue;
    const systemName = getSystemName(star);
    systemInfo.set(systemName, {
      star,
      radius: getPrintableRadius(star),
      rank: rankMap.get(systemName),
      posMM: {
        x: star.truePosition.x * mmPerLy,
        y: star.truePosition.y * mmPerLy,
        z: star.truePosition.z * mmPerLy
      }
    });
  }

  return { mainStars, systemInfo };
}

export function buildPrintableConnectionPlan(
  connections,
  systemInfo,
  {
    minTubeLength = MIN_PRINTABLE_TUBE_LENGTH,
    tubeInsertionDepth = TUBE_INSERTION_DEPTH
  } = {}
) {
  const candidateConnections = [];
  const skippedConnections = [];

  if (!Array.isArray(connections)) {
    return { candidateConnections, skippedConnections };
  }

  const seenPairs = new Set();
  for (const { starA, starB } of connections) {
    if (!starA || !starB) continue;

    const sysA = getSystemName(starA);
    const sysB = getSystemName(starB);
    if (sysA === sysB) continue;

    const pairKey = sysA < sysB ? `${sysA}|${sysB}` : `${sysB}|${sysA}`;
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    const infoA = systemInfo.get(sysA);
    const infoB = systemInfo.get(sysB);
    if (!infoA || !infoB) {
      skippedConnections.push({ sysA, sysB, reason: 'one or both systems were not exported' });
      continue;
    }

    const dx = infoB.posMM.x - infoA.posMM.x;
    const dy = infoB.posMM.y - infoA.posMM.y;
    const dz = infoB.posMM.z - infoA.posMM.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const dirAtoB = vecNormalise(dx, dy, dz);
    const dirBtoA = [-dirAtoB[0], -dirAtoB[1], -dirAtoB[2]];

    const tubeLength = distance - infoA.radius - infoB.radius + 2 * tubeInsertionDepth;
    if (tubeLength < minTubeLength) {
      skippedConnections.push({
        sysA,
        sysB,
        reason: `tube would be ${tubeLength.toFixed(2)} mm, below the ${minTubeLength} mm minimum`
      });
      continue;
    }

    candidateConnections.push({
      id: candidateConnections.length,
      sysA,
      sysB,
      distance,
      dx,
      dy,
      dz,
      dirA: dirAtoB,
      dirB: dirBtoA
    });
  }

  return { candidateConnections, skippedConnections };
}
