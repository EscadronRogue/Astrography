export function createRenderRequester(mapManagers, getEditManager) {
  let renderRequested = false;
  return function requestRender() {
    if (renderRequested) return;
    renderRequested = true;
    requestAnimationFrame(() => {
      renderRequested = false;
      mapManagers.forEach(manager => manager.render());
      const editManager = getEditManager();
      if (editManager) editManager.updateEditOverlay();
    });
  };
}
