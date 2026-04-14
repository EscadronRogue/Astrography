import { getPrimaryClass } from '../shared/stellarClassUtils.js';

let starDataPromise = null;

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

function normalizeCoordinateFields(star) {
  return {
    RA_in_degrees: normalizeNumber(star.RA_in_degrees),
    DEC_in_degrees: normalizeNumber(star.DEC_in_degrees),
    RA_in_radian: normalizeNumber(star.RA_in_radian),
    DEC_in_radian: normalizeNumber(star.DEC_in_radian),
    x_coordinate: normalizeNumber(star.x_coordinate),
    y_coordinate: normalizeNumber(star.y_coordinate),
    z_coordinate: normalizeNumber(star.z_coordinate)
  };
}

export function normalizeStarRecord(star) {
  const distance = normalizeNumber(star.distance ?? star.Distance_from_the_Sun);
  const apparentMagnitude = normalizeNumber(star.apparentMagnitude ?? star.Apparent_magnitude);
  const absoluteMagnitude = normalizeNumber(star.absoluteMagnitude ?? star.Absolute_magnitude);
  const spectralClass = typeof (star.spectralClass ?? star.Stellar_class) === 'string'
    ? (star.spectralClass ?? star.Stellar_class).trim()
    : undefined;
  const coordinates = normalizeCoordinateFields(star);
  const normalizedStar = {
    ...star,
    ...coordinates,
    distance,
    apparentMagnitude,
    absoluteMagnitude,
    spectralClass,
    starId: star.starId || buildStableStarId(star)
  };
  normalizedStar.primaryClass = getPrimaryClass(normalizedStar);
  normalizedStar.raRad = coordinates.RA_in_radian;
  normalizedStar.decRad = coordinates.DEC_in_radian;
  return normalizedStar;
}

async function fetchStarData() {
  const manifestUrl = 'data/manifest.json';
  const manifestResp = await fetch(manifestUrl);
  if (!manifestResp.ok) {
    throw new Error(`Could not load star manifest at ${manifestUrl}`);
  }

  const manifest = await manifestResp.json();
  const fileNames = Array.isArray(manifest) ? manifest : manifest.files;
  if (!Array.isArray(fileNames)) {
    throw new Error('Invalid data manifest format');
  }

  const bucketResults = await Promise.all(fileNames.map(async name => {
    const url = `data/${name}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Missing star data file: ${url}`);
    }
    return resp.json();
  }));

  return bucketResults.flat().map(normalizeStarRecord);
}

export async function loadStarData() {
  if (!starDataPromise) {
    starDataPromise = fetchStarData().catch(error => {
      starDataPromise = null;
      throw error;
    });
  }
  return starDataPromise;
}
