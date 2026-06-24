import { logError } from '../shared/logger.js';

function requestMapSync(syncVisibleMaps) {
  if (typeof syncVisibleMaps !== 'function') return;
  Promise.resolve(syncVisibleMaps()).catch(error => {
    logError('Failed to sync visible projections:', error);
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
  uvMap,
  documentRef = globalThis.document
}) {
  const mapsSection = documentRef?.querySelector?.('.maps-section') || null;
  const containers = {
    trueCoordinates: getProjectionContainer('map3D', documentRef),
    globe: getProjectionContainer('sphereMap', documentRef),
    uvMap: getProjectionContainer('uvMap', documentRef)
  };

  Object.values(containers).forEach(container => container?.remove?.());

  function bindToggle(id, container, manager) {
    const checkbox = documentRef?.getElementById?.(id);
    if (!checkbox || !container || !manager || !mapsSection) return null;

    function updateVisibility() {
      if (checkbox.checked) {
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
    bindToggle('map-globe', containers.globe, globeMap)
  ].filter(Boolean);

  refreshers.forEach(fn => fn());
}
