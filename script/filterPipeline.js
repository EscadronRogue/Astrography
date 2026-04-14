import { applyFilters, generateStellarClassFilters } from '../filters/index.js';
import { setConnectionLineParams } from '../filters/connectionsFilter.js';
import { disposeObject3D } from '../utils/renderUtils.js';
import {
  updateCloudsOverlay,
  updateMollweideCloudSegments
} from '../filters/cloudsFilter.js';
import { createCloudDensityOverlay, updateCloudDensityOverlay } from '../filters/cloudDensityFilter.js';
import { captureStellarClassState, restoreStellarClassState } from '../app/stellarClassState.js';
import { applyPlanes, refreshMollweidePlanes } from './planeManager.js';
import { rebuildConstellationVisuals, refreshMollweideConstellationVisuals } from './constellationManager.js';

function updateProjectedPositions(ctx) {
  const { state } = ctx;
  state.currentGlobeFilteredStars.forEach(star => {
    star.spherePosition = ctx.projectStarGlobe(star);
  });
  state.currentFilteredStars.forEach(star => {
    star.truePosition = ctx.getStarTruePosition(star);
  });
  state.currentMollweideFilteredStars.forEach(star => {
    ctx.precalcMollweideData(star);
    ctx.updateMollweidePosition(star);
  });
}

function updateMapDisplays(ctx, options) {
  const { trueCoordinatesMap, globeMap, mollweideMap } = ctx.getMaps();
  const { state } = ctx;
  trueCoordinatesMap.setStarOpacity(options.starOpacity / 100);
  globeMap.setStarOpacity(options.starOpacity / 100);
  mollweideMap.setStarOpacity(options.starOpacity / 100);
  trueCoordinatesMap.setLabelOpacity(options.starNameOpacity / 100);
  globeMap.setLabelOpacity(options.starNameOpacity / 100);
  mollweideMap.setLabelOpacity(options.starNameOpacity / 100);
  trueCoordinatesMap.setConnectionOpacity(options.connectionOpacity / 100);
  globeMap.setConnectionOpacity(options.connectionOpacity / 100);
  mollweideMap.setConnectionOpacity(options.connectionOpacity / 100);
  setConnectionLineParams(options.connectionWidth, options.connectionFade, options.connectionLabelSize);

  trueCoordinatesMap.connectionOpacity = options.connectionOpacity / 100;
  globeMap.connectionOpacity = options.connectionOpacity / 100;
  mollweideMap.connectionOpacity = options.connectionOpacity / 100;

  trueCoordinatesMap.updateMap(state.currentFilteredStars, state.currentConnections);
  trueCoordinatesMap.labelManager.refreshLabels(state.currentFilteredStars);
  globeMap.updateMap(state.currentGlobeFilteredStars, state.currentGlobeConnections);
  globeMap.labelManager.refreshLabels(state.currentGlobeFilteredStars);
  mollweideMap.addStars(state.currentMollweideFilteredStars);
  mollweideMap.updateStarPositions(state.currentMollweideFilteredStars);
  mollweideMap.updateConnections(
    state.currentMollweideFilteredStars,
    state.currentMollweideConnections,
    mollweideMap.connectionOpacity
  );
  mollweideMap.labelManager.refreshLabels(state.currentMollweideFilteredStars);
  ctx.editManager.registerMollweideEditableLabels();
}

async function refreshCloudOverlays(ctx, options) {
  const { trueCoordinatesMap, globeMap, mollweideMap } = ctx.getMaps();
  const { state } = ctx;
  const form = document.getElementById('filters-form');

  if (options.showClouds) {
    const cloudDataFiles = new FormData(form).getAll('dust-clouds');
    await updateCloudsOverlay(state.cachedStars, trueCoordinatesMap.scene, 'TrueCoordinates', cloudDataFiles, options.cloudOpacity / 100);
    await updateCloudsOverlay(state.cachedStars, globeMap.scene, 'Globe', cloudDataFiles, options.cloudOpacity / 100);
    await updateCloudsOverlay(state.cachedStars, mollweideMap.scene, 'Mollweide', cloudDataFiles, options.cloudOpacity / 100);
  } else {
    await updateCloudsOverlay(state.cachedStars, trueCoordinatesMap.scene, 'TrueCoordinates', [], options.cloudOpacity / 100);
    await updateCloudsOverlay(state.cachedStars, globeMap.scene, 'Globe', [], options.cloudOpacity / 100);
    await updateCloudsOverlay(state.cachedStars, mollweideMap.scene, 'Mollweide', [], options.cloudOpacity / 100);
  }
}

