/**
 * @file Manages creation, rebuilding, and teardown of isolation and density overlays.
 * Provides updateDerivedOverlays() as the main entry point called each filter cycle.
 */
import { initIsolationFilter, updateIsolationFilter } from '../../isolation/isolationOverlay.js';
import { initDensityFilter, updateDensityFilter } from '../../density/densityOverlay.js';
import { getBudgetedOverlayGridSettings, getRuntimeOverlayMaxCells } from '../../overlays/gridBudget.js';
import { disposeObject3D } from '../../../render/engine/renderUtils.js';

function normalizeScenes(scenes = {}) {
  return {
    tc: scenes.tc ?? null,
    globe: scenes.globe ?? null,
    moll: scenes.moll ?? null
  };
}

/**
 * Generic overlay removal: removes all meshes/lines from scenes and nullifies the reference.
 * @param {Object|null} overlay - The overlay object with cubesData and adjacentLines.
 * @param {Object} meshConfig - Maps overlay property paths to scene keys.
 */
function removeOverlayFromScenes(overlay, meshConfig, scenes) {
  if (!overlay) return;
  const normalizedScenes = normalizeScenes(scenes);

  if (typeof overlay.getSceneObjects === 'function') {
    const sceneObjects = overlay.getSceneObjects();
    Object.entries(sceneObjects).forEach(([sceneKey, objects]) => {
      const scene = normalizedScenes[sceneKey];
      (objects || []).forEach(object => scene?.remove(object));
    });
    overlay.dispose?.();
    return;
  }

  const disposedObjects = new Set();
  const removeAndDispose = (scene, object) => {
    if (!object) return;
    scene?.remove(object);
    if (disposedObjects.has(object)) return;
    disposeObject3D(object);
    disposedObjects.add(object);
  };

  meshConfig.cubes.forEach(({ prop, scene }) => {
    overlay.cubesData?.forEach(cell => {
      removeAndDispose(normalizedScenes[scene], cell[prop]);
    });
  });
  meshConfig.lines.forEach(({ prop, scene }) => {
    overlay.adjacentLines?.forEach(obj => {
      removeAndDispose(normalizedScenes[scene], obj[prop]);
    });
  });
  if (meshConfig.extra) {
    meshConfig.extra.forEach(({ prop, scene }) => {
      removeAndDispose(normalizedScenes[scene], overlay[prop]);
    });
  }
}

/** Mesh layout for the isolation overlay. */
const ISOLATION_MESH_CONFIG = {
  cubes: [
    { prop: 'tcMesh', scene: 'tc' },
    { prop: 'mollweideMesh', scene: 'moll' }
  ],
  lines: [
    { prop: 'line', scene: 'globe' },
    { prop: 'lineM', scene: 'moll' }
  ]
};

/** Mesh layout for the density overlay. */
const DENSITY_MESH_CONFIG = {
  cubes: [
    { prop: 'tcMesh', scene: 'tc' }
  ],
  lines: [
    { prop: 'line', scene: 'globe' }
  ],
  extra: [
    { prop: 'textureMesh', scene: 'moll' }
  ]
};

/**
 * Checks whether an overlay needs to be rebuilt due to changed parameters.
 * @param {Object|null} overlay - Current overlay instance.
 * @param {Object} filters - Current filter state.
 * @param {number} gridSize - Computed grid size.
 * @returns {boolean}
 */
function needsRebuild(overlay, filters, gridSize) {
  return (
    !overlay ||
    overlay.minDistance !== filters.minDistance ||
    overlay.maxDistance !== filters.maxDistance ||
    overlay.gridSize !== gridSize
  );
}

/**
 * Adds an isolation overlay's meshes to the appropriate scenes.
 * @param {Object} overlay
 */
function addIsolationToScenes(overlay, scenes) {
  const normalizedScenes = normalizeScenes(scenes);
  if (typeof overlay.getSceneObjects === 'function') {
    const sceneObjects = overlay.getSceneObjects();
    sceneObjects.tc?.forEach(object => normalizedScenes.tc?.add(object));
    sceneObjects.globe?.forEach(object => normalizedScenes.globe?.add(object));
    sceneObjects.moll?.forEach(object => normalizedScenes.moll?.add(object));
    return;
  }

  overlay.cubesData.forEach(cell => {
    normalizedScenes.tc?.add(cell.tcMesh);
  });
  overlay.adjacentLines.forEach(obj => {
    normalizedScenes.globe?.add(obj.line);
    normalizedScenes.moll?.add(obj.lineM);
  });
}

