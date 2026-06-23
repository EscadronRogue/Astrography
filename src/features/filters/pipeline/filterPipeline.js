import { applyFilters, generateStellarClassFilters } from './index.js';
import { isDefaultViewpoint, getViewpointStarId } from '../../../shared/viewpoint.js';
import { setConnectionLineParams } from '../../connections/connectionSettings.js';
import { disposeObject3D } from '../../../render/engine/renderUtils.js';
import {
  updateCloudsOverlay,
  updateMollweideCloudSegments
} from '../../clouds/cloudOverlay.js';
import { createCloudDensityOverlay, updateCloudDensityOverlay } from '../../clouds/cloudDensityOverlay.js';
import { captureFormState, restoreFormState } from '../../../shared/formUtils.js';
import { syncFilterResultsToAppState } from '../state/filterStateStore.js';
import { applyPlanes, refreshMollweidePlanes } from '../../planes/planeManager.js';
import { rebuildConstellationVisuals, refreshMollweideConstellationVisuals } from '../../constellations/constellationManager.js';
import { getStarId } from '../../../shared/starUtils.js';
import { getStarEquirectangularPosition } from '../../../shared/uvUtils.js';
import { clamp01 } from '../../../shared/colorParsing.js';

function isMapVisible(map) {
  return Boolean(map?.canvas?.isConnected);
}

function getSelectedDustCloudFiles(form) {
  if (!form) return [];
  return new FormData(form).getAll('dust-clouds');
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
  const selectionContainer = document.getElementById('stellar-class-selection-container');
  const preferencesContainer = document.getElementById('stellar-class-preferences-container');
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
    state.currentMollweideFilteredStars.forEach(star => {
      ctx.precalcMollweideData(star);
      ctx.updateMollweidePosition(star);
    });
  } else {
    // Non-Sol viewpoint: positions were already computed by reprojectAllStars().
    // Only update Mollweide positions (they depend on the current lambda0
    // which can change independently via camera interaction).
    state.currentMollweideFilteredStars.forEach(star => {
      ctx.updateMollweidePosition(star);
    });
  }
}

function updateMapDisplays(ctx, options) {
  const { trueCoordinatesMap, globeMap, mollweideMap, uvMap, uvGlobeMap } = ctx.getMaps();
  const { state } = ctx;
  uvMap?.setFilterOptions(options);
  uvGlobeMap?.setFilterOptions(options);

  trueCoordinatesMap.setStarOpacity(options.starOpacity);
  globeMap.setStarOpacity(options.starOpacity);
  mollweideMap.setStarOpacity(options.starOpacity);
  uvMap?.setStarOpacity(options.starOpacity);
  uvGlobeMap?.setStarOpacity(options.starOpacity);
  trueCoordinatesMap.setLabelOpacity(options.starNameOpacity);
  globeMap.setLabelOpacity(options.starNameOpacity);
  mollweideMap.setLabelOpacity(options.starNameOpacity);
  uvMap?.setLabelOpacity(options.starNameOpacity);
  uvGlobeMap?.setLabelOpacity(options.starNameOpacity);
  trueCoordinatesMap.setConnectionOpacity(options.connectionOpacity);
  globeMap.setConnectionOpacity(options.connectionOpacity);
  mollweideMap.setConnectionOpacity(options.connectionOpacity);
  uvMap?.setConnectionOpacity(options.connectionOpacity);
  uvGlobeMap?.setConnectionOpacity(options.connectionOpacity);
  setConnectionLineParams(options.connectionWidth, options.connectionFade, options.connectionLabelSize);

  trueCoordinatesMap.connectionOpacity = options.connectionOpacity;
  globeMap.connectionOpacity = options.connectionOpacity;
  mollweideMap.connectionOpacity = options.connectionOpacity;

  if (isMapVisible(trueCoordinatesMap)) {
    trueCoordinatesMap.updateMap(state.currentFilteredStars, state.currentConnections);
    trueCoordinatesMap.labelManager.refreshLabels(state.currentFilteredStars);
  }
  if (isMapVisible(globeMap)) {
    globeMap.updateMap(state.currentGlobeFilteredStars, state.currentGlobeConnections);
    globeMap.labelManager.refreshLabels(state.currentGlobeFilteredStars);
  }
  if (isMapVisible(mollweideMap)) {
    mollweideMap.addStars(state.currentMollweideFilteredStars);
    mollweideMap.updateConnections(
      state.currentMollweideFilteredStars,
      state.currentMollweideConnections,
      mollweideMap.connectionOpacity
    );
    mollweideMap.labelManager.refreshLabels(state.currentMollweideFilteredStars);
    if (ctx.editManager) ctx.editManager.registerMollweideEditableLabels();
  }
  if (isMapVisible(uvMap)) {
    uvMap.updateMap(state.currentGlobeFilteredStars, state.currentGlobeConnections, options);
  }
  if (isMapVisible(uvGlobeMap)) {
    uvGlobeMap.updateMap(state.currentGlobeFilteredStars, state.currentGlobeConnections, options);
  }
}

