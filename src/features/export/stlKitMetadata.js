import { filterMainStars } from './stlExporter.js';
import {
  STL_MM_PER_LY,
  STL_STANDARD_STAR_DIAMETER_MM,
  STL_TUBE_DIAMETER_MM,
  getSTLStarRadius
} from './stlScale.js';

export function sanitizeSTLFilename(name) {
  return String(name ?? '')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function getSystemName(star) {
  return star?.Common_name_of_the_star_system
    || star?.Common_name_of_the_star
    || star?.starId
    || 'Unknown';
}

export function getRankingDistance(star) {
  return Number.isFinite(star?.distance) ? star.distance : Number.POSITIVE_INFINITY;
}

export function getPrintableRadius(star) {
  return getSTLStarRadius(star);
}

export function buildSystemRankMap(sourceStars) {
  const rankedStars = filterMainStars(Array.isArray(sourceStars) ? sourceStars : [])
    .slice()
    .sort((a, b) => {
      const dd = getRankingDistance(a) - getRankingDistance(b);
      if (dd !== 0) return dd;
      return getSystemName(a).localeCompare(getSystemName(b));
    });

  const rankMap = new Map();
  rankedStars.forEach((star, index) => {
    rankMap.set(getSystemName(star), index + 1);
  });
  return rankMap;
}

export function buildKitManifest({
  sourceStarCount,
  inputConnectionCount,
  exportedSystemCount,
  printableConnectionCount,
  starFileCount,
  tubeFileCount,
  skippedConnections
}) {
  const skipped = Array.isArray(skippedConnections) ? skippedConnections : [];
  const lines = [
    'Astrography 3D Print Kit',
    '',
    `Scale: 1 LY = ${STL_MM_PER_LY} mm`,
    `Standard star diameter: ${STL_STANDARD_STAR_DIAMETER_MM} mm`,
    `Tube diameter: ${STL_TUBE_DIAMETER_MM} mm`,
    '',
    `Input stars: ${sourceStarCount}`,
    `Exported systems: ${exportedSystemCount}`,
    `Input connections: ${inputConnectionCount}`,
    `Printable connections: ${printableConnectionCount}`,
    `Star STL files: ${starFileCount}`,
    `Tube STL files: ${tubeFileCount}`,
    `Skipped connections: ${skipped.length}`
  ];

  if (skipped.length) {
    lines.push('', 'Skipped connection details:');
    skipped.forEach(item => {
      lines.push(`- ${item.sysA} -> ${item.sysB}: ${item.reason}`);
    });
  }

  return `${lines.join('\n')}\n`;
}
