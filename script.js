import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { setupFilterUI } from './filters/index.js';
import { minimalRADifference } from './utils.js';
import { initFilterUI } from './ui/filterUI.js';
import { loadStarData } from './app/starData.js';
import { maybeSavePresets, savePresets, loadPresets, clearSavedPresets } from './app/presets.js';
import {
  getStarId as getSharedStarId,
  getStarTruePosition as getSharedStarTruePosition,
  getStarGlobePosition,
  getStarMollweidePosition,
  precalcMollweideData as precalcSharedMollweideData
} from './shared/starUtils.js';
import { buildAndApplyFilters as runFilterPipeline, updateMollweideView as refreshMollweideMap } from './script/filterPipeline.js';
import { initStarInteractions } from './script/starInteractions.js';
import { setRenderRequester } from './shared/renderScheduler.js';
import { getMollweideLambda0 } from './utils/geometryUtils.js';
import { createAppState } from './script/appState.js';
import { createGlobeGrid, MapManager } from './script/mapManager.js';
import {
  hydrateStarsForRuntime,
  initializeFeatureManagers,
  setupMapProjectionToggles,
  wirePresetForm
} from './script/bootstrapManager.js';

const state = createAppState();
let trueCoordinatesMap = null;
let globeMap = null;
let mollweideMap = null;
let editManager = null;
let exportManager = null;
let pendingMollweideUpdate = false;

const mapManagers = [];
let renderRequested = false;

const appContext = {
  state,
  getMaps: () => ({ trueCoordinatesMap, globeMap, mollweideMap }),
  getStarTruePosition,
  projectStarGlobe,
  projectStarMollweide,
  precalcMollweideData,
  updateMollweidePosition,
  applyGlobeSurface,
  requestRender,
  editManager: {
    registerMollweideEditableLabels: () => editManager?.registerMollweideEditableLabels?.(),
    applyStoredLineEdits: root => editManager?.applyStoredLineEdits?.(root)
  }
};

async function buildAndApplyFilters() {
  return runFilterPipeline(appContext);
}

async function updateMollweideView() {
  return refreshMollweideMap(appContext);
}

function persistPresets() {
  savePresets({
    ...state.presetMaps,
    ...state.lineState
  });
}

function maybePersistPresets() {
  maybeSavePresets(persistPresets);
}

function getStarId(star) {
  return getSharedStarId(star);
}

function getStarTruePosition(star) {
  return getSharedStarTruePosition(star);
}

function projectStarGlobe(star) {
  return getStarGlobePosition(star);
}

function projectStarMollweide(star) {
  return getStarMollweidePosition(star);
}

function precalcMollweideData(star) {
  return precalcSharedMollweideData(star);
}

function updateMollweidePosition(star) {
  const lambda = minimalRADifference(star.raRad - getMollweideLambda0());
  if (!star.mollweidePosition) star.mollweidePosition = new THREE.Vector3();
  star.mollweidePosition.set(star.mollXFactor * lambda, star.mollY, 0);
}

function scheduleMollweideUpdate() {
  if (pendingMollweideUpdate) return;
  pendingMollweideUpdate = true;
  requestAnimationFrame(() => {
    pendingMollweideUpdate = false;
    updateMollweideView();
  });
}

function applyGlobeSurface(isOpaque) {
  if (state.globeSurfaceSphere) {
    globeMap.scene.remove(state.globeSurfaceSphere);
    state.globeSurfaceSphere.geometry?.dispose?.();
    state.globeSurfaceSphere.material?.dispose?.();
    state.globeSurfaceSphere = null;
  }
  if (!isOpaque) return;

  const geometry = new THREE.SphereGeometry(99, 32, 32);
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.FrontSide,
    depthWrite: true,
    depthTest: true,
    transparent: false
  });
  state.globeSurfaceSphere = new THREE.Mesh(geometry, material);
  state.globeSurfaceSphere.renderOrder = 0;
  state.globeSurfaceSphere.frustumCulled = false;
  globeMap.scene.add(state.globeSurfaceSphere);
}

