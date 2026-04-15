const FILTER_RESULT_MAPPINGS = Object.freeze({
  showConstellationBoundariesFlag: 'showConstellationBoundaries',
  showConstellationNamesFlag: 'showConstellationNames',
  showConstellationOverlayFlag: 'showConstellationOverlay',
  enableIsolationFilterFlag: 'enableIsolationFilter',
  enableDensityFilterFlag: 'enableDensityFilter',
  showCloudsFlag: 'showClouds',
  showCloudDensityFlag: 'showCloudDensity',
  showGalacticPlaneFlag: 'showGalacticPlane',
  showEclipticPlaneFlag: 'showEclipticPlane',
  showCelestialEquatorFlag: 'showCelestialEquator',
  isolationOverlay: 'isolationOverlay',
  densityOverlay: 'densityOverlay',
  currentFilteredStars: 'filteredStars',
  currentConnections: 'connections',
  currentGlobeFilteredStars: 'globeFilteredStars',
  currentGlobeConnections: 'globeConnections',
  currentMollweideFilteredStars: 'mollweideFilteredStars',
  currentMollweideConnections: 'mollweideConnections'
});

export function syncFilterResultsToAppState(state, filters) {
  Object.entries(FILTER_RESULT_MAPPINGS).forEach(([stateKey, filterKey]) => {
    state[stateKey] = filters[filterKey];
  });
}
