// src/app/createApp.js
import { createAppState } from './appState.js';
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { setupFilterUI } from '../features/filters/pipeline/index.js';
import { disposeObject3D } from '../render/engine/renderUtils.js';
import { cachedRadToSphere, cachedRadToMollweide, degToRad, setMollweideLambda0, getMollweideLambda0 } from '../shared/geometryUtils.js';
import { minimalRADifference } from '../shared/geometryUtils.js';
import { debounce, createGlobeGrid, angleDiff } from './mapDecorations.js';
import { MapManager } from './mapManager.js';
import { createRenderRequester } from './renderFrame.js';
import { setupMapProjectionToggles } from './projectionVisibility.js';
// UI initialization is now handled by setupFilterUI in filters/index.js
import { loadStarData } from '../data/loaders/loadStarData.js';
import { maybeSavePresets, savePresets, loadPresets, clearSavedPresets } from './presets.js';
import { getStarId as getSharedStarId, getStarTruePosition as getSharedStarTruePosition, getStarGlobePosition, getStarMollweidePosition, precalcMollweideData as precalcSharedMollweideData } from '../shared/starUtils.js';
import { buildAndApplyFilters as runFilterPipeline, updateMollweideView as refreshMollweideMap } from '../features/filters/pipeline/filterPipeline.js';
import { initStarInteractions } from '../render/interactions/starInteractions.js';
import { setRenderRequester, requestRenderIfAvailable } from '../shared/renderScheduler.js';
import { ExportManager } from '../features/export/exportManager.js';
import { EditManager } from '../features/editing/editManager.js';

let cachedStars = null;
let selectedStarData = null;
let selectedHighlightTrue = null;
let selectedHighlightGlobe = null;
let selectedHighlightMollweide = null;
let trueCoordinatesMap;
let globeMap;
let mollweideMap;
let constellationLinesGlobe = [];
let constellationLabelsGlobe = [];
let constellationOverlayGlobe = [];
let constellationLinesMoll = [];
let constellationLabelsMoll = [];
let constellationOverlayMoll = [];
let globeSurfaceSphere = null;
let cloudDensityOverlays = [];
let galacticPlaneTrue = null;
let eclipticPlaneTrue = null;
let celestialEquatorTrue = null;
let galacticPlaneGlobe = null;
let eclipticPlaneGlobe = null;
let celestialEquatorGlobe = null;
let galacticPlaneMoll = null;
let eclipticPlaneMoll = null;
let celestialEquatorMoll = null;
let galacticDirectionLabelsTrue = [];
let galacticDirectionLabelsGlobe = [];
let galacticDirectionLabelsMoll = [];
const filterRuntimeState = {
  currentFilteredStars: [],
  currentConnections: [],
  currentGlobeFilteredStars: [],
  currentGlobeConnections: [],
  currentMollweideFilteredStars: [],
  currentMollweideConnections: [],
  isolationOverlay: null,
  densityOverlay: null,
  showConstellationBoundariesFlag: false,
  showConstellationNamesFlag: false,
  showConstellationOverlayFlag: false,
  enableIsolationFilterFlag: false,
  enableDensityFilterFlag: false,
  showCloudsFlag: false,
  showCloudDensityFlag: false,
  showGalacticPlaneFlag: false,
  showEclipticPlaneFlag: false,
  showCelestialEquatorFlag: false
};

