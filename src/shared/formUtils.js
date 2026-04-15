/**
 * @file Shared form state capture/restore utilities.
 * Consolidates duplicated logic from app/presets.js and app/stellarClassState.js.
 */

/**
 * Captures the state of all form elements within a container.
 * @param {HTMLElement} container - The DOM container to scan.
 * @returns {Object<string, *>} Map of element ID to current value.
 */
export function captureFormState(container) {
  if (!container) {
    console.warn('[captureFormState] Container element not found.');
    return {};
  }
  const state = {};
  const elements = container.querySelectorAll('input, select, textarea');
  elements.forEach(el => {
    if (!el.id) return;
    if (el.type === 'checkbox' || el.type === 'radio') {
      state[el.id] = el.checked;
    } else {
      state[el.id] = el.value;
    }
  });
  return state;
}

/**
 * Restores previously captured form state to a container's elements.
 * @param {HTMLElement} container - The DOM container to restore.
 * @param {Object<string, *>} state - Map of element ID to value (from captureFormState).
 * @param {Object} [options]
 * @param {boolean} [options.dispatchEvents=false] - Whether to dispatch change/input events after restore.
 */
export function restoreFormState(container, state, { dispatchEvents = false } = {}) {
  if (!container || !state) {
    console.warn('[restoreFormState] Missing container or state.');
    return;
  }
  Object.entries(state).forEach(([id, value]) => {
    const el = container.querySelector(`#${CSS.escape(id)}`);
    if (!el) return;
    if (el.type === 'checkbox' || el.type === 'radio') {
      el.checked = Boolean(value);
    } else {
      el.value = value;
    }
    if (dispatchEvents) {
      const eventType = (el.type === 'checkbox' || el.type === 'radio') ? 'change' : 'input';
      el.dispatchEvent(new Event(eventType, { bubbles: true }));
    }
  });
}