function requestRender() {
  if (renderRequested) return;
  renderRequested = true;
  requestAnimationFrame(() => {
    renderRequested = false;
    mapManagers.forEach(manager => manager.render());
    editManager?.updateOverlay?.();
  });
}
setRenderRequester(requestRender);

function createMaps() {
  const createStoredLineEditApplier = () => root => editManager?.applyStoredLineEdits?.(root);
  trueCoordinatesMap = new MapManager({
    canvasId: 'map3D',
    mapType: 'TrueCoordinates',
    applyStoredLineEdits: createStoredLineEditApplier()
  });
  globeMap = new MapManager({
    canvasId: 'sphereMap',
    mapType: 'Globe',
    applyStoredLineEdits: createStoredLineEditApplier()
  });
  mollweideMap = new MapManager({
    canvasId: 'mollweideMap',
    mapType: 'Mollweide',
    onMollweidePan: scheduleMollweideUpdate,
    onMollweideIsolationPan: () => {
      if (state.enableIsolationFilterFlag && state.isolationOverlay?.refreshMollweide) {
        state.isolationOverlay.refreshMollweide();
      }
      if (state.enableDensityFilterFlag && state.densityOverlay?.refreshMollweide) {
        state.densityOverlay.refreshMollweide();
      }
    },
    applyStoredLineEdits: createStoredLineEditApplier()
  });
  mapManagers.splice(0, mapManagers.length, trueCoordinatesMap, globeMap, mollweideMap);
}

async function main() {
  const loader = document.getElementById('loader');
  loader.classList.remove('hidden');

  try {
    state.cachedStars = await loadStarData();
    if (!state.cachedStars.length) throw new Error('No star data available');

    initFilterUI();
    await setupFilterUI(state.cachedStars);

    const form = document.getElementById('filters-form');
    if (form) {
      const presetsFieldset = document.getElementById('save-presets-fieldset');
      if (presetsFieldset) form.appendChild(presetsFieldset);
    }

    loadPresets({
      ...state.presetMaps,
      ...state.lineState
    });

    wirePresetForm({
      form,
      onApplyFilters: (() => {
        let timeoutId = null;
        return () => {
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => buildAndApplyFilters(), 150);
        };
      })(),
      maybePersistPresets,
      onClearPresets: () => {
        clearSavedPresets();
        window.location.reload();
      }
    });

    createMaps();

    hydrateStarsForRuntime(state.cachedStars, {
      projectStarGlobe,
      getStarTruePosition,
      precalcMollweideData,
      updateMollweidePosition,
      getStarId
    }, state.presetMaps);

    globeMap.scene.add(createGlobeGrid(100, { color: 0x444444, opacity: 0.2, lineWidth: 1 }));

    ({ exportManager, editManager } = initializeFeatureManagers({
      state,
      mollweideMap,
      requestRender,
      maybePersistPresets,
      rebuildFilters: buildAndApplyFilters
    }));

    await buildAndApplyFilters();

    initStarInteractions(appContext, trueCoordinatesMap);
    initStarInteractions(appContext, globeMap);
    initStarInteractions(appContext, mollweideMap);

    setupMapProjectionToggles({
      requestRender,
      maybePersistPresets,
      mapBindings: [
        { checkboxId: 'map-true', container: document.getElementById('map3D').parentElement, manager: trueCoordinatesMap },
        { checkboxId: 'map-globe', container: document.getElementById('sphereMap').parentElement, manager: globeMap },
        { checkboxId: 'map-mollweide', container: document.getElementById('mollweideMap').parentElement, manager: mollweideMap }
      ]
    });

    exportManager?.setup();
    editManager?.setup();
    requestRender();
    loader.classList.add('hidden');
  } catch (error) {
    console.error('Error initializing starmap:', error);
    alert('Initialization failed. Check console for details.');
    loader.classList.add('hidden');
  }
}

window.addEventListener('DOMContentLoaded', main);
