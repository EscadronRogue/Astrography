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
import { initStarInteractions, setupStarInteractionToggle, updateSelectedStarHighlight } from '../render/interactions/starInteractions.js';
import { setTooltipContext, invalidateTooltipCache } from '../render/interactions/tooltips.js';
import { setRenderRequester, requestRenderIfAvailable } from '../shared/renderScheduler.js';
import { ExportManager } from '../features/export/exportManager.js';
import { exportTrueCoordinatesSTL } from '../features/export/stlExporter.js';
import { exportPrintableSTLKit } from '../features/export/stlKitExporter.js';
import { EditManager } from '../features/editing/editManager.js';
import { applyGlobeSurface } from './globeSurface.js';
import { updateMollweidePosition, createMollweideScheduler } from './mollweideUpdater.js';
import { preprocessStarData, reprojectAllStars } from './starPreprocessor.js';
import { clearConnectionPositionCache } from '../features/connections/connectionPairs.js';
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
    const normalizedViewpoint = isDefaultViewpoint() ? null : star;
    state.viewpointStar = normalizedViewpoint;

    // Clear projection caches — all RA/DEC values change with viewpoint
    clearRadToSphereCache();
    clearRadToMollweideCache();

    // Reproject every star relative to the new viewpoint
    const stars = getCachedStars();
    if (stars) {
      clearConnectionPositionCache(stars);
      reprojectAllStars(stars);
    }

    // Update viewpoint indicator banner and clear tooltip cache
    updateViewpointBanner(normalizedViewpoint);
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
// Progress bar helpers
// ---------------------------------------------------------------------------
const PHASE_WEIGHTS = {
  starData: 50,    // 0–50%: loading star data files
  filterUI: 10,    // 50–60%: building filter UI
  maps: 10,        // 60–70%: creating map managers
  preprocessing: 5, // 70–75%: preprocessing star data
  interactions: 5,  // 75–80%: star interactions
  finalize: 20      // 80–100%: export/edit managers, final render
};

function updateProgress(percent, label) {
  const fill = document.getElementById('progress-bar-fill');
  const labelEl = document.getElementById('progress-bar-label');
  if (fill) fill.style.width = `${Math.min(100, Math.round(percent))}%`;
  if (labelEl) labelEl.textContent = label;
}

function hideProgress() {
  const container = document.getElementById('progress-bar-container');
  if (container) container.classList.add('hidden');
}

