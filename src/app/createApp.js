/**
 * @file Application bootstrap — wires services, loads data, and starts the app.
 * Kept deliberately thin: state lives in appStateFactory, globe surface in globeSurface,
 * and star preprocessing in starPreprocessor.
 */
import { state, getCachedStars, setCachedStars } from './appStateFactory.js';
import { setupFilterUI } from '../features/filters/pipeline/index.js';
import { loadStarData } from '../data/loaders/loadStarData.js';
import { MapManager } from './mapManager.js';
import { UVMapManager } from './uvMapManager.js';
import { createRenderRequester } from './renderFrame.js';
import { createLoadingProgress } from './loadingProgress.js';
import { setupMapProjectionToggles } from './projectionVisibility.js';
import { debounce, createGlobeGrid } from './mapDecorations.js';
import { maybeSavePresets, savePresets, loadPresets, clearSavedPresets } from './presets.js';
import { getStarTruePosition as getSharedStarTruePosition, getStarGlobePosition } from '../shared/starUtils.js';
import { buildAndApplyFilters as runFilterPipeline } from '../features/filters/pipeline/filterPipeline.js';
import { initStarInteractions, setupStarInteractionToggle, updateSelectedStarHighlight } from '../render/interactions/starInteractions.js';
import { setTooltipContext, invalidateTooltipCache } from '../render/interactions/tooltips.js';
import { setRenderRequester, requestRenderIfAvailable } from '../shared/renderScheduler.js';
import { notifyError } from '../shared/userNotifications.js';
import { logError } from '../shared/logger.js';
import { applyGlobeSurface } from './globeSurface.js';
import { setupExportBindings } from './exportBindings.js';
import { preprocessStarData, reprojectAllStars } from './starPreprocessor.js';
import { clearConnectionPositionCache } from '../features/connections/connectionPairs.js';
import { setViewpointStar, isDefaultViewpoint } from '../shared/viewpoint.js';
import { clearRadToSphereCache } from '../shared/geometryUtils.js';
import { endPerformanceMeasure, startPerformanceMeasure } from '../shared/performanceMetrics.js';

// ---------------------------------------------------------------------------
// Map managers and render coordination
// ---------------------------------------------------------------------------
let trueCoordinatesMap;
let globeMap;
let uvMap;

const mapManagers = [];
const requestRender = createRenderRequester(mapManagers);
setRenderRequester(requestRender);
const loadingProgress = createLoadingProgress();
const PHASE_WEIGHTS = loadingProgress.weights;
const updateProgress = loadingProgress.update;
const hideProgress = loadingProgress.hide;
const markProgressError = loadingProgress.markError;
const yieldToUI = loadingProgress.yieldToUI;

// ---------------------------------------------------------------------------
// Thin wrappers that close over appContext
// ---------------------------------------------------------------------------
const appContext = {
  state,
  getMaps: () => ({ trueCoordinatesMap, globeMap, uvMap }),
  getStarTruePosition: getSharedStarTruePosition,
  projectStarGlobe: getStarGlobePosition,
  applyGlobeSurface: (isOpaque) => applyGlobeSurface(isOpaque, globeMap.scene),
  requestRender: () => requestRender(),

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
    buildAndApplyFilters().catch(error => {
      logError('Viewpoint filter update failed:', error);
    });
  }
};

async function buildAndApplyFilters() {
  const timer = startPerformanceMeasure('filters.apply');
  try {
    return await runFilterPipeline(appContext);
  } finally {
    endPerformanceMeasure(timer);
  }
}

// ---------------------------------------------------------------------------
// Preset persistence helpers
// ---------------------------------------------------------------------------
function persistPresets() {
  savePresets();
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
  document.body?.classList.toggle('viewpoint-active', Boolean(star));
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
// Bootstrap — progressive, non-blocking
// ---------------------------------------------------------------------------
export async function bootstrapApp() {
  const timer = startPerformanceMeasure('app.bootstrap');
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

    trueCoordinatesMap = new MapManager({ canvasId: 'map3D', mapType: 'TrueCoordinates', state });
    globeMap = new MapManager({ canvasId: 'sphereMap', mapType: 'Globe', state });
    uvMap = new UVMapManager({ canvasId: 'uvMap', mapType: 'Equirectangular', state });
    uvMap.setGlobeSourceScene(globeMap.scene);
    mapManagers.push(trueCoordinatesMap, globeMap, uvMap);

    await yieldToUI();

    // ── Phase 4: Preprocessing ─────────────────────────────────────
    const prepBase = mapBase + PHASE_WEIGHTS.maps;
    updateProgress(prepBase, 'Processing star positions…');

    loadPresets();

    // Wire form change listeners
    const debouncedApplyFilters = debounce(() => {
      buildAndApplyFilters().catch(error => {
        logError('Filter update failed:', error);
      });
    }, 150);
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

    // Preprocess star positions
    preprocessStarData(stars);

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
      uvMap
    });

    await yieldToUI();

    // ── Phase 5: First render — maps become visible ────────────────
    const interBase = prepBase + PHASE_WEIGHTS.preprocessing;
    updateProgress(interBase, 'Rendering first frame…');

    await buildAndApplyFilters();
    requestRender();

    await yieldToUI();

    // ── Phase 6: Interactions (background) ─────────────────────────
    updateProgress(interBase, 'Enabling interactions…');

    setTooltipContext(appContext);
    initStarInteractions(appContext, trueCoordinatesMap);
    initStarInteractions(appContext, uvMap);
    initStarInteractions(appContext, globeMap);
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

    setupExportBindings({
      state,
      maps: { trueCoordinatesMap, globeMap, uvMap },
      yieldToUI
    });

    requestRender();

    updateProgress(100, 'Ready');
    // Brief pause so the user sees "Ready" before the bar disappears
    setTimeout(hideProgress, 800);
    endPerformanceMeasure(timer, { stars: stars.length, failed: false });
  } catch (err) {
    endPerformanceMeasure(timer, { failed: true });
    const errorDetail = err?.message || String(err);
    logError('Starmap initialization failed:', err);
    markProgressError(errorDetail);
  }
}
