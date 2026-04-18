/**
 * @file Application bootstrap — wires services, loads data, and starts the app.
 * Kept deliberately thin: state lives in appStateFactory, globe surface in globeSurface,
 * Mollweide updates in mollweideUpdater, and star preprocessing in starPreprocessor.
 */
import { state, getCachedStars, setCachedStars, getConstellationLinesMoll, getGalacticDirectionLabelsMoll } from './appStateFactory.js';
import { setupFilterUI } from '../features/filters/pipeline/index.js';
import { loadStarData } from '../data/loaders/loadStarData.js';
import { MapManager } from './mapManager.js';
import { UVMapManager } from './uvMapManager.js';
import { createRenderRequester } from './renderFrame.js';
import { setupMapProjectionToggles } from './projectionVisibility.js';
import { debounce, createGlobeGrid } from './mapDecorations.js';
import { maybeSavePresets, savePresets, loadPresets, clearSavedPresets } from './presets.js';
import { getStarId } from '../shared/starUtils.js';
import { getStarTruePosition as getSharedStarTruePosition, getStarGlobePosition, getStarMollweidePosition, precalcMollweideData as precalcSharedMollweideData } from '../shared/starUtils.js';
import { buildAndApplyFilters as runFilterPipeline, updateMollweideView as refreshMollweideMap } from '../features/filters/pipeline/filterPipeline.js';
import { initStarInteractions, updateSelectedStarHighlight } from '../render/interactions/starInteractions.js';
import { setTooltipContext, invalidateTooltipCache } from '../render/interactions/tooltips.js';
import { setRenderRequester, requestRenderIfAvailable } from '../shared/renderScheduler.js';
import { ExportManager } from '../features/export/exportManager.js';
import { EditManager } from '../features/editing/editManager.js';
import { applyGlobeSurface } from './globeSurface.js';
import { updateMollweidePosition, createMollweideScheduler } from './mollweideUpdater.js';
import { preprocessStarData, reprojectAllStars } from './starPreprocessor.js';
import { setViewpointStar, isDefaultViewpoint } from '../shared/viewpoint.js';
import { clearRadToSphereCache, clearRadToMollweideCache } from '../shared/geometryUtils.js';

// ---------------------------------------------------------------------------
// Map managers and render coordination
// ---------------------------------------------------------------------------
let trueCoordinatesMap;
let globeMap;
let mollweideMap;
let uvMap;
let uvGlobeMap;
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
  getMaps: () => ({ trueCoordinatesMap, globeMap, mollweideMap, uvMap, uvGlobeMap }),
  getStarTruePosition: getSharedStarTruePosition,
  projectStarGlobe: getStarGlobePosition,
  projectStarMollweide: getStarMollweidePosition,
  precalcMollweideData: precalcSharedMollweideData,
  updateMollweidePosition,
  applyGlobeSurface: (isOpaque) => applyGlobeSurface(isOpaque, globeMap.scene),
  requestRender: () => requestRender(),
  get editManager() { return editManager; },

  /**
   * Switch the viewpoint to a different star, or null to return to Sol.
   * Reprojects all star positions, clears caches, and re-runs the full
   * filter + render pipeline.
   * @param {Object|null} star - Star record, or null for Sol.
   */
  changeViewpoint(star) {
    setViewpointStar(star);
    state.viewpointStar = star;

    // Clear projection caches — all RA/DEC values change with viewpoint
    clearRadToSphereCache();
    clearRadToMollweideCache();

    // Reproject every star relative to the new viewpoint
    const stars = getCachedStars();
    if (stars) {
      reprojectAllStars(stars);
    }

    // Update viewpoint indicator banner and clear tooltip cache
    updateViewpointBanner(star);
    invalidateTooltipCache();

    // Grey out / restore constellation & plane checkboxes
    updateViewpointDisabledControls(!isDefaultViewpoint());

    // Clear star selection (position may have moved or star may be excluded)
    state.selectedStarData = null;
    updateSelectedStarHighlight(appContext);

    // Re-run full filter + render pipeline
    buildAndApplyFilters();
  }
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
// Viewpoint UI helpers
// ---------------------------------------------------------------------------
function updateViewpointBanner(star) {
  const banner = document.getElementById('viewpoint-banner');
  const text = document.getElementById('viewpoint-banner-text');
  const distLabel = document.getElementById('distance-viewpoint-label');
  if (!banner || !text) return;
  if (!star) {
    banner.setAttribute('hidden', '');
    if (distLabel) distLabel.textContent = '';
  } else {
    const name = star.Common_name_of_the_star || star.Common_name_of_the_star_system || 'Unknown Star';
    text.textContent = `Viewing from: ${name}`;
    banner.removeAttribute('hidden');
    if (distLabel) distLabel.textContent = `from ${name}`;
  }
}