/** Yield to the browser so the UI can repaint between heavy phases. */
function yieldToUI() {
  return new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

// ---------------------------------------------------------------------------
// Bootstrap — progressive, non-blocking
// ---------------------------------------------------------------------------
export async function bootstrapApp() {
  try {
    updateProgress(0, 'Loading star data…');

    // ── Phase 1: Load star data progressively ──────────────────────
    const stars = await loadStarData({
      onProgress(loaded, total) {
        const pct = (loaded / total) * PHASE_WEIGHTS.starData;
        updateProgress(pct, `Loading stars… ${loaded}/${total} files`);
      }
    });
    setCachedStars(stars);
    if (!stars.length) throw new Error('No star data available');

    await yieldToUI();

    // ── Phase 2: Build filter UI ───────────────────────────────────
    updateProgress(PHASE_WEIGHTS.starData, 'Building filters…');
    await setupFilterUI(stars);

    // Move presets fieldset to end of form
    const form = document.getElementById('filters-form');
    if (form) {
      const presetsFs = document.getElementById('save-presets-fieldset');
      if (presetsFs) form.appendChild(presetsFs);
    }

    await yieldToUI();

    // ── Phase 3: Create map managers ───────────────────────────────
    const mapBase = PHASE_WEIGHTS.starData + PHASE_WEIGHTS.filterUI;
    updateProgress(mapBase, 'Initializing maps…');

    trueCoordinatesMap = new MapManager({ canvasId: 'map3D', mapType: 'TrueCoordinates', state, scheduleMollweideUpdate, getEditManager: () => editManager });
    globeMap = new MapManager({ canvasId: 'legacySphereMap', mapType: 'Globe', state, scheduleMollweideUpdate, getEditManager: () => editManager });
    mollweideMap = new MapManager({ canvasId: 'legacyMollweideMap', mapType: 'Mollweide', state, scheduleMollweideUpdate, getEditManager: () => editManager });
    uvMap = new UVMapManager({ canvasId: 'uvMap', mapType: 'Equirectangular', state });
    uvGlobeMap = new UVMapManager({ canvasId: 'sphereMap', mapType: 'UVGlobe', state });
    uvMap.setLegacySourceScene(globeMap.scene);
    uvGlobeMap.setLegacySourceScene(globeMap.scene);
    mapManagers.push(trueCoordinatesMap, globeMap, mollweideMap, uvMap, uvGlobeMap);

    await yieldToUI();

    // ── Phase 4: Preprocessing ─────────────────────────────────────
    const prepBase = mapBase + PHASE_WEIGHTS.maps;
    updateProgress(prepBase, 'Processing star positions…');

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

    await yieldToUI();

    // ── Phase 5: First render — maps become visible ────────────────
    const interBase = prepBase + PHASE_WEIGHTS.preprocessing;
    updateProgress(interBase, 'Rendering first frame…');

    buildAndApplyFilters();
    requestRender();

    await yieldToUI();

    // ── Phase 6: Interactions (background) ─────────────────────────
    updateProgress(interBase, 'Enabling interactions…');

    setTooltipContext(appContext);
    initStarInteractions(appContext, trueCoordinatesMap);
    initStarInteractions(appContext, uvGlobeMap);
    initStarInteractions(appContext, uvMap);
    initStarInteractions(appContext, globeMap);
    initStarInteractions(appContext, mollweideMap);
    setupStarInteractionToggle(appContext);

    // Viewpoint banner "Return to Sol" button
    const vpResetBtn = document.getElementById('viewpoint-banner-reset');
    if (vpResetBtn) {
      vpResetBtn.addEventListener('click', () => {
        appContext.changeViewpoint(null);
      });
    }

    await yieldToUI();

    // ── Phase 7: Finalize — export/edit, hide progress ─────────────
    const finBase = interBase + PHASE_WEIGHTS.interactions;
    updateProgress(finBase, 'Finalizing…');

    exportManager = new ExportManager(mollweideMap);
    exportManager.setup();

    // STL export for the True Coordinates map
    const stlBtn = document.getElementById('export-stl');
    if (stlBtn) {
      stlBtn.addEventListener('click', () => {
        const stars = state.currentFilteredStars;
        const connections = state.currentConnections;
        exportTrueCoordinatesSTL(stars, connections);
      });
    }

    // 3D-printable STL kit export
    const stlKitBtn = document.getElementById('export-stl-kit');
    if (stlKitBtn) {
      stlKitBtn.addEventListener('click', () => {
        const stars = state.currentFilteredStars;
        const connections = state.currentConnections;
        stlKitBtn.disabled = true;
        stlKitBtn.textContent = 'Generating…';
        // Yield to the browser so the button text updates before heavy work
        setTimeout(() => {
          exportPrintableSTLKit(stars, connections, { allStars: state.cachedStars })
            .then(() => {
              stlKitBtn.disabled = false;
              stlKitBtn.textContent = 'STL for 3D Printing';
            })
            .catch(err => {
              console.error('STL kit export failed:', err);
              alert(`STL kit export failed: ${err.message}`);
              stlKitBtn.disabled = false;
              stlKitBtn.textContent = 'STL for 3D Printing';
            });
        }, 50);
      });
    }
    editManager.setConstellationLinesMoll(getConstellationLinesMoll());
    editManager.setIsolationOverlay(state.isolationOverlay);
    editManager.setupAll();

    requestRender();

    updateProgress(100, 'Ready');
    // Brief pause so the user sees "Ready" before the bar disappears
    setTimeout(hideProgress, 800);
  } catch (err) {
    const errorDetail = err?.message || String(err);
    console.error('Starmap initialization failed:', err);
    updateProgress(0, `Error: ${errorDetail}`);
    const container = document.getElementById('progress-bar-container');
    if (container) {
      container.style.borderColor = 'rgba(255, 80, 60, 0.6)';
      container.style.pointerEvents = 'auto';
    }
  }
}