const state = createAppState({
  cachedStars: { get: () => cachedStars, set: v => { cachedStars = v; } },
  currentFilteredStars: { get: () => filterRuntimeState.currentFilteredStars, set: v => { filterRuntimeState.currentFilteredStars = v; } },
  currentConnections: { get: () => filterRuntimeState.currentConnections, set: v => { filterRuntimeState.currentConnections = v; } },
  currentGlobeFilteredStars: { get: () => filterRuntimeState.currentGlobeFilteredStars, set: v => { filterRuntimeState.currentGlobeFilteredStars = v; } },
  currentGlobeConnections: { get: () => filterRuntimeState.currentGlobeConnections, set: v => { filterRuntimeState.currentGlobeConnections = v; } },
  currentMollweideFilteredStars: { get: () => filterRuntimeState.currentMollweideFilteredStars, set: v => { filterRuntimeState.currentMollweideFilteredStars = v; } },
  currentMollweideConnections: { get: () => filterRuntimeState.currentMollweideConnections, set: v => { filterRuntimeState.currentMollweideConnections = v; } },
  selectedStarData: { get: () => selectedStarData, set: v => { selectedStarData = v; } },
  selectedHighlightTrue: { get: () => selectedHighlightTrue, set: v => { selectedHighlightTrue = v; } },
  selectedHighlightGlobe: { get: () => selectedHighlightGlobe, set: v => { selectedHighlightGlobe = v; } },
  selectedHighlightMollweide: { get: () => selectedHighlightMollweide, set: v => { selectedHighlightMollweide = v; } },
  constellationLinesGlobe: { get: () => constellationLinesGlobe, set: v => { constellationLinesGlobe = v; } },
  constellationLabelsGlobe: { get: () => constellationLabelsGlobe, set: v => { constellationLabelsGlobe = v; } },
  constellationOverlayGlobe: { get: () => constellationOverlayGlobe, set: v => { constellationOverlayGlobe = v; } },
  constellationLinesMoll: { get: () => constellationLinesMoll, set: v => { constellationLinesMoll = v; } },
  constellationLabelsMoll: { get: () => constellationLabelsMoll, set: v => { constellationLabelsMoll = v; } },
  constellationOverlayMoll: { get: () => constellationOverlayMoll, set: v => { constellationOverlayMoll = v; } },
  globeSurfaceSphere: { get: () => globeSurfaceSphere, set: v => { globeSurfaceSphere = v; } },
  isolationOverlay: { get: () => filterRuntimeState.isolationOverlay, set: v => { filterRuntimeState.isolationOverlay = v; } },
  densityOverlay: { get: () => filterRuntimeState.densityOverlay, set: v => { filterRuntimeState.densityOverlay = v; } },
  cloudDensityOverlays: { get: () => cloudDensityOverlays, set: v => { cloudDensityOverlays = v; } },
  galacticPlaneTrue: { get: () => galacticPlaneTrue, set: v => { galacticPlaneTrue = v; } },
  eclipticPlaneTrue: { get: () => eclipticPlaneTrue, set: v => { eclipticPlaneTrue = v; } },
  celestialEquatorTrue: { get: () => celestialEquatorTrue, set: v => { celestialEquatorTrue = v; } },
  galacticPlaneGlobe: { get: () => galacticPlaneGlobe, set: v => { galacticPlaneGlobe = v; } },
  eclipticPlaneGlobe: { get: () => eclipticPlaneGlobe, set: v => { eclipticPlaneGlobe = v; } },
  celestialEquatorGlobe: { get: () => celestialEquatorGlobe, set: v => { celestialEquatorGlobe = v; } },
  galacticPlaneMoll: { get: () => galacticPlaneMoll, set: v => { galacticPlaneMoll = v; } },
  eclipticPlaneMoll: { get: () => eclipticPlaneMoll, set: v => { eclipticPlaneMoll = v; } },
  celestialEquatorMoll: { get: () => celestialEquatorMoll, set: v => { celestialEquatorMoll = v; } },
  galacticDirectionLabelsTrue: { get: () => galacticDirectionLabelsTrue, set: v => { galacticDirectionLabelsTrue = v; } },
  galacticDirectionLabelsGlobe: { get: () => galacticDirectionLabelsGlobe, set: v => { galacticDirectionLabelsGlobe = v; } },
  galacticDirectionLabelsMoll: { get: () => galacticDirectionLabelsMoll, set: v => { galacticDirectionLabelsMoll = v; } },
  showConstellationBoundariesFlag: { get: () => filterRuntimeState.showConstellationBoundariesFlag, set: v => { filterRuntimeState.showConstellationBoundariesFlag = v; } },
  showConstellationNamesFlag: { get: () => filterRuntimeState.showConstellationNamesFlag, set: v => { filterRuntimeState.showConstellationNamesFlag = v; } },
  showConstellationOverlayFlag: { get: () => filterRuntimeState.showConstellationOverlayFlag, set: v => { filterRuntimeState.showConstellationOverlayFlag = v; } },
  enableIsolationFilterFlag: { get: () => filterRuntimeState.enableIsolationFilterFlag, set: v => { filterRuntimeState.enableIsolationFilterFlag = v; } },
  enableDensityFilterFlag: { get: () => filterRuntimeState.enableDensityFilterFlag, set: v => { filterRuntimeState.enableDensityFilterFlag = v; } },
  showCloudsFlag: { get: () => filterRuntimeState.showCloudsFlag, set: v => { filterRuntimeState.showCloudsFlag = v; } },
  showCloudDensityFlag: { get: () => filterRuntimeState.showCloudDensityFlag, set: v => { filterRuntimeState.showCloudDensityFlag = v; } },
  showGalacticPlaneFlag: { get: () => filterRuntimeState.showGalacticPlaneFlag, set: v => { filterRuntimeState.showGalacticPlaneFlag = v; } },
  showEclipticPlaneFlag: { get: () => filterRuntimeState.showEclipticPlaneFlag, set: v => { filterRuntimeState.showEclipticPlaneFlag = v; } },
  showCelestialEquatorFlag: { get: () => filterRuntimeState.showCelestialEquatorFlag, set: v => { filterRuntimeState.showCelestialEquatorFlag = v; } }
});

