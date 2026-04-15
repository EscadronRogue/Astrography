import { applyFilters, generateStellarClassFilters } from './index.js';
import { setConnectionLineParams } from '../../connections/connectionsBuilder.js';
import { disposeObject3D } from '../../../render/engine/renderUtils.js';
import {
  updateCloudsOverlay,
  updateMollweideCloudSegments
} from '../../clouds/cloudRenderer.js';
import { createCloudDensityOverlay, updateCloudDensityOverlay } from '../../clouds/cloudDensityRenderer.js';
import { captureFormState, restoreFormState } from '../../../shared/formUtils.js';
import { syncFilterResultsToAppState } from '../state/filterStateStore.js';
import { applyPlanes, refreshMollweidePlanes } from '../../planes/planeManager.js';
import { rebuildConstellationVisuals, refreshMollweideConstellationVisuals } from '../../constellations/constellationManager.js';
import { getStarEquirectangularPosition } from '../../../shared/uvUtils.js';

function updateProjectedPositions(ctx) {
  const { state } = ctx;
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
}

function updateMapDisplays(ctx, options) {
  const { trueCoordinatesMap, globeMap, mollweideMap, uvMap, uvGlobeMap } = ctx.getMaps();
  const { state } = ctx;
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
  uvMap?.updateMap(state.currentGlobeFilteredStars, state.currentGlobeConnections);
  uvGlobeMap?.updateMap(state.currentGlobeFilteredStars, state.currentGlobeConnections);
  if (ctx.editManager) ctx.editManager.registerMollweideEditableLabels();
}

async function refreshCloudOverlays(ctx, options) {
  const { trueCoordinatesMap, globeMap, mollweideMap } = ctx.getMaps();
  const { state } = ctx;
  const form = document.getElementById('filters-form');

  if (options.showClouds) {
    const cloudDataFiles = new FormData(form).getAll('dust-clouds');
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
      options.cloudDensityOpacity
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
  const scContainer = document.getElementById('stellar-class-container');
  const previousStellarClassState = scContainer ? captureFormState(scContainer) : null;
  generateStellarClassFilters(filters.filteredStars);
  if (previousStellarClassState && scContainer) {
    restoreFormState(scContainer, previousStellarClassState, { dispatchEvents: false });
  }

  const sanitizedConstellationLineWidth = Math.max(0.1, filters.constellationLineWidth || 0.1);
  const sanitizedBorderWidth = Math.max(0.1, filters.mollweideBorderWidth || 0.1);
  const sanitizedBorderOpacity = Math.max(0, Math.min(1, filters.mollweideBorderOpacity));

  syncFilterResultsToAppState(state, filters);

  updateProjectedPositions(ctx);
  updateMapDisplays(ctx, filters);

  rebuildConstellationVisuals(ctx, {
    showConstellationBoundaries: filters.showConstellationBoundaries,
    showConstellationNames: filters.showConstellationNames,
    showConstellationOverlay: filters.showConstellationOverlay,
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
  mollweideMap.updateStarPositions(state.currentMollweideFilteredStars);
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

  refreshMollweidePlanes(ctx);
  ctx.requestRender();
}