/**
 * Grey out constellation and Sun/Earth-specific plane controls when not at Sol.
 * @param {boolean} disabled - true to disable, false to restore.
 */
function updateViewpointDisabledControls(disabled) {
  const ids = [
    'show-constellation-boundaries',
    'show-constellation-names',
    'show-constellation-overlay',
    'show-ecliptic-plane',
    'show-celestial-equator'
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.disabled = disabled;
    const label = el.parentElement;
    if (label) label.style.opacity = disabled ? '0.4' : '1';
  });
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
    globeMap = new MapManager({ canvasId: 'legacySphereMap', mapType: 'Globe', state, scheduleMollweideUpdate, getEditManager: () => editManager });
    mollweideMap = new MapManager({ canvasId: 'legacyMollweideMap', mapType: 'Mollweide', state, scheduleMollweideUpdate, getEditManager: () => editManager });
    uvMap = new UVMapManager({ canvasId: 'uvMap', mapType: 'Equirectangular', state });
    uvGlobeMap = new UVMapManager({ canvasId: 'sphereMap', mapType: 'UVGlobe', state });
    uvMap.setLegacySourceScene(globeMap.scene);
    uvGlobeMap.setLegacySourceScene(globeMap.scene);
    mapManagers.push(trueCoordinatesMap, globeMap, mollweideMap, uvMap, uvGlobeMap);

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

    // Projection toggles
    setupMapProjectionToggles({
      requestRender,
      maybePersistPresets,
      syncVisibleMaps: buildAndApplyFilters,
      trueCoordinatesMap,
      globeMap,
      mollweideMap,
      uvMap,
      uvGlobeMap
    });

    // Initial filter pass
    buildAndApplyFilters();

    // Star interactions on all maps
    setTooltipContext(appContext);
    initStarInteractions(appContext, trueCoordinatesMap);
    initStarInteractions(appContext, uvGlobeMap);
    initStarInteractions(appContext, uvMap);
    initStarInteractions(appContext, globeMap);
    initStarInteractions(appContext, mollweideMap);

    // Viewpoint banner "Return to Sol" button
    const vpResetBtn = document.getElementById('viewpoint-banner-reset');
    if (vpResetBtn) {
      vpResetBtn.addEventListener('click', () => {
        appContext.changeViewpoint(null);
      });
    }

    // Export and edit managers
    exportManager = new ExportManager(mollweideMap);
    exportManager.setup();
    editManager.setConstellationLinesMoll(getConstellationLinesMoll());
    editManager.setIsolationOverlay(state.isolationOverlay);
    editManager.setupAll();

    requestRender();
    loader.classList.add('hidden');
  } catch (err) {
    const errorDetail = err?.message || String(err);
    console.error('Starmap initialization failed:', err);
    const loaderEl = document.getElementById('loader');
    if (loaderEl) {
      loaderEl.textContent = `Initialization failed: ${errorDetail}`;
      loaderEl.classList.remove('hidden');
    }
  }
}