let editManager = null;
let exportManager = null;

const appContext = {
  state,
  getMaps: () => ({ trueCoordinatesMap, globeMap, mollweideMap }),
  getStarTruePosition: getSharedStarTruePosition,
  projectStarGlobe: getStarGlobePosition,
  projectStarMollweide: getStarMollweidePosition,
  precalcMollweideData: precalcSharedMollweideData,
  updateMollweidePosition,
  applyGlobeSurface,
  requestRender: () => requestRender(),
  get editManager() { return editManager; }
};

async function buildAndApplyFilters() {
  return runFilterPipeline(appContext);
}

async function updateMollweideView() {
  return refreshMollweideMap(appContext);
}

function persistPresets() {
  if (editManager) {
    const state = editManager.getState();
    savePresets({
      starLabelOffsets: state.starLabelOffsets,
      starLabelRotations: state.starLabelRotations,
      starLabelScales: state.starLabelScales,
      constellationLabelOffsets: state.constellationLabelOffsets,
      galacticLabelOffsets: state.galacticLabelOffsets,
      removedLineSegments: state.removedLineSegments,
      hiddenLineKeys: state.hiddenLineKeys
    });
  }
}

function maybePersistPresets() {
  maybeSavePresets(persistPresets);
}

function updateMollweidePosition(star) {
  const lambda = minimalRADifference(star.raRad - getMollweideLambda0());
  if (!star.mollweidePosition) star.mollweidePosition = new THREE.Vector3();
  star.mollweidePosition.set(star.mollXFactor * lambda, star.mollY, 0);
}

let pendingMollweideUpdate = false;
function scheduleMollweideUpdate() {
  if (!pendingMollweideUpdate) {
    pendingMollweideUpdate = true;
    requestAnimationFrame(() => {
      pendingMollweideUpdate = false;
      updateMollweideView();
    });
  }
}





const mapManagers = [];
const requestRender = createRenderRequester(mapManagers, () => editManager);
setRenderRequester(requestRender);

function applyGlobeSurface(isOpaque) {
  if (globeSurfaceSphere) {
    globeMap.scene.remove(globeSurfaceSphere);
    globeSurfaceSphere.geometry?.dispose?.();
    globeSurfaceSphere.material?.dispose?.();
    globeSurfaceSphere = null;
  }
  if (isOpaque) {
    const geom = new THREE.SphereGeometry(99, 32, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.FrontSide,
      depthWrite: true,
      depthTest: true,
      transparent: false
    });
    globeSurfaceSphere = new THREE.Mesh(geom, mat);
    globeSurfaceSphere.renderOrder = 0;
    globeSurfaceSphere.frustumCulled = false;
    globeMap.scene.add(globeSurfaceSphere);
  }
}

