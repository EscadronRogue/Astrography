export function createRenderRequester(mapManagers, getEditManager) {
  let renderRequested = false;
  return function requestRender() {
    if (renderRequested) return;
    renderRequested = true;
    requestAnimationFrame(() => {
      renderRequested = false;
      for (let i = 0; i < mapManagers.length; i++) {
        const manager = mapManagers[i];
        if (!manager.canvas.isConnected) continue;
        manager.render();
      }
      const editManager = getEditManager();
      if (editManager) editManager.updateEditOverlay();
    });
  };
}
