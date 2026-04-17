/**
 * @file DOM utility helpers for safe element lookups.
 */

/**
 * Retrieves a DOM element by ID, throwing a descriptive error if not found.
 * Use for elements that MUST exist for the app to function.
 * @param {string} id - The element ID to look up.
 * @returns {HTMLElement} The found element.
 */
export function getRequiredElement(id) {
  const el = document.getElementById(id);
  if (!el) {
    throw new Error(`Required DOM element not found: #${id}`);
  }
  return el;
}

/**
 * Retrieves a DOM element by ID, returning null if not found (with optional console warning).
 * Use for elements that are optional (may not exist in all configurations).
 * @param {string} id - The element ID to look up.
 * @param {boolean} [warn=false] - Whether to log a warning if not found.
 * @returns {HTMLElement|null}
 */
export function getOptionalElement(id, warn = false) {
  const el = document.getElementById(id);
  if (!el && warn) {
    console.warn(`Optional DOM element not found: #${id}`);
  }
  return el;
}