async function refreshCloudOverlays(ctx, options) {
  const { trueCoordinatesMap, globeMap, mollweideMap } = ctx.getMaps();
  const { state } = ctx;
  const form = document.getElementById('filters-form');

  if (options.showClouds) {
    const cloudDataFiles = getSelectedDustCloudFiles(form);
    await updateCloudsOverlay(state.cachedStars, trueCoordinatesMap.scene, 'TrueCoordinates', cloudDataFiles, options.cloudOpacity);
    await updateCloudsOverlay(state.cachedStars, globeMap.scene, 'Globe', cloudDataFiles, options.cloudOpacity);
    await updateCloudsOverlay(state.cachedStars, mollweideMap.scene, 'Mollweide', cloudDataFiles, options.cloudOpacity);
  } else {
    await updateCloudsOverlay(state.cachedStars, trueCoordinatesMap.scene, 'TrueCoordinates', [], options.cloudOpacity);
    await updateCloudsOverlay(state.cachedStars, globeMap.scene, 'Globe', [], options.cloudOpacity);
    await updateCloudsOverlay(state.cachedStars, mollweideMap.scene, 'Mollweide', [], options.cloudOpacity);
  }
}

function clearCloudDensityOverlays(ctx) {
  const { trueCoordinatesMap, globeMap, mollweideMap } = ctx.getMaps();
  const { state } = ctx;
  state.cloudDensityOverlays.forEach(overlay => {
    if (typeof overlay.getSceneObjects === 'function') {
      const sceneObjects = overlay.getSceneObjects();
      sceneObjects.tc?.forEach(object => trueCoordinatesMap.scene.remove(object));
      sceneObjects.globe?.forEach(object => globeMap.scene.remove(object));
      sceneObjects.moll?.forEach(object => mollweideMap.scene.remove(object));
      overlay.dispose?.();
      return;
    }

    overlay.cubesData.forEach(cube => {
      trueCoordinatesMap.scene.remove(cube.tcMesh);
      disposeObject3D(cube.tcMesh);
      globeMap.scene.remove(cube.globeMesh);
      disposeObject3D(cube.globeMesh);
      mollweideMap.scene.remove(cube.mollweideMesh);
      disposeObject3D(cube.mollweideMesh);
    });
    mollweideMap.scene.remove(overlay.textureMesh);
    disposeObject3D(overlay.textureMesh);
  });
  state.cloudDensityOverlays = [];
  state.cloudDensitySignature = '';
  state.cloudDensityRenderSignature = '';
}

function buildCloudDensitySignature(files, options) {
  return JSON.stringify({
    files,
    minDistance: options.minDistance,
    maxDistance: options.maxDistance,
    gridSize: 2,
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
    'planeOpacity',
    'mollweideBorderOpacity'
  ].forEach(key => {
    filters[key] = clamp01(filters[key]);
  });
  return filters;
}

async function refreshCloudDensityOverlays(ctx, options) {
  const { trueCoordinatesMap, globeMap, mollweideMap } = ctx.getMaps();
  const { state } = ctx;

  if (!state.showCloudDensityFlag) {
    if (state.cloudDensityOverlays.length) {
      clearCloudDensityOverlays(ctx);
    } else {
      state.cloudDensitySignature = '';
      state.cloudDensityRenderSignature = '';
    }
    return;
  }

  const form = document.getElementById('filters-form');
  const files = getSelectedDustCloudFiles(form);
  const topologySignature = buildCloudDensitySignature(files, options);
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
      const overlay = await createCloudDensityOverlay(options.minDistance, options.maxDistance, 2, file, state.cachedStars);
      state.cloudDensityOverlays.push(overlay);
    }
    state.cloudDensitySignature = topologySignature;
  }

  for (const overlay of state.cloudDensityOverlays) {
    updateCloudDensityOverlay(
      overlay,
      trueCoordinatesMap.scene,
      globeMap.scene,
      mollweideMap.scene,
      options.cloudDensityRadius,
      options.cloudDensityOpacity
    );
  }
  state.cloudDensityRenderSignature = renderSignature;
}

