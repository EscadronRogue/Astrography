function requestMapSync(syncVisibleMaps) {
  if (typeof syncVisibleMaps !== 'function') return;
  Promise.resolve(syncVisibleMaps()).catch(error => {
    console.error('Failed to sync visible projections:', error);
  });
}

export function getProjectionContainer(canvasId, documentRef = globalThis.document) {
  return documentRef?.getElementById?.(canvasId)?.parentElement || null;
}

export function setupMapProjectionToggles({
  requestRender,
  maybePersistPresets,
  syncVisibleMaps,
  trueCoordinatesMap,
  globeMap,
  mollweideMap,
  uvMap,
  uvGlobeMap,
  documentRef = globalThis.document
}) {
  const mapsSection = documentRef?.querySelector?.('.maps-section') || null;
  const containers = {
    trueCoordinates: getProjectionContainer('map3D', documentRef),
    uvGlobe: getProjectionContainer('sphereMap', documentRef),
    uvMap: getProjectionContainer('uvMap', documentRef),
    legacyGlobe: getProjectionContainer('legacySphereMap', documentRef),
    legacyMollweide: getProjectionContainer('legacyMollweideMap', documentRef)
  };

  Object.values(containers).forEach(container => container?.remove?.());

  function bindToggle(id, container, manager, isLegacy = false) {
    const checkbox = documentRef?.getElementById?.(id);
    if (!checkbox || !container || !manager || !mapsSection) return null;

    function updateVisibility() {
      const showLegacy = documentRef?.getElementById?.('show-legacy-projections')?.checked ?? false;
      const shouldShow = checkbox.checked && (!isLegacy || showLegacy);
      if (shouldShow) {
        mapsSection.appendChild(container);
        manager.onResize?.();
      } else if (container.isConnected) {
        container.remove();
      }
      requestRender?.();
    }

    checkbox.addEventListener('change', () => {
      const wasConnected = container.isConnected;
      updateVisibility();
      if (!wasConnected && container.isConnected) {
        requestMapSync(syncVisibleMaps);
      }
      maybePersistPresets?.();
    });

    return updateVisibility;
  }

  const refreshers = [
    bindToggle('map-true', containers.trueCoordinates, trueCoordinatesMap),
    bindToggle('map-equirectangular', containers.uvMap, uvMap),
    bindToggle('map-globe', containers.uvGlobe, uvGlobeMap),
    bindToggle('map-legacy-globe', containers.legacyGlobe, globeMap, true),
    bindToggle('map-legacy-mollweide', containers.legacyMollweide, mollweideMap, true)
  ].filter(Boolean);

  const legacyToggle = documentRef?.getElementById?.('show-legacy-projections');
  if (legacyToggle) {
    legacyToggle.addEventListener('change', () => {
      const legacySection = documentRef?.getElementById?.('legacy-projection-controls');
      if (legacySection) legacySection.hidden = !legacyToggle.checked;
      refreshers.forEach(fn => fn());
      if (legacyToggle.checked) {
        requestMapSync(syncVisibleMaps);
      }
      maybePersistPresets?.();
    });
    const legacySection = documentRef?.getElementById?.('legacy-projection-controls');
    if (legacySection) legacySection.hidden = !legacyToggle.checked;
  }

  refreshers.forEach(fn => fn());
}
