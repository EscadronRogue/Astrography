export function setupMapProjectionToggles({ requestRender, maybePersistPresets, trueCoordinatesMap, globeMap, mollweideMap }) {
  const mapsSection = document.querySelector('.maps-section');
  const trueContainer = document.getElementById('map3D').parentElement;
  const globeContainer = document.getElementById('sphereMap').parentElement;
  const mollContainer = document.getElementById('mollweideMap').parentElement;
  [trueContainer, globeContainer, mollContainer].forEach(container => container.remove());

  function bindToggle(id, container, manager) {
    const checkbox = document.getElementById(id);
    if (!checkbox) return;

    function updateVisibility() {
      if (checkbox.checked) {
        mapsSection.appendChild(container);
        manager.onResize();
      } else if (container.isConnected) {
        container.remove();
      }
      requestRender();
    }

    checkbox.addEventListener('change', () => {
      updateVisibility();
      maybePersistPresets();
    });

    updateVisibility();
  }

  bindToggle('map-true', trueContainer, trueCoordinatesMap);
  bindToggle('map-globe', globeContainer, globeMap);
  bindToggle('map-mollweide', mollContainer, mollweideMap);
}