/**
 * Adds a density overlay's meshes to the appropriate scenes.
 * @param {Object} overlay
 */
function addDensityToScenes(overlay, scenes) {
  const normalizedScenes = normalizeScenes(scenes);
  if (typeof overlay.getSceneObjects === 'function') {
    const sceneObjects = overlay.getSceneObjects();
    sceneObjects.tc?.forEach(object => normalizedScenes.tc?.add(object));
    sceneObjects.globe?.forEach(object => normalizedScenes.globe?.add(object));
    sceneObjects.moll?.forEach(object => normalizedScenes.moll?.add(object));
    return;
  }

  overlay.cubesData.forEach(cell => {
    normalizedScenes.tc?.add(cell.tcMesh);
  });
  overlay.adjacentLines.forEach(obj => {
    normalizedScenes.globe?.add(obj.line);
  });
  normalizedScenes.moll?.add(overlay.textureMesh);
}

/**
 * Main entry point: updates both isolation and density overlays based on current filters.
 * Handles initialization, rebuild detection, cleanup, and rendering updates.
 * @param {Array} allStars - Complete star array.
 * @param {Object} filters - Current filter state.
 * @param {Function} computeAdaptiveGridSize - Grid size computation function.
 * @param {Object} overlayState - App-scoped holder for overlay instances.
 * @returns {{ isolationOverlay: Object|null, densityOverlay: Object|null }}
 */
export function updateDerivedOverlays(allStars, filters, computeAdaptiveGridSize, scenes, overlayState = {}) {
  const normalizedScenes = normalizeScenes(scenes);
  let isolationOverlay = overlayState.isolationOverlay ?? null;
  let densityOverlay = overlayState.densityOverlay ?? null;
  const overlayBudgetOptions = { maxCells: getRuntimeOverlayMaxCells() };

  // --- Isolation overlay ---
  if (filters.enableIsolationFilter) {
    const gridSettings = getBudgetedOverlayGridSettings(
      filters.minDistance,
      filters.maxDistance,
      computeAdaptiveGridSize(filters.isolationGridSize),
      overlayBudgetOptions
    );
    const { gridSize } = gridSettings;

    if (needsRebuild(isolationOverlay, filters, gridSize)) {
      removeOverlayFromScenes(isolationOverlay, ISOLATION_MESH_CONFIG, normalizedScenes);
      isolationOverlay = initIsolationFilter(filters.minDistance, filters.maxDistance, allStars, gridSize);
      isolationOverlay.gridBudget = gridSettings;
      addIsolationToScenes(isolationOverlay, normalizedScenes);
    }

    updateIsolationFilter(allStars, isolationOverlay, normalizedScenes.tc, normalizedScenes.globe, normalizedScenes.moll, filters);
  } else {
    removeOverlayFromScenes(isolationOverlay, ISOLATION_MESH_CONFIG, normalizedScenes);
    isolationOverlay = null;
  }

  // --- Density overlay ---
  if (filters.enableDensityFilter) {
    const gridSettings = getBudgetedOverlayGridSettings(
      filters.minDistance,
      filters.maxDistance,
      computeAdaptiveGridSize(filters.densityGridSize),
      overlayBudgetOptions
    );
    const { gridSize } = gridSettings;

    if (needsRebuild(densityOverlay, filters, gridSize)) {
      removeOverlayFromScenes(densityOverlay, DENSITY_MESH_CONFIG, normalizedScenes);
      densityOverlay = initDensityFilter(filters.minDistance, filters.maxDistance, allStars, gridSize);
      densityOverlay.gridBudget = gridSettings;
      addDensityToScenes(densityOverlay, normalizedScenes);
    }

    updateDensityFilter(allStars, densityOverlay, normalizedScenes.tc, normalizedScenes.globe, normalizedScenes.moll, filters);
  } else {
    removeOverlayFromScenes(densityOverlay, DENSITY_MESH_CONFIG, normalizedScenes);
    densityOverlay = null;
  }

  overlayState.isolationOverlay = isolationOverlay;
  overlayState.densityOverlay = densityOverlay;

  return { isolationOverlay, densityOverlay };
}
