/**
 * @file Syncs filter pipeline results to app state.
 * Now that the filter pipeline outputs keys matching the app state directly,
 * no mapping layer is needed.
 */

const SYNC_KEYS = Object.freeze([
  'showConstellationBoundariesFlag', 'showConstellationNamesFlag', 'showConstellationOverlayFlag',
  'enableIsolationFilterFlag', 'enableDensityFilterFlag',
  'showCloudsFlag', 'showCloudDensityFlag',
  'showGalacticPlaneFlag', 'showEclipticPlaneFlag', 'showCelestialEquatorFlag',
  'isolationOverlay', 'densityOverlay',
  'currentFilteredStars', 'currentConnections',
  'currentGlobeFilteredStars', 'currentGlobeConnections',
  'currentMollweideFilteredStars', 'currentMollweideConnections'
]);

export function syncFilterResultsToAppState(state, filters) {
  SYNC_KEYS.forEach(key => { state[key] = filters[key]; });
}
