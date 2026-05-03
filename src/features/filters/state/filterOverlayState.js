/**
 * @file Manages creation, rebuilding, and teardown of isolation and density overlays.
 * Provides updateDerivedOverlays() as the main entry point called each filter cycle.
 */
import { initIsolationFilter, updateIsolationFilter } from '../../isolation/isolationOverlay.js';
import { initDensityFilter, updateDensityFilter, getEffectiveDensityGridSize } from '../../density/densityOverlay.js';
import { disposeObject3D } from '../../../render/engine/renderUtils.js';

let isolationOverlay = null;
let densityOverlay = null;

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
  lines: [],
  extra: [
    { prop: 'globeLines', scene: 'globe' },
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
  overlay.cubesData.forEach(cell => {
    normalizedScenes.tc?.add(cell.tcMesh);
  });
  if (overlay.globeLines) normalizedScenes.globe?.add(overlay.globeLines);
  normalizedScenes.moll?.add(overlay.textureMesh);
}

/**
 * Main entry point: updates both isolation and density overlays based on current filters.
 * Handles initialization, rebuild detection, cleanup, and rendering updates.
 * @param {Array} allStars - Complete star array.
 * @param {Object} filters - Current filter state.
 * @param {Function} computeAdaptiveGridSize - Grid size computation function.
 * @returns {{ isolationOverlay: Object|null, densityOverlay: Object|null }}
 */
export function updateDerivedOverlays(allStars, filters, computeAdaptiveGridSize, scenes) {
  const normalizedScenes = normalizeScenes(scenes);

  // --- Isolation overlay ---
  if (filters.enableIsolationFilter) {
    const gridSize = computeAdaptiveGridSize(filters.isolationGridSize);

    if (needsRebuild(isolationOverlay, filters, gridSize)) {
      removeOverlayFromScenes(isolationOverlay, ISOLATION_MESH_CONFIG, normalizedScenes);
      isolationOverlay = initIsolationFilter(filters.minDistance, filters.maxDistance, allStars, gridSize);
      addIsolationToScenes(isolationOverlay, normalizedScenes);
    }

    updateIsolationFilter(allStars, isolationOverlay, normalizedScenes.tc, normalizedScenes.globe, normalizedScenes.moll);
  } else {
    removeOverlayFromScenes(isolationOverlay, ISOLATION_MESH_CONFIG, normalizedScenes);
    isolationOverlay = null;
  }

  // --- Density overlay ---
  if (filters.enableDensityFilter) {
    // Apply the same safety clamp the overlay constructor uses, otherwise
    // a clamped gridSize would mismatch every frame and trigger an infinite
    // rebuild loop (which is what historically caused WebGL CONTEXT_LOST).
    const requestedGridSize = computeAdaptiveGridSize(filters.densityGridSize);
    const gridSize = getEffectiveDensityGridSize(requestedGridSize, filters.maxDistance);

    if (needsRebuild(densityOverlay, filters, gridSize)) {
      removeOverlayFromScenes(densityOverlay, DENSITY_MESH_CONFIG, normalizedScenes);
      densityOverlay = initDensityFilter(filters.minDistance, filters.maxDistance, allStars, gridSize);
      addDensityToScenes(densityOverlay, normalizedScenes);
    }

    updateDensityFilter(allStars, densityOverlay, normalizedScenes.tc, normalizedScenes.globe, normalizedScenes.moll);
  } else {
    removeOverlayFromScenes(densityOverlay, DENSITY_MESH_CONFIG, normalizedScenes);
    densityOverlay = null;
  }

  return { isolationOverlay, densityOverlay };
}
