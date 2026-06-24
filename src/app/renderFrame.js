import { scheduleAnimationFrame } from '../shared/renderScheduler.js';

export function createRenderRequester(mapManagers) {
  let renderRequested = false;

  function markDirty(targets) {
    if (!targets) {
      for (let i = 0; i < mapManagers.length; i++) {
        mapManagers[i].renderDirty = true;
      }
      return;
    }

    const list = Array.isArray(targets) ? targets : [targets];
    list.forEach(manager => {
      if (manager) manager.renderDirty = true;
    });
  }

  return function requestRender(targets) {
    markDirty(targets);
    if (renderRequested) return;
    renderRequested = true;
    scheduleAnimationFrame(() => {
      renderRequested = false;
      for (let i = 0; i < mapManagers.length; i++) {
        const manager = mapManagers[i];
        if (!manager.canvas.isConnected) continue;
        if (manager.renderDirty === false) continue;
        manager.renderDirty = false;
        manager.render();
      }
    });
  };
}