export async function buildAndApplyFilters(ctx) {
  const { state } = ctx;
  if (!state.cachedStars) return;

  const { trueCoordinatesMap, globeMap, mollweideMap } = ctx.getMaps();
  const filters = applyFilters(state.cachedStars, {
    scenes: {
      tc: trueCoordinatesMap?.scene,
      globe: globeMap?.scene,
      moll: mollweideMap?.scene
    }
  });
  normalizeFilterOpacityOptions(filters);
  const stellarClassCandidates = filters.stellarClassCandidates || filters.currentFilteredStars;

  if (shouldRebuildStellarClassUi(ctx, stellarClassCandidates)) {
    const stellarSelectionContainer = document.getElementById('stellar-class-selection-container');
    const stellarPreferencesContainer = document.getElementById('stellar-class-preferences-container');
    const previousSelectionState = stellarSelectionContainer
      ? captureFormState(stellarSelectionContainer)
      : null;
    const previousPreferencesState = stellarPreferencesContainer
      ? captureFormState(stellarPreferencesContainer)
      : null;

    generateStellarClassFilters(stellarClassCandidates);
    if (previousSelectionState && stellarSelectionContainer) {
      restoreFormState(stellarSelectionContainer, previousSelectionState, { dispatchEvents: false });
    }
    if (previousPreferencesState && stellarPreferencesContainer) {
      restoreFormState(stellarPreferencesContainer, previousPreferencesState, { dispatchEvents: false });
    }
  }

  const sanitizedConstellationLineWidth = Math.max(0.1, filters.constellationLineWidth || 0.1);
  const sanitizedBorderWidth = Math.max(0.1, filters.mollweideBorderWidth || 0.1);
  const sanitizedBorderOpacity = filters.mollweideBorderOpacity;

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

  if (mollweideMap && typeof mollweideMap.setMollweideBorderAppearance === 'function') {
    mollweideMap.setMollweideBorderAppearance(sanitizedBorderWidth, sanitizedBorderOpacity);
  }

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

export async function updateMollweideView(ctx) {
  const { state } = ctx;
  if (!state.currentMollweideFilteredStars || state.currentMollweideFilteredStars.length === 0) return;

  state.currentMollweideFilteredStars.forEach(star => {
    ctx.updateMollweidePosition(star);
  });

  const { mollweideMap, uvMap, uvGlobeMap } = ctx.getMaps();
  mollweideMap.addStars(state.currentMollweideFilteredStars);
  mollweideMap.updateConnectionPositions(state.currentMollweideFilteredStars, state.currentMollweideConnections);
  mollweideMap.labelManager.refreshLabels(state.currentMollweideFilteredStars);
  uvMap?.updateMap(state.currentGlobeFilteredStars, state.currentGlobeConnections);
  uvGlobeMap?.updateMap(state.currentGlobeFilteredStars, state.currentGlobeConnections);
  if (ctx.editManager) ctx.editManager.registerMollweideEditableLabels();

  refreshMollweideConstellationVisuals(ctx);

  if (state.showCloudsFlag && mollweideMap.scene.userData.cloudOverlays) {
    mollweideMap.scene.userData.cloudOverlays.forEach(line => {
      if (line.userData && line.userData.isMollweideCloud) {
        updateMollweideCloudSegments(line);
      }
    });
  }

  if (state.enableIsolationFilterFlag && state.isolationOverlay && typeof state.isolationOverlay.refreshMollweide === 'function') {
    state.isolationOverlay.refreshMollweide();
  }
  if (state.enableDensityFilterFlag && state.densityOverlay && typeof state.densityOverlay.refreshMollweide === 'function') {
    state.densityOverlay.refreshMollweide();
  }
  if (state.showCloudDensityFlag && Array.isArray(state.cloudDensityOverlays)) {
    state.cloudDensityOverlays.forEach(overlay => overlay.refreshMollweide?.());
  }

  refreshMollweidePlanes(ctx);
  ctx.requestRender();
}
