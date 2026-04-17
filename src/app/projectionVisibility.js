function requestMapSync(syncVisibleMaps) {
  if (typeof syncVisibleMaps !== 'function') return;
  Promise.resolve(syncVisibleMaps()).catch(error => {
    console.error('Failed to sync visible projections:', error);
  });
}

export function setupMapProjectionToggles({ requestRender, maybePersistPresets, syncVisibleMaps, trueCoordinatesMap, globeMap, mollweideMap, uvMap, uvGlobeMap }) {
  const mapsSection = document.querySelector('.maps-section');
  const containers = {
    trueCoordinates: document.getElementById('map3D').parentElement,
    uvGlobe: document.getElementById('sphereMap').parentElement,
    uvMap: document.getElementById('uvMap').parentElement,
    legacyGlobe: document.getElementById('legacySphereMap').parentElement,
    legacyMollweide: document.getElementById('legacyMollweideMap').parentElement
  };

  Object.values(containers).forEach(container => container.remove());

  function bindToggle(id, container, manager, isLegacy = false) {
    const checkbox = document.getElementById(id);
    if (!checkbox || !container || !manager) return;

    function updateVisibility() {
      const showLegacy = document.getElementById('show-legacy-projections')?.checked ?? false;
      const shouldShow = checkbox.checked && (!isLegacy || showLegacy);
      if (shouldShow) {
        mapsSection.appendChild(container);
        manager.onResize?.();
      } else if (container.isConnected) {
        container.remove();
      }
      requestRender();
    }

    checkbox.addEventListener('change', () => {
      const wasConnected = container.isConnected;
      updateVisibility();
      if (!wasConnected && container.isConnected) {
        requestMapSync(syncVisibleMaps);
      }
      maybePersistPresets();
    });

    return updateVisibility;
  }

  const refreshers = [
    bindToggle('map-true', containers.trueCoordinates, trueCoordinatesMap),
    bindToggle('map-globe', containers.uvGlobe, uvGlobeMap),
    bindToggle('map-equirectangular', containers.uvMap, uvMap),
    bindToggle('map-legacy-globe', containers.legacyGlobe, globeMap, true),
    bindToggle('map-legacy-mollweide', containers.legacyMollweide, mollweideMap, true)
  ].filter(Boolean);

  const legacyToggle = document.getElementById('show-legacy-projections');
  if (legacyToggle) {
    legacyToggle.addEventListener('change', () => {
      const legacySection = document.getElementById('legacy-projection-controls');
      if (legacySection) legacySection.hidden = !legacyToggle.checked;
      refreshers.forEach(fn => fn());
      if (legacyToggle.checked) {
        requestMapSync(syncVisibleMaps);
      }
      maybePersistPresets();
    });
    const legacySection = document.getElementById('legacy-projection-controls');
    if (legacySection) legacySection.hidden = !legacyToggle.checked;
  }

  refreshers.forEach(fn => fn());
}
