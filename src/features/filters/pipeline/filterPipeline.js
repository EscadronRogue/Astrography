import { applyFilters, generateStellarClassFilters } from './index.js';
import { isDefaultViewpoint, getViewpointStarId } from '../../../shared/viewpoint.js';
import { setConnectionLineParams } from '../../connections/connectionSettings.js';
import { disposeObject3D } from '../../../render/engine/renderUtils.js';
import { updateCloudsOverlay } from '../../clouds/cloudOverlay.js';
import { createCloudDensityOverlay, updateCloudDensityOverlay } from '../../clouds/cloudDensityOverlay.js';
import { captureFormState, restoreFormState } from '../../../shared/formUtils.js';
import { syncFilterResultsToAppState } from '../state/filterStateStore.js';
import { applyPlanes } from '../../planes/planeManager.js';
import { rebuildConstellationVisuals } from '../../constellations/constellationManager.js';
import { getStarId } from '../../../shared/starUtils.js';
import { getStarEquirectangularPosition } from '../../../shared/uvUtils.js';
import { clamp01 } from '../../../shared/colorParsing.js';
import { getBudgetedOverlayGridSettings, getRuntimeOverlayMaxCells } from '../../overlays/gridBudget.js';
import {
  getFilterForm,
  getSelectedDustCloudFiles,
  getStellarClassContainers
} from '../filterControls.js';

function isMapVisible(map) {
  return Boolean(map?.canvas?.isConnected);
}

