import { scheduleAfterPaint } from '../shared/renderScheduler.js';

export const LOADING_PHASE_WEIGHTS = {
  starData: 50,
  filterUI: 10,
  maps: 10,
  preprocessing: 5,
  interactions: 5,
  finalize: 20
};

export function createLoadingProgress({
  documentRef = globalThis.document,
  scheduleAfterPaintFn = scheduleAfterPaint
} = {}) {
  function update(percent, label) {
    const fill = documentRef?.getElementById?.('progress-bar-fill');
    const labelEl = documentRef?.getElementById?.('progress-bar-label');
    if (fill) fill.style.width = `${Math.min(100, Math.round(percent))}%`;
    if (labelEl) labelEl.textContent = label;
  }

  function hide() {
    const container = documentRef?.getElementById?.('progress-bar-container');
    if (container) container.classList.add('hidden');
  }

  function markError(errorDetail) {
    update(0, `Error: ${errorDetail}`);
    const container = documentRef?.getElementById?.('progress-bar-container');
    if (!container) return;
    container.style.borderColor = 'rgba(255, 80, 60, 0.6)';
    container.style.pointerEvents = 'auto';
  }

  function yieldToUI() {
    return new Promise(resolve => scheduleAfterPaintFn(resolve));
  }

  return {
    weights: LOADING_PHASE_WEIGHTS,
    update,
    hide,
    markError,
    yieldToUI
  };
}
