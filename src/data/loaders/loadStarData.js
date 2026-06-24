import { fetchWithTimeout } from '../fetchWithTimeout.js';
import { validateManifestFiles, validateStarBatch } from '../dataValidation.js';
import { logError, logWarn } from '../../shared/logger.js';
import { endPerformanceMeasure, startPerformanceMeasure } from '../../shared/performanceMetrics.js';

const RAW_MANIFEST_URL = 'data/manifest.json';
const PREPROCESSED_MANIFEST_URL = 'data/preprocessed/manifest.json';

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
  let x = normalizeNumber(star.x_coordinate);
  let y = normalizeNumber(star.y_coordinate);
  let z = normalizeNumber(star.z_coordinate);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    const derivedCoordinates = deriveCartesianCoordinates(star, distance);
    x = Number.isFinite(x) ? x : derivedCoordinates.x;
    y = Number.isFinite(y) ? y : derivedCoordinates.y;
    z = Number.isFinite(z) ? z : derivedCoordinates.z;
  }
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

function validatePreprocessedManifestFiles(manifest, source = PREPROCESSED_MANIFEST_URL) {
  const entries = Array.isArray(manifest?.files) ? manifest.files : [];
  return entries
    .map(entry => typeof entry === 'string' ? { file: entry } : entry)
    .filter((entry, index) => {
      const valid = entry &&
        typeof entry.file === 'string' &&
        /^[a-z0-9_.-]+\.json$/i.test(entry.file) &&
        !entry.file.includes('..');
      if (!valid) {
        logWarn(`Invalid ${source} at index ${index}: file must be a local JSON file name.`);
      }
      return valid;
    });
}

async function loadStarFiles({ fileNames, baseUrl, sourceLabel, onProgress, onBatchReady }) {
  const total = fileNames.length;
  const allStars = [];

  for (let i = 0; i < total; i++) {
    const entry = fileNames[i];
    const name = typeof entry === 'string' ? entry : entry.file;
    try {
      const resp = await fetchWithTimeout(`${baseUrl}/${name}`);
      if (!resp.ok) {
        logWarn(`Missing star data file: ${baseUrl}/${name} (HTTP ${resp.status})`);
      } else {
        const batch = validateStarBatch(await resp.json(), `${baseUrl}/${name}`);
        const normalized = batch.map(normalizeStarRecord);
        allStars.push(...normalized);
      }
    } catch (fileErr) {
      logWarn(`Error loading ${baseUrl}/${name}:`, fileErr);
    }

    if (onProgress) onProgress(i + 1, total);
    if (onBatchReady) onBatchReady(allStars);
  }

  if (!allStars.length && total) {
    throw new Error(`${sourceLabel} did not produce any valid star records.`);
  }

  return allStars;
}

async function tryLoadPreprocessedStarData(options) {
  try {
    const manifestResp = await fetchWithTimeout(PREPROCESSED_MANIFEST_URL);
    if (!manifestResp.ok) return null;
    const manifest = await manifestResp.json();
    const fileNames = validatePreprocessedManifestFiles(manifest);
    if (!fileNames.length) return null;
    return await loadStarFiles({
      ...options,
      fileNames,
      baseUrl: 'data/preprocessed',
      sourceLabel: PREPROCESSED_MANIFEST_URL
    });
  } catch (error) {
    logWarn('Preprocessed star data unavailable, falling back to raw data:', error);
    return null;
  }
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
  const timer = startPerformanceMeasure('data.loadStarData');
  try {
    const preprocessedStars = await tryLoadPreprocessedStarData({ onProgress, onBatchReady });
    if (preprocessedStars) {
      endPerformanceMeasure(timer, { source: 'preprocessed', stars: preprocessedStars.length });
      return preprocessedStars;
    }

    const manifestResp = await fetchWithTimeout(RAW_MANIFEST_URL);
    if (!manifestResp.ok) {
      logWarn(`Could not load manifest at ${RAW_MANIFEST_URL} (HTTP ${manifestResp.status})`);
      endPerformanceMeasure(timer, { source: 'raw', stars: 0, failed: true });
      return [];
    }

    const manifest = await manifestResp.json();
    const fileNames = validateManifestFiles(manifest, RAW_MANIFEST_URL);
    const stars = await loadStarFiles({
      fileNames,
      baseUrl: 'data',
      sourceLabel: RAW_MANIFEST_URL,
      onProgress,
      onBatchReady
    });
    endPerformanceMeasure(timer, { source: 'raw', stars: stars.length });
    return stars;
  } catch (error) {
    endPerformanceMeasure(timer, { failed: true });
    logError('Error loading star data:', error);
    return [];
  }
}