function buildStellarClassCandidateSignature(stars) {
  if (!Array.isArray(stars) || stars.length === 0) return '0';

  let hash = 2166136261;
  stars.forEach(star => {
    const starId = String(getStarId(star));
    for (let index = 0; index < starId.length; index += 1) {
      hash ^= starId.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 124;
    hash = Math.imul(hash, 16777619);
  });

  return `${stars.length}:${hash >>> 0}`;
}

function shouldRebuildStellarClassUi(ctx, stars) {
  const state = ctx?.state;
  const nextSignature = buildStellarClassCandidateSignature(stars);
  const { selectionContainer, preferencesContainer } = getStellarClassContainers(ctx);
  const hasRenderedUi = Boolean(
    selectionContainer?.childElementCount || preferencesContainer?.childElementCount
  );

  if (!hasRenderedUi) {
    if (state) state.stellarClassCandidateSignature = nextSignature;
    return true;
  }

  const previousSignature = state?.stellarClassCandidateSignature;
  if (previousSignature === nextSignature) {
    return false;
  }

  if (state) state.stellarClassCandidateSignature = nextSignature;
  return true;
}

function updateProjectedPositions(ctx) {
  const { state } = ctx;
  const atSol = isDefaultViewpoint();

  if (atSol) {
    // Heliocentric: recalculate positions from original RA/DEC as before
    state.currentGlobeFilteredStars.forEach(star => {
      star.spherePosition = ctx.projectStarGlobe(star);
      star.equirectPosition = getStarEquirectangularPosition(star);
    });
    state.currentFilteredStars.forEach(star => {
      star.truePosition = ctx.getStarTruePosition(star);
    });
  }
}

function updateMapDisplays(ctx, options) {
  const { trueCoordinatesMap, globeMap, uvMap } = ctx.getMaps();
  const { state } = ctx;
  uvMap?.setFilterOptions(options);

  trueCoordinatesMap.setStarOpacity(options.starOpacity);
  globeMap.setStarOpacity(options.starOpacity);
  uvMap?.setStarOpacity(options.starOpacity);
  trueCoordinatesMap.setLabelOpacity(options.starNameOpacity);
  globeMap.setLabelOpacity(options.starNameOpacity);
  uvMap?.setLabelOpacity(options.starNameOpacity);
  trueCoordinatesMap.setConnectionOpacity(options.connectionOpacity);
  globeMap.setConnectionOpacity(options.connectionOpacity);
  uvMap?.setConnectionOpacity(options.connectionOpacity);
  setConnectionLineParams(options.connectionWidth, options.connectionFade, options.connectionLabelSize);

  trueCoordinatesMap.connectionOpacity = options.connectionOpacity;
  globeMap.connectionOpacity = options.connectionOpacity;

  if (isMapVisible(trueCoordinatesMap)) {
    trueCoordinatesMap.updateMap(state.currentFilteredStars, state.currentConnections);
    trueCoordinatesMap.labelManager.refreshLabels(state.currentFilteredStars);
  }
  if (isMapVisible(globeMap)) {
    globeMap.updateMap(state.currentGlobeFilteredStars, state.currentGlobeConnections);
    globeMap.labelManager.refreshLabels(state.currentGlobeFilteredStars);
  }
  if (isMapVisible(uvMap)) {
    uvMap.updateMap(state.currentGlobeFilteredStars, state.currentGlobeConnections, options);
  }
}

async function refreshCloudOverlays(ctx, options) {
  const { trueCoordinatesMap, globeMap } = ctx.getMaps();
  const { state } = ctx;

  if (options.showClouds) {
    const cloudDataFiles = getSelectedDustCloudFiles(options);
    await updateCloudsOverlay(state.cachedStars, trueCoordinatesMap.scene, 'TrueCoordinates', cloudDataFiles, options.cloudOpacity);
    await updateCloudsOverlay(state.cachedStars, globeMap.scene, 'Globe', cloudDataFiles, options.cloudOpacity);
  } else {
    await updateCloudsOverlay(state.cachedStars, trueCoordinatesMap.scene, 'TrueCoordinates', [], options.cloudOpacity);
    await updateCloudsOverlay(state.cachedStars, globeMap.scene, 'Globe', [], options.cloudOpacity);
  }
}

function clearCloudDensityOverlays(ctx) {
  const { trueCoordinatesMap, globeMap } = ctx.getMaps();
  const { state } = ctx;
  state.cloudDensityOverlays.forEach(overlay => {
    if (typeof overlay.getSceneObjects === 'function') {
      const sceneObjects = overlay.getSceneObjects();
      sceneObjects.tc?.forEach(object => trueCoordinatesMap.scene.remove(object));
      sceneObjects.globe?.forEach(object => globeMap.scene.remove(object));
      overlay.dispose?.();
      return;
    }

    overlay.cubesData.forEach(cube => {
      trueCoordinatesMap.scene.remove(cube.tcMesh);
      disposeObject3D(cube.tcMesh);
      globeMap.scene.remove(cube.globeMesh);
      disposeObject3D(cube.globeMesh);
    });
  });
  state.cloudDensityOverlays = [];
  state.cloudDensitySignature = '';
  state.cloudDensityRenderSignature = '';
}

function buildCloudDensitySignature(files, options, gridSettings) {
  return JSON.stringify({
    files,
    minDistance: options.minDistance,
    maxDistance: options.maxDistance,
    gridSize: gridSettings.gridSize,
    viewpoint: getViewpointStarId() || 'sol'
  });
}

function buildCloudDensityRenderSignature(options) {
  return `${options.cloudDensityRadius}|${options.cloudDensityOpacity}`;
}

function normalizeFilterOpacityOptions(filters) {
  [
    'densityOpacity',
    'cloudOpacity',
    'cloudDensityOpacity',
    'starOpacity',
    'starNameOpacity',
    'connectionOpacity',
    'constellationLineOpacity',
    'constellationNameOpacity',
    'planeOpacity'
  ].forEach(key => {
    filters[key] = clamp01(filters[key]);
  });
  return filters;
}

async function refreshCloudDensityOverlays(ctx, options) {
  const { trueCoordinatesMap, globeMap } = ctx.getMaps();
  const { state } = ctx;
  const requestId = (state.cloudDensityUpdateRequestId || 0) + 1;
  state.cloudDensityUpdateRequestId = requestId;

  if (!state.showCloudDensityFlag) {
    if (state.cloudDensityOverlays.length) {
      clearCloudDensityOverlays(ctx);
    } else {
      state.cloudDensitySignature = '';
      state.cloudDensityRenderSignature = '';
    }
    return;
  }

  const files = getSelectedDustCloudFiles(options);
  const gridSettings = getBudgetedOverlayGridSettings(
    options.minDistance,
    options.maxDistance,
    2,
    { maxCells: getRuntimeOverlayMaxCells() }
  );
  const topologySignature = buildCloudDensitySignature(files, options, gridSettings);
  const renderSignature = buildCloudDensityRenderSignature(options);
  const canReuseOverlays =
    state.cloudDensitySignature === topologySignature &&
    state.cloudDensityOverlays.length === files.length;

  if (canReuseOverlays && state.cloudDensityRenderSignature === renderSignature) {
    return;
  }

  if (!canReuseOverlays) {
    clearCloudDensityOverlays(ctx);
    for (const file of files) {
      const overlay = await createCloudDensityOverlay(options.minDistance, options.maxDistance, gridSettings.gridSize, file, state.cachedStars);
      if (state.cloudDensityUpdateRequestId !== requestId) {
        overlay.dispose?.();
        return;
      }
      overlay.gridBudget = gridSettings;
      state.cloudDensityOverlays.push(overlay);
    }
    if (state.cloudDensityUpdateRequestId !== requestId) return;
    state.cloudDensitySignature = topologySignature;
  }

  if (state.cloudDensityUpdateRequestId !== requestId) return;
  for (const overlay of state.cloudDensityOverlays) {
    updateCloudDensityOverlay(
      overlay,
      trueCoordinatesMap.scene,
      globeMap.scene,
      options.cloudDensityRadius,
      options.cloudDensityOpacity
    );
  }
  state.cloudDensityRenderSignature = renderSignature;
}

export async function buildAndApplyFilters(ctx) {
  const { state } = ctx;
  if (!state.cachedStars) return;

  const { trueCoordinatesMap, globeMap } = ctx.getMaps();
  const filterForm = getFilterForm(ctx);
  const filterContext = { document: ctx.document, form: filterForm, state };
  const filters = applyFilters(state.cachedStars, {
    form: filterForm,
    scenes: {
      tc: trueCoordinatesMap?.scene,
      globe: globeMap?.scene
    },
    overlayState: state
  });
  normalizeFilterOpacityOptions(filters);
  const stellarClassCandidates = filters.stellarClassCandidates || filters.currentFilteredStars;

  if (shouldRebuildStellarClassUi(filterContext, stellarClassCandidates)) {
    const {
      selectionContainer: stellarSelectionContainer,
      preferencesContainer: stellarPreferencesContainer
    } = getStellarClassContainers(filterContext);
    const previousSelectionState = stellarSelectionContainer
      ? captureFormState(stellarSelectionContainer)
      : null;
    const previousPreferencesState = stellarPreferencesContainer
      ? captureFormState(stellarPreferencesContainer)
      : null;

    generateStellarClassFilters(stellarClassCandidates, filterContext);
    if (previousSelectionState && stellarSelectionContainer) {
      restoreFormState(stellarSelectionContainer, previousSelectionState, { dispatchEvents: false });
    }
    if (previousPreferencesState && stellarPreferencesContainer) {
      restoreFormState(stellarPreferencesContainer, previousPreferencesState, { dispatchEvents: false });
    }
  }

  const sanitizedConstellationLineWidth = Math.max(0.1, filters.constellationLineWidth || 0.1);

  syncFilterResultsToAppState(state, filters);

  updateProjectedPositions(ctx);
  updateMapDisplays(ctx, filters);

  // Constellations are only meaningful from the Solar viewpoint.
  const atSol = isDefaultViewpoint();
  rebuildConstellationVisuals(ctx, {
    showConstellationBoundaries: atSol && filters.showConstellationBoundaries,
    showConstellationNames: atSol && filters.showConstellationNames,
    showConstellationOverlay: atSol && filters.showConstellationOverlay,
    constellationLineOpacity: filters.constellationLineOpacity,
    constellationLineWidth: sanitizedConstellationLineWidth,
    constellationNameOpacity: filters.constellationNameOpacity
  });

  await refreshCloudOverlays(ctx, filters);
  await refreshCloudDensityOverlays(ctx, filters);

  applyPlanes(ctx, {
    showGalacticPlane: filters.showGalacticPlane,
    showEclipticPlane: filters.showEclipticPlane,
    showCelestialEquator: filters.showCelestialEquator
  }, filters.planeOpacity);

  ctx.applyGlobeSurface(filters.globeOpaqueSurface);
  ctx.requestRender();
}
