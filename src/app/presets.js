import { captureFormState, getElementByIdWithin, restoreFormState } from '../shared/formUtils.js';
import { readStorageItem, removeStorageItem, writeStorageItem } from '../shared/storageUtils.js';
import { logWarn } from '../shared/logger.js';

export const PRESET_KEY = 'astrography-presets';
export const PRESET_SCHEMA_VERSION = 4;

function migrateDustCloudSelections(form, savedFormState) {
  if (!form || !savedFormState) return;

  const densitySelections = Object.entries(savedFormState).filter(([id, value]) =>
    id.startsWith('dust-density-') && value === true
  );
  const lineSelections = Object.entries(savedFormState).filter(([id, value]) =>
    id.startsWith('dust-cloud-') && value === true
  );

  densitySelections.forEach(([id]) => {
    const unifiedId = id.replace(/^dust-density-/, 'dust-cloud-');
    const checkbox = getElementByIdWithin(form, unifiedId);
    if (checkbox) {
      checkbox.checked = true;
    }
  });

  const densityMode = form.querySelector('#dust-cloud-mode-density');
  const linesMode = form.querySelector('#dust-cloud-mode-lines');
  if (densitySelections.length > 0 && densityMode) {
    densityMode.checked = true;
    if (linesMode) linesMode.checked = false;
  } else if (lineSelections.length > 0 && linesMode) {
    linesMode.checked = true;
    if (densityMode) densityMode.checked = false;
  }
}

function refreshRestoredFilterUi(form) {
  if (!form) return;

  form.querySelectorAll('input[type="range"]').forEach(input => {
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  [
    'enable-connections',
    'enable-density-filter',
    'enable-isolation-filter',
    'dust-cloud-mode-density',
    'dust-cloud-mode-lines'
  ].forEach(id => {
    const control = getElementByIdWithin(form, id);
    if (control) {
      control.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

export function maybeSavePresets(onSave) {
  const checkbox = document.getElementById('enable-save-presets');
  if (checkbox?.checked) {
    onSave();
  }
}

export function savePresets({ formId = 'filters-form' } = {}) {
  const form = document.getElementById(formId);
  if (!form) return;

  const payload = {
    schemaVersion: PRESET_SCHEMA_VERSION,
    remember: true,
    form: captureFormState(form)
  };

  writeStorageItem(PRESET_KEY, JSON.stringify(payload), {
    onError: error => logWarn('[savePresets] Failed to persist presets:', error)
  });
}

export function loadPresets({ formId = 'filters-form' } = {}) {
  const serialized = readStorageItem(PRESET_KEY, {
    onError: error => logWarn('[loadPresets] Failed to read saved presets:', error)
  });
  if (!serialized) return false;

  let payload;
  try {
    payload = JSON.parse(serialized);
  } catch {
    return false;
  }

  if (payload.schemaVersion && payload.schemaVersion > PRESET_SCHEMA_VERSION) {
    return false;
  }

  if (payload.remember) {
    const checkbox = document.getElementById('enable-save-presets');
    if (checkbox) checkbox.checked = true;
  }

  const form = document.getElementById(formId);
  if (form && payload.form) {
    restoreFormState(form, payload.form, { dispatchEvents: false });
    migrateDustCloudSelections(form, payload.form);
    refreshRestoredFilterUi(form);
  }

  return true;
}

export function clearSavedPresets() {
  removeStorageItem(PRESET_KEY, {
    onError: error => logWarn('[clearSavedPresets] Failed to clear presets:', error)
  });
}
