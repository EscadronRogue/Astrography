import { fetchWithTimeout } from '../fetchWithTimeout.js';
import { validateManifestFiles, validateStarBatch } from '../dataValidation.js';
import { logError, logWarn } from '../../shared/logger.js';

function normalizeNumber(value) {
  const num = typeof value === 'string' ? Number.parseFloat(value) : value;
  return Number.isFinite(num) ? num : undefined;
}

function buildStableStarId(star) {
  return (
    star.Source_id ||
    star.HIP_number ||
    star.HD_catalogue_identifier ||
    `${star.Common_name_of_the_star || 'star'}|${star.RA_in_degrees}|${star.DEC_in_degrees}`
  );
}

function getCoordinateRadians(star) {
  const raRad = normalizeNumber(star.RA_in_radian);
  const decRad = normalizeNumber(star.DEC_in_radian);
  if (Number.isFinite(raRad) && Number.isFinite(decRad)) {
    return { ra: raRad, dec: decRad };
  }
  return {
    ra: normalizeNumber(star.RA_in_degrees) * Math.PI / 180,
    dec: normalizeNumber(star.DEC_in_degrees) * Math.PI / 180
  };
}

function deriveCartesianCoordinates(star, distance) {
  const { ra, dec } = getCoordinateRadians(star);
  if (!Number.isFinite(distance) || !Number.isFinite(ra) || !Number.isFinite(dec)) {
    return { x: undefined, y: undefined, z: undefined };
  }
  return {
    x: -distance * Math.cos(dec) * Math.cos(ra),
    y: distance * Math.sin(dec),
    z: -distance * Math.cos(dec) * Math.sin(ra)
  };
}

export function normalizeStarRecord(star) {
  const distance = normalizeNumber(star.distance ?? star.Distance_from_the_Sun);
  const apparentMagnitude = normalizeNumber(star.apparentMagnitude ?? star.Apparent_magnitude);
  const absoluteMagnitude = normalizeNumber(star.absoluteMagnitude ?? star.Absolute_magnitude);
  const stellarClass = star.stellarClass ?? star.Stellar_class ?? '';
  const constellation = star.constellation ?? star.Constellation ?? '';
  const derivedCoordinates = deriveCartesianCoordinates(star, distance);
  const x = normalizeNumber(star.x_coordinate) ?? derivedCoordinates.x;
  const y = normalizeNumber(star.y_coordinate) ?? derivedCoordinates.y;
  const z = normalizeNumber(star.z_coordinate) ?? derivedCoordinates.z;
  return {
    ...star,
    distance,
    apparentMagnitude,
    absoluteMagnitude,
    stellarClass,
    constellation,
    x_coordinate: x,
    y_coordinate: y,
    z_coordinate: z,
    starId: star.starId || buildStableStarId(star)
  };
}

/**
 * Loads star data from all manifest files.
 *
 * @param {Object} [options]
 * @param {function(loaded: number, total: number): void} [options.onProgress]
 *   Called after each file finishes loading. `loaded` is the number of files
 *   loaded so far, `total` is the total file count.
 * @param {function(stars: Array): void} [options.onBatchReady]
 *   Called after each file is loaded and normalized, with the cumulative star
 *   array so far. Enables progressive rendering before all data is available.
 * @returns {Promise<Array>} All loaded and normalized star records.
 */
export async function loadStarData({ onProgress, onBatchReady } = {}) {
  const manifestUrl = 'data/manifest.json';
  try {
    const manifestResp = await fetchWithTimeout(manifestUrl);
    if (!manifestResp.ok) {
      logWarn(`Could not load manifest at ${manifestUrl} (HTTP ${manifestResp.status})`);
      return [];
    }

    const manifest = await manifestResp.json();
    const fileNames = validateManifestFiles(manifest, manifestUrl);

    const total = fileNames.length;
    const allStars = [];

    // Load files one by one so the UI can update progressively
    for (let i = 0; i < total; i++) {
      const name = fileNames[i];
      try {
        const resp = await fetchWithTimeout(`data/${name}`);
        if (!resp.ok) {
          logWarn(`Missing star data file: data/${name} (HTTP ${resp.status})`);
        } else {
          const batch = validateStarBatch(await resp.json(), `data/${name}`);
          const normalized = batch.map(normalizeStarRecord);
          allStars.push(...normalized);
        }
      } catch (fileErr) {
        logWarn(`Error loading data/${name}:`, fileErr);
      }

      if (onProgress) onProgress(i + 1, total);
      if (onBatchReady) onBatchReady(allStars);
    }

    return allStars;
  } catch (error) {
    logError('Error loading star data:', error);
    return [];
  }
}
