import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { createExportManager } from './exportManager.js';
import { createEditManager } from './editManager.js';

export function hydrateStarsForRuntime(stars, helpers, presetMaps) {
  const {
    projectStarGlobe,
    getStarTruePosition,
    precalcMollweideData,
    updateMollweidePosition,
    getStarId
  } = helpers;

  stars.forEach(star => {
    star.spherePosition = projectStarGlobe(star);
    star.truePosition = getStarTruePosition(star);
    precalcMollweideData(star);
    updateMollweidePosition(star);
    const id = getStarId(star);
    if (presetMaps.starLabelOffsets.has(id)) {
      const off = presetMaps.starLabelOffsets.get(id);
      star.mollLabelOffset = new THREE.Vector3(off.x, off.y, 0);
    }
    if (presetMaps.starLabelRotations.has(id)) {
      star.mollLabelRotation = presetMaps.starLabelRotations.get(id);
    }
    if (presetMaps.starLabelScales.has(id)) {
      const sc = presetMaps.starLabelScales.get(id);
      star.mollLabelScale = new THREE.Vector3(sc.x, sc.y, 1);
    }
  });
}

export function setupMapProjectionToggles({ requestRender, maybePersistPresets, mapBindings }) {
  const mapsSection = document.querySelector('.maps-section');
  mapBindings.forEach(({ container }) => container.remove());

  mapBindings.forEach(({ checkboxId, container, manager }) => {
    const checkbox = document.getElementById(checkboxId);
    if (!checkbox) return;

    const syncVisibility = () => {
      if (checkbox.checked) {
        mapsSection.appendChild(container);
        manager.onResize();
      } else if (container.isConnected) {
        container.remove();
      }
      requestRender();
    };

    checkbox.addEventListener('change', () => {
      syncVisibility();
      maybePersistPresets();
    });

    syncVisibility();
  });
}

export function initializeFeatureManagers({
  state,
  mollweideMap,
  requestRender,
  maybePersistPresets,
  rebuildFilters
}) {
  const exportManager = createExportManager({ mollweideMap });
  const editManager = createEditManager({
    mollweideMap,
    getConstellationLabelsMoll: () => state.constellationLabelsMoll,
    getConstellationLinesMoll: () => state.constellationLinesMoll,
    getGalacticDirectionLabelsMoll: () => state.galacticDirectionLabelsMoll,
    getIsolationOverlay: () => state.isolationOverlay,
    getCachedStars: () => state.cachedStars,
    requestRender,
    maybePersistPresets,
    rebuildFilters,
    presetMaps: state.presetMaps,
    lineState: state.lineState
  });

  return {
    exportManager,
    editManager
  };
}

export function wirePresetForm({ form, onApplyFilters, maybePersistPresets, onClearPresets }) {
  if (!form) return;
  form.addEventListener('change', () => {
    onApplyFilters();
    maybePersistPresets();
  });

  const clearButton = document.getElementById('clear-saved-presets');
  if (clearButton) {
    clearButton.addEventListener('click', onClearPresets);
  }
}
