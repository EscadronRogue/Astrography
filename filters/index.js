// /filters/index.js

import { applySizeFilter } from './sizeFilter.js';
import { applyColorFilter } from './colorFilter.js';
import { applyOpacityFilter } from './opacityFilter.js';
import { applyStarsShownFilter } from './starsShownFilter.js';
import { computeConnectionPairs } from './connectionsFilter.js';
import { applyStellarClassLogic } from './stellarClassFilter.js';
import { applyGlobeSurfaceFilter } from './globeSurfaceFilter.js';
import { createConstellationOverlayForGlobe } from './constellationOverlayFilter.js';
import { applyDistanceFilter } from './distanceFilter.js';
import { createDefaultFilterResult } from './filterDefaults.js';
import { computeAdaptiveGridSize, readFilterState } from './filterFormState.js';
import { setupFilterUI, generateStellarClassFilters } from './filterUISetup.js';
import { updateDerivedOverlays } from './filterOverlayState.js';
import { SOL_STAR_NAME } from '../shared/constants.js';

let filterForm = null;

function getFilterForm() {
  if (!filterForm) {
    filterForm = document.getElementById('filters-form');
  }
  return filterForm;
}

export { setupFilterUI, generateStellarClassFilters };

export function applyFilters(allStars) {
  const form = getFilterForm();
  if (!form) {
    return createDefaultFilterResult(allStars);
  }

  const filters = readFilterState(form);

  let filteredStars = applyDistanceFilter(allStars, filters);
  filteredStars = applyStarsShownFilter(filteredStars, filters);
  filteredStars = applyStellarClassLogic(filteredStars, form);
  filteredStars = applySizeFilter(filteredStars, filters);
  filteredStars = applyColorFilter(filteredStars, filters);
  filteredStars = applyOpacityFilter(filteredStars, filters);

  const nonSolStars = filteredStars.filter(star => star.Common_name_of_the_star !== SOL_STAR_NAME);

  let connections = [];
  let globeConnections = [];
  let mollweideConnections = [];

  if (filters.enableConnections) {
    connections = computeConnectionPairs(filteredStars, filters.connections);
    globeConnections = computeConnectionPairs(nonSolStars, filters.connections);
    mollweideConnections = computeConnectionPairs(nonSolStars, filters.connections);
  }

  applyGlobeSurfaceFilter(filters);

  if (filters.showConstellationOverlay) {
    const constellationOverlay = createConstellationOverlayForGlobe();
    constellationOverlay.forEach(mesh => {
      window.globeMap.scene.add(mesh);
    });
  }

  const overlayState = updateDerivedOverlays(allStars, filters, computeAdaptiveGridSize);

  return {
    ...filters,
    filteredStars,
    connections,
    globeFilteredStars: nonSolStars,
    globeConnections,
    mollweideFilteredStars: nonSolStars,
    mollweideConnections,
    ...overlayState
  };
}
