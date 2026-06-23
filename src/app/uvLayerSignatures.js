import { hashString, mixHash } from '../shared/hashUtils.js';

function hashNumber(value, precision = 1000) {
  return Number.isFinite(value) ? Math.round(value * precision) : 0;
}

function getStarRenderKey(star) {
  return star?.starId || star?.Source_id || star?.HIP_number || `${star?.Common_name_of_the_star || 'star'}|${star?.RA_in_degrees}|${star?.DEC_in_degrees}`;
}

function getConnectionRenderKey(connection) {
  return connection?.pairKey || `${getStarRenderKey(connection?.starA)}|${getStarRenderKey(connection?.starB)}`;
}

function getFilterNumber(filterOptions, name, fallback) {
  const value = filterOptions?.[name];
  return Number.isFinite(value) ? value : fallback;
}

export function getDustCloudSignature(filterOptions = {}) {
  const clouds = Array.isArray(filterOptions.selectedDustClouds)
    ? filterOptions.selectedDustClouds
    : [];
  return `${filterOptions.dustCloudMode || 'density'}:${clouds.join('|')}`;
}

function mixViewpoint(hash, viewpointStarId) {
  return mixHash(hash, hashString(viewpointStarId || 'sol'));
}

export function buildStarTopologySignature(stars, { viewpointStarId = 'sol' } = {}) {
  let hash = mixViewpoint(2166136261, viewpointStarId);
  (stars || []).forEach(star => {
    hash = mixHash(hash, hashString(getStarRenderKey(star)));
  });
  return `${stars?.length || 0}:${hash}`;
}

export function buildStarLayerSignature(stars, { starOpacity = 1, viewpointStarId = 'sol' } = {}) {
  let hash = mixHash(2166136261, hashNumber(starOpacity));
  hash = mixViewpoint(hash, viewpointStarId);
  (stars || []).forEach(star => {
    hash = mixHash(hash, hashString(getStarRenderKey(star)));
    hash = mixHash(hash, hashString(star.displayColor || '#ffffff'));
    hash = mixHash(hash, hashNumber(star.displaySize ?? 1, 100));
    hash = mixHash(hash, hashNumber(star.displayOpacity ?? 1, 1000));
  });
  return `${stars?.length || 0}:${hash}`;
}

export function buildLabelLayerSignature(
  stars,
  { labelOpacity = 1, state = {}, filterOptions = {}, viewpointStarId = 'sol' } = {}
) {
  let hash = mixHash(2166136261, hashNumber(labelOpacity));
  hash = mixViewpoint(hash, viewpointStarId);
  hash = mixHash(hash, state.showConstellationNamesFlag ? 1 : 0);
  hash = mixHash(hash, hashNumber(getFilterNumber(filterOptions, 'constellationNameOpacity', 0.8), 1000));
  (stars || []).forEach(star => {
    hash = mixHash(hash, hashString(getStarRenderKey(star)));
    hash = mixHash(hash, hashString(star.displayName || ''));
    hash = mixHash(hash, hashNumber(star.displayLabelSize ?? star.displaySize ?? 1, 100));
  });
  return `${stars?.length || 0}:${hash}`;
}

export function buildFeatureLayerSignature(
  connections,
  { state = {}, filterOptions = {}, connectionOpacity = 0.5, viewpointStarId = 'sol' } = {}
) {
  let hash = mixViewpoint(2166136261, viewpointStarId);
  hash = mixHash(hash, state.showConstellationOverlayFlag ? 1 : 0);
  hash = mixHash(hash, state.showConstellationBoundariesFlag ? 1 : 0);
  hash = mixHash(hash, state.enableDensityFilterFlag ? 1 : 0);
  hash = mixHash(hash, state.enableIsolationFilterFlag ? 1 : 0);
  hash = mixHash(hash, state.showCloudsFlag ? 1 : 0);
  hash = mixHash(hash, state.showCloudDensityFlag ? 1 : 0);
  hash = mixHash(hash, state.showGalacticPlaneFlag ? 1 : 0);
  hash = mixHash(hash, state.showEclipticPlaneFlag ? 1 : 0);
  hash = mixHash(hash, state.showCelestialEquatorFlag ? 1 : 0);
  hash = mixHash(hash, hashNumber(connectionOpacity));
  hash = mixHash(hash, hashNumber(getFilterNumber(filterOptions, 'connectionWidth', 5), 10));
  hash = mixHash(hash, hashNumber(getFilterNumber(filterOptions, 'connectionLabelSize', 1), 10));
  hash = mixHash(hash, hashNumber(getFilterNumber(filterOptions, 'minDistance', 0), 10));
  hash = mixHash(hash, hashNumber(getFilterNumber(filterOptions, 'maxDistance', 20), 10));
  hash = mixHash(hash, hashNumber(getFilterNumber(filterOptions, 'density', 10), 10));
  hash = mixHash(hash, hashNumber(getFilterNumber(filterOptions, 'densityTolerance', 0), 10));
  hash = mixHash(hash, hashNumber(getFilterNumber(filterOptions, 'densityBottomPercent', 10), 10));
  hash = mixHash(hash, hashNumber(getFilterNumber(filterOptions, 'densityTopPercent', 10), 10));
  hash = mixHash(hash, hashNumber(getFilterNumber(filterOptions, 'isolation', 5), 10));
  hash = mixHash(hash, hashNumber(getFilterNumber(filterOptions, 'isolationTolerance', 0), 10));
  hash = mixHash(hash, hashNumber(getFilterNumber(filterOptions, 'planeOpacity', 0.5), 1000));
  hash = mixHash(hash, hashNumber(getFilterNumber(filterOptions, 'constellationLineOpacity', 0.4), 1000));
  hash = mixHash(hash, hashNumber(getFilterNumber(filterOptions, 'constellationLineWidth', 1), 10));
  hash = mixHash(hash, hashNumber(getFilterNumber(filterOptions, 'cloudOpacity', 1), 1000));
  hash = mixHash(hash, hashNumber(getFilterNumber(filterOptions, 'cloudDensityRadius', 5), 10));
  hash = mixHash(hash, hashNumber(getFilterNumber(filterOptions, 'cloudDensityOpacity', 1), 1000));
  hash = mixHash(hash, hashNumber(state.densityOverlay?.revision ?? 0, 1));
  hash = mixHash(hash, hashNumber(state.isolationOverlay?.revision ?? 0, 1));
  hash = mixHash(hash, hashString(getDustCloudSignature(filterOptions)));
  (connections || []).forEach(connection => {
    hash = mixHash(hash, hashString(getConnectionRenderKey(connection)));
    hash = mixHash(hash, hashString(connection.starA?.displayColor || ''));
    hash = mixHash(hash, hashString(connection.starB?.displayColor || ''));
  });
  return `${connections?.length || 0}:${hash}`;
}
