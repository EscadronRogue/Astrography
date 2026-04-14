/**
 * @file Manages creation, rebuilding, and teardown of isolation and density overlays.
 * Provides updateDerivedOverlays() as the main entry point called each filter cycle.
 */
import { initIsolationFilter, updateIsolationFilter } from './isolationFilter.js';
import { initDensityFilter, updateDensityFilter } from './densityFilter.js';

let isolationOverlay = null;
let densityOverlay = null;

/**
 * Retrieves the three map scenes from window globals.
 * @returns {{ tc: THREE.Scene, globe: THREE.Scene, moll: THREE.Scene }}
 */
function getScenes() {
  return {
    tc: window.trueCoordinatesMap?.scene,
    globe: window.globeMap?.scene,
    moll: window.mollweideMap?.scene
  };
}

/**
 * Generic overlay removal: removes all meshes/lines from scenes and nullifies the reference.
 * @param {Object|null} overlay - The overlay object with cubesData and adjacentLines.
 * @param {Object} meshConfig - Maps overlay property paths to scene keys.
 */
function removeOverlayFromScenes(overlay, meshConfig) {
  if (!overlay) return;
  const scenes = getScenes();
  meshConfig.cubes.forEach(({ prop, scene }) => {
    overlay.cubesData?.forEach(cell => {
      scenes[scene]?.remove(cell[prop]);
    });
  });
  meshConfig.lines.forEach(({ prop, scene }) => {
    overlay.adjacentLines?.forEach(obj => {
      scenes[scene]?.remove(obj[prop]);
    });
  });
  if (meshConfig.extra) {
    meshConfig.extra.forEach(({ prop, scene }) => {
      if (overlay[prop]) scenes[scene]?.remove(overlay[prop]);
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
function addIsolationToScenes(overlay) {
  const scenes = getScenes();
  overlay.cubesData.forEach(cell => {
    scenes.tc?.add(cell.tcMesh);
  });
  overlay.adjacentLines.forEach(obj => {
    scenes.globe?.add(obj.line);
    scenes.moll?.add(obj.lineM);
  });
}

/**
 * Adds a density overlay's meshes to the appropriate scenes.
 * @param {Object} overlay
 */
function addDensityToScenes(overlay) {
  const scenes = getScenes();
  overlay.cubesData.forEach(cell => {
    scenes.tc?.add(cell.tcMesh);
  });
  overlay.adjacentLines.forEach(obj => {
    scenes.globe?.add(obj.line);
  });
  scenes.moll?.add(overlay.textureMesh);
}

/**
 * Main entry point: updates both isolation and density overlays based on current filters.
 * Handles initialization, rebuild detection, cleanup, and rendering updates.
 * @param {Array} allStars - Complete star array.
 * @param {Object} filters - Current filter state.
 * @param {Function} computeAdaptiveGridSize - Grid size computation function.
 * @returns {{ isolationOverlay: Object|null, densityOverlay: Object|null }}
 */
export function updateDerivedOverlays(allStars, filters, computeAdaptiveGridSize) {
  const scenes = getScenes();

  // --- Isolation overlay ---
  if (filters.enableIsolationFilter) {
    const gridSize = computeAdaptiveGridSize(filters.isolationGridSize);

    if (needsRebuild(isolationOverlay, filters, gridSize)) {
      removeOverlayFromScenes(isolationOverlay, ISOLATION_MESH_CONFIG);
      isolationOverlay = initIsolationFilter(filters.minDistance, filters.maxDistance, allStars, gridSize);
      addIsolationToScenes(isolationOverlay);
    }

    updateIsolationFilter(allStars, isolationOverlay, scenes.tc, scenes.globe, scenes.moll);
  } else {
    removeOverlayFromScenes(isolationOverlay, ISOLATION_MESH_CONFIG);
    isolationOverlay = null;
  }

  // --- Density overlay ---
  if (filters.enableDensityFilter) {
    const gridSize = computeAdaptiveGridSize(filters.densityGridSize);

    if (needsRebuild(densityOverlay, filters, gridSize)) {
      removeOverlayFromScenes(densityOverlay, DENSITY_MESH_CONFIG);
      densityOverlay = initDensityFilter(filters.minDistance, filters.maxDistance, allStars, gridSize);
      addDensityToScenes(densityOverlay);
    }

    updateDensityFilter(allStars, densityOverlay, scenes.tc, scenes.globe, scenes.moll);
  } else {
    removeOverlayFromScenes(densityOverlay, DENSITY_MESH_CONFIG);
    densityOverlay = null;
  }

  return { isolationOverlay, densityOverlay };
}