export async function bootstrapApp() {
  const loader = document.getElementById('loader');
  loader.classList.remove('hidden');
  try {
    cachedStars = await loadStarData();
    if (!cachedStars.length) throw new Error('No star data available');
    await setupFilterUI(cachedStars);
    const form = document.getElementById('filters-form');
    if (form) {
      const presetsFs = document.getElementById('save-presets-fieldset');
      if (presetsFs) form.appendChild(presetsFs);
    }
    trueCoordinatesMap = new MapManager({ canvasId: 'map3D', mapType: 'TrueCoordinates', state, scheduleMollweideUpdate, getEditManager: () => editManager });
    globeMap = new MapManager({ canvasId: 'sphereMap', mapType: 'Globe', state, scheduleMollweideUpdate, getEditManager: () => editManager });
    mollweideMap = new MapManager({ canvasId: 'mollweideMap', mapType: 'Mollweide', state, scheduleMollweideUpdate, getEditManager: () => editManager });
    mapManagers.push(trueCoordinatesMap, globeMap, mollweideMap);

    // Initialize EditManager
    editManager = new EditManager(
      mollweideMap,
      cachedStars,
      constellationLabelsMoll,
      galacticDirectionLabelsMoll,
      getSharedStarId,
      buildAndApplyFilters,
      maybePersistPresets,
      requestRender
    );

    // Load presets with edit manager's state
    const editState = editManager.getState();
    loadPresets({
      starLabelOffsets: editState.starLabelOffsets,
      starLabelRotations: editState.starLabelRotations,
      starLabelScales: editState.starLabelScales,
      constellationLabelOffsets: editState.constellationLabelOffsets,
      galacticLabelOffsets: editState.galacticLabelOffsets,
      removedLineSegments: editState.removedLineSegments,
      hiddenLineKeys: editState.hiddenLineKeys
    });

    const debouncedApplyFilters = debounce(buildAndApplyFilters, 150);
    if (form) {
      form.addEventListener('change', () => {
        debouncedApplyFilters();
        maybePersistPresets();
      });
    }
    const clearBtn = document.getElementById('clear-saved-presets');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        clearSavedPresets();
        window.location.reload();
      });
    }

    cachedStars.forEach(star => {
      star.spherePosition = getStarGlobePosition(star);
      star.truePosition = getSharedStarTruePosition(star);
      precalcSharedMollweideData(star);
      updateMollweidePosition(star);
      const id = getSharedStarId(star);
      if (editManager.starLabelOffsets.has(id)) {
        const off = editManager.starLabelOffsets.get(id);
        star.mollLabelOffset = new THREE.Vector3(off.x, off.y, 0);
      }
      if (editManager.starLabelRotations.has(id)) {
        star.mollLabelRotation = editManager.starLabelRotations.get(id);
      }
      if (editManager.starLabelScales.has(id)) {
        const sc = editManager.starLabelScales.get(id);
        star.mollLabelScale = new THREE.Vector3(sc.x, sc.y, 1);
      }
    });

    const globeGrid = createGlobeGrid(100, { color: 0x444444, opacity: 0.2, lineWidth: 1 });
    globeMap.scene.add(globeGrid);
    buildAndApplyFilters();
    initStarInteractions(appContext, trueCoordinatesMap);
    initStarInteractions(appContext, globeMap);
    initStarInteractions(appContext, mollweideMap);

    // Setup managers
    setupMapProjectionToggles({
      requestRender,
      maybePersistPresets,
      trueCoordinatesMap,
      globeMap,
      mollweideMap
    });
    exportManager = new ExportManager(mollweideMap);
    exportManager.setup();
    editManager.setConstellationLinesMoll(constellationLinesMoll);
    editManager.setIsolationOverlay(state.isolationOverlay);
    editManager.setupAll();

    requestRender();
    loader.classList.add('hidden');
  } catch (err) {
    console.error('Error initializing starmap:', err);
    alert('Initialization failed. Check console for details.');
    loader.classList.add('hidden');
  }
}


