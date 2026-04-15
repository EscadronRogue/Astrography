/**
 * @file Application bootstrap — wires services, loads data, and starts the app.
 * Kept deliberately thin: state lives in appStateFactory, globe surface in globeSurface,
 * Mollweide updates in mollweideUpdater, and star preprocessing in starPreprocessor.
 */
import { state, getCachedStars, setCachedStars, getConstellationLinesMoll, getGalacticDirectionLabelsMoll } from './appStateFactory.js';
import { setupFilterUI } from '../features/filters/pipeline/index.js';
import { loadStarData } from '../data/loaders/loadStarData.js';
import { MapManager } from './mapManager.js';
import { createRenderRequester } from './renderFrame.js';
import { setupMapProjectionToggles } from './projectionVisibility.js';
import { debounce, createGlobeGrid } from './mapDecorations.js';
import { maybeSavePresets, savePresets, loadPresets, clearSavedPresets } from './presets.js';
import { getStarId } from '../shared/starUtils.js';
import { getStarTruePosition as getSharedStarTruePosition, getStarGlobePosition, getStarMollweidePosition, precalcMollweideData as precalcSharedMollweideData } from '../shared/starUtils.js';
import { buildAndApplyFilters as runFilterPipeline, updateMollweideView as refreshMollweideMap } from '../features/filters/pipeline/filterPipeline.js';
import { initStarInteractions } from '../render/interactions/starInteractions.js';
import { setRenderRequester, requestRenderIfAvailable } from '../shared/renderScheduler.js';
import { ExportManager } from '../features/export/exportManager.js';
import { EditManager } from '../features/editing/editManager.js';
import { applyGlobeSurface } from './globeSurface.js';
import { updateMollweidePosition, createMollweideScheduler } from './mollweideUpdater.js';
import { preprocessStarData } from './starPreprocessor.js';

// ---------------------------------------------------------------------------
// Map managers and render coordination
// ---------------------------------------------------------------------------
let trueCoordinatesMap;
let globeMap;
let mollweideMap;
let editManager = null;
let exportManager = null;

const mapManagers = [];
const requestRender = createRenderRequester(mapManagers, () => editManager);
setRenderRequester(requestRender);

// ---------------------------------------------------------------------------
// Thin wrappers that close over appContext
// ---------------------------------------------------------------------------
const appContext = {
  state,
  getMaps: () => ({ trueCoordinatesMap, globeMap, mollweideMap }),
  getStarTruePosition: getSharedStarTruePosition,
  projectStarGlobe: getStarGlobePosition,
  projectStarMollweide: getStarMollweidePosition,
  precalcMollweideData: precalcSharedMollweideData,
  updateMollweidePosition,
  applyGlobeSurface: (isOpaque) => applyGlobeSurface(isOpaque, globeMap.scene),
  requestRender: () => requestRender(),
  get editManager() { return editManager; }
};

async function buildAndApplyFilters() {
  return runFilterPipeline(appContext);
}

async function updateMollweideView() {
  return refreshMollweideMap(appContext);
}

const scheduleMollweideUpdate = createMollweideScheduler(updateMollweideView);

// ---------------------------------------------------------------------------
// Preset persistence helpers
// ---------------------------------------------------------------------------
function persistPresets() {
  if (editManager) {
    const edState = editManager.getState();
    savePresets({
      starLabelOffsets: edState.starLabelOffsets,
      starLabelRotations: edState.starLabelRotations,
      starLabelScales: edState.starLabelScales,
      constellationLabelOffsets: edState.constellationLabelOffsets,
      galacticLabelOffsets: edState.galacticLabelOffsets,
      removedLineSegments: edState.removedLineSegments,
      hiddenLineKeys: edState.hiddenLineKeys
    });
  }
}

function maybePersistPresets() {
  maybeSavePresets(persistPresets);
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
export async function bootstrapApp() {
  const loader = document.getElementById('loader');
  loader.classList.remove('hidden');
  try {
    const stars = await loadStarData();
    setCachedStars(stars);
    if (!stars.length) throw new Error('No star data available');

    await setupFilterUI(stars);

    // Move presets fieldset to end of form
    const form = document.getElementById('filters-form');
    if (form) {
      const presetsFs = document.getElementById('save-presets-fieldset');
      if (presetsFs) form.appendChild(presetsFs);
    }

    // Create map managers
    trueCoordinatesMap = new MapManager({ canvasId: 'map3D', mapType: 'TrueCoordinates', state, scheduleMollweideUpdate, getEditManager: () => editManager });
    globeMap = new MapManager({ canvasId: 'sphereMap', mapType: 'Globe', state, scheduleMollweideUpdate, getEditManager: () => editManager });
    mollweideMap = new MapManager({ canvasId: 'mollweideMap', mapType: 'Mollweide', state, scheduleMollweideUpdate, getEditManager: () => editManager });
    mapManagers.push(trueCoordinatesMap, globeMap, mollweideMap);

    // Initialize EditManager
    editManager = new EditManager(
      mollweideMap,
      stars,
      getConstellationLinesMoll(),
      getGalacticDirectionLabelsMoll(),
      getStarId,
      buildAndApplyFilters,
      maybePersistPresets,
      requestRender
    );

    // Load presets with edit manager's state
    const edState = editManager.getState();
    loadPresets({
      starLabelOffsets: edState.starLabelOffsets,
      starLabelRotations: edState.starLabelRotations,
      starLabelScales: edState.starLabelScales,
      constellationLabelOffsets: edState.constellationLabelOffsets,
      galacticLabelOffsets: edState.galacticLabelOffsets,
      removedLineSegments: edState.removedLineSegments,
      hiddenLineKeys: edState.hiddenLineKeys
    });

    // Wire form change listeners
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

    // Preprocess star positions and apply stored edits
    preprocessStarData(stars, editManager);

    // Scene setup
    const globeGrid = createGlobeGrid(100, { color: 0x444444, opacity: 0.2, lineWidth: 1 });
    globeMap.scene.add(globeGrid);

    // Initial filter pass
    buildAndApplyFilters();

    // Star interactions on all maps
    initStarInteractions(appContext, trueCoordinatesMap);
    initStarInteractions(appContext, globeMap);
    initStarInteractions(appContext, mollweideMap);

    // Projection toggles
    setupMapProjectionToggles({
      requestRender,
      maybePersistPresets,
      trueCoordinatesMap,
      globeMap,
      mollweideMap
    });

    // Export and edit managers
    exportManager = new ExportManager(mollweideMap);
    exportManager.setup();
    editManager.setConstellationLinesMoll(getConstellationLinesMoll());
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
