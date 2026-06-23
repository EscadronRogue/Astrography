/**
 * @file Shared form state capture/restore utilities.
 * Consolidates duplicated logic from app/presets.js and app/stellarClassState.js.
 */
import { logWarn } from './logger.js';

export function getElementByIdWithin(container, id) {
  if (!container || !id) return null;

  const doc = container.ownerDocument || globalThis.document;
  const direct = doc?.getElementById?.(id);
  if (direct && (direct === container || container.contains(direct))) {
    return direct;
  }

  const escapeCss = globalThis.CSS?.escape;
  if (!escapeCss || !container.querySelector) return null;
  return container.querySelector(`#${escapeCss(id)}`);
}

/**
 * Captures the state of all form elements within a container.
 * @param {HTMLElement} container - The DOM container to scan.
 * @returns {Object<string, *>} Map of element ID to current value.
 */
export function captureFormState(container) {
  if (!container) {
    logWarn('[captureFormState] Container element not found.');
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
    logWarn('[restoreFormState] Missing container or state.');
    return;
  }
  Object.entries(state).forEach(([id, value]) => {
    const el = getElementByIdWithin(container, id);
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