function clearCloudDensityOverlays(ctx) {
  const { trueCoordinatesMap, globeMap, mollweideMap } = ctx.getMaps();
  const { state } = ctx;
  state.cloudDensityOverlays.forEach(overlay => {
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
}

async function refreshCloudDensityOverlays(ctx, options) {
  const { trueCoordinatesMap, globeMap, mollweideMap } = ctx.getMaps();
  const { state } = ctx;

  clearCloudDensityOverlays(ctx);
  if (!state.showCloudDensityFlag) return;

  const form = document.getElementById('filters-form');
  const files = new FormData(form).getAll('dust-density-clouds');
  for (const file of files) {
    const overlay = await createCloudDensityOverlay(options.minDistance, options.maxDistance, 2, file, state.cachedStars);
    updateCloudDensityOverlay(
      overlay,
      trueCoordinatesMap.scene,
      globeMap.scene,
      mollweideMap.scene,
      options.cloudDensityRadius,
      options.cloudDensityOpacity / 100
    );
    state.cloudDensityOverlays.push(overlay);
  }
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
  const previousStellarClassState = captureStellarClassState();
  generateStellarClassFilters(filters.filteredStars);
  restoreStellarClassState(previousStellarClassState);

  const sanitizedConstellationLineWidth = Math.max(0.1, filters.constellationLineWidth || 0.1);
  const sanitizedBorderWidth = Math.max(0.1, filters.mollweideBorderWidth || 0.1);
  const sanitizedBorderOpacity = Math.max(0, Math.min(100, filters.mollweideBorderOpacity));

  Object.assign(state, {
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
    isolationOverlay: filters.isolationOverlay,
    densityOverlay: filters.densityOverlay,
    currentFilteredStars: filters.filteredStars,
    currentConnections: filters.connections,
    currentGlobeFilteredStars: filters.globeFilteredStars,
    currentGlobeConnections: filters.globeConnections,
    currentMollweideFilteredStars: filters.mollweideFilteredStars,
    currentMollweideConnections: filters.mollweideConnections
  });

  updateProjectedPositions(ctx);
  updateMapDisplays(ctx, filters);

  rebuildConstellationVisuals(ctx, {
    showConstellationBoundaries: filters.showConstellationBoundaries,
    showConstellationNames: filters.showConstellationNames,
    showConstellationOverlay: filters.showConstellationOverlay,
    constellationLineOpacity: filters.constellationLineOpacity / 100,
    constellationLineWidth: sanitizedConstellationLineWidth,
    constellationNameOpacity: filters.constellationNameOpacity / 100
  });

  const { mollweideMap } = ctx.getMaps();
  if (mollweideMap && typeof mollweideMap.setMollweideBorderAppearance === 'function') {
    mollweideMap.setMollweideBorderAppearance(sanitizedBorderWidth, sanitizedBorderOpacity / 100);
  }

  await refreshCloudOverlays(ctx, filters);
  await refreshCloudDensityOverlays(ctx, filters);

  applyPlanes(ctx, {
    showGalacticPlane: filters.showGalacticPlane,
    showEclipticPlane: filters.showEclipticPlane,
    showCelestialEquator: filters.showCelestialEquator
  }, filters.planeOpacity / 100);

  ctx.applyGlobeSurface(filters.globeOpaqueSurface);
  ctx.requestRender();
}

export async function updateMollweideView(ctx) {
  const { state } = ctx;
  if (!state.currentMollweideFilteredStars || state.currentMollweideFilteredStars.length === 0) return;

  state.currentMollweideFilteredStars.forEach(star => {
    ctx.updateMollweidePosition(star);
  });

  const { mollweideMap } = ctx.getMaps();
  mollweideMap.addStars(state.currentMollweideFilteredStars);
  mollweideMap.updateStarPositions(state.currentMollweideFilteredStars);
  mollweideMap.updateConnectionPositions(state.currentMollweideFilteredStars, state.currentMollweideConnections);
  mollweideMap.labelManager.refreshLabels(state.currentMollweideFilteredStars);
  ctx.editManager.registerMollweideEditableLabels();

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

  refreshMollweidePlanes(ctx);
  ctx.requestRender();
}
