// /filters/index.js

import { applySizeFilter } from '../logic/sizeFilter.js';
import { applyColorFilter } from '../logic/colorFilter.js';
import { applyOpacityFilter } from '../logic/opacityFilter.js';
import { applyStarsShownFilter } from '../logic/starsShownFilter.js';
import { computeConnectionPairs, computeKNearestPairs } from '../../connections/connectionPairs.js';
import { setConnectionLineParams, getConnectionLineParams } from '../../connections/connectionSettings.js';
import { applyStellarClassLogic } from '../logic/stellarClassFilter.js';
import { applyDistanceFilter } from '../logic/distanceFilter.js';
import { computeDisplayStats, needsDisplayStats } from '../logic/starDisplayStats.js';
import { createDefaultFilterResult } from '../state/filterDefaults.js';
import { computeAdaptiveGridSize, readFilterState } from '../state/filterStateReader.js';
import { setupFilterUI, generateStellarClassFilters } from '../../../ui/sidebar/buildSidebar.js';
import { updateDerivedOverlays } from '../state/filterOverlayState.js';
import { isDefaultViewpoint, getViewpointStarId } from '../../../shared/viewpoint.js';
import { getAngularProjectionStars } from '../state/filterProjectionStars.js';

let filterForm = null;

function getFilterForm() {
  if (!filterForm) {
    filterForm = document.getElementById('filters-form');
  }
  return filterForm;
}

export { setupFilterUI, generateStellarClassFilters };

export function applyFilters(allStars, context = {}) {
  const form = getFilterForm();
  if (!form) {
    return createDefaultFilterResult(allStars);
  }

  const filters = readFilterState(form);

  let filteredStars = applyDistanceFilter(allStars, filters);
  filteredStars = applyStarsShownFilter(filteredStars, filters);
  const stellarClassCandidates = filteredStars.slice();
  filteredStars = applyStellarClassLogic(filteredStars, form, filters);
  const displayStats = needsDisplayStats(filters) ? computeDisplayStats(filteredStars) : null;
  filteredStars = applySizeFilter(filteredStars, filters, displayStats);
  filteredStars = applyColorFilter(filteredStars, filters, displayStats);
  filteredStars = applyOpacityFilter(filteredStars, filters, displayStats);

  // Exclude the viewpoint star from angular projections (Globe/Mollweide/Equirect).
  // When viewing from Sol (default), exclude Sol. When viewing from another star,
  // exclude that star and let Sol appear as a regular star.
  const viewpointId = getViewpointStarId();
  const nonViewpointStars = getAngularProjectionStars(filteredStars, viewpointId);

  let connections = [];
  let globeConnections = [];
  let mollweideConnections = [];

  if (filters.enableConnections) {
    if (filters.connectionMode === 'k-nearest') {
      connections = computeKNearestPairs(filteredStars, filters.connectionKNearest);
      globeConnections = computeKNearestPairs(nonViewpointStars, filters.connectionKNearest);
    } else {
      connections = computeConnectionPairs(filteredStars, filters.connections);
      globeConnections = computeConnectionPairs(nonViewpointStars, filters.connections);
    }
    mollweideConnections = globeConnections;
  }

  const overlayState = updateDerivedOverlays(
    allStars,
    filters,
    computeAdaptiveGridSize,
    context.scenes
  );

  return {
    ...filters,
    currentFilteredStars: filteredStars,
    stellarClassCandidates,
    currentConnections: connections,
    currentGlobeFilteredStars: nonViewpointStars,
    currentGlobeConnections: globeConnections,
    currentMollweideFilteredStars: nonViewpointStars,
    currentMollweideConnections: mollweideConnections,
    showConstellationBoundariesFlag: filters.showConstellationBoundaries,
    showConstellationNamesFlag: filters.showConstellationNames,
    showConstellationOverlayFlag: filters.showConstellationOverlay,
    enableIsolationFilterFlag: filters.enableIsolationFilter,
    enableDensityFilterFlag: filters.enableDensityFilter,
    showCloudsFlag: filters.showClouds,
    showCloudDensityFlag: filters.showCloudDensity,
    showGalacticPlaneFlag: filters.showGalacticPlane,
    showEclipticPlaneFlag: filters.showEclipticPlane,
    showCelestialEquatorFlag: filters.showCelestialEquator,
    ...overlayState
  };
}
