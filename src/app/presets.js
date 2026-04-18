import { captureFormState, restoreFormState } from '../shared/formUtils.js';

export const PRESET_KEY = 'astrography-presets';
export const PRESET_SCHEMA_VERSION = 3;
export const CONSTELLATION_LABEL_LAYOUT_VERSION = 2;

function serializeMap(map) {
  return Array.from(map.entries());
}

function deserializeMap(entries, target) {
  target.clear();
  (entries || []).forEach(([id, value]) => target.set(id, value));
}

function deserializeSet(values, target) {
  target.clear();
  (values || []).forEach(value => target.add(value));
}

export function maybeSavePresets(onSave) {
  const checkbox = document.getElementById('enable-save-presets');
  if (checkbox?.checked) {
    onSave();
  }
}

export function savePresets({
  formId = 'filters-form',
  starLabelOffsets,
  starLabelRotations,
  starLabelScales,
  constellationLabelOffsets,
  galacticLabelOffsets,
  removedLineSegments,
  hiddenLineKeys
}) {
  const form = document.getElementById(formId);
  if (!form) return;

  const payload = {
    schemaVersion: PRESET_SCHEMA_VERSION,
    remember: true,
    form: captureFormState(form),
    edits: {
      starOffsets: serializeMap(starLabelOffsets),
      starRotations: serializeMap(starLabelRotations),
      starScales: serializeMap(starLabelScales),
      constellationLayoutVersion: CONSTELLATION_LABEL_LAYOUT_VERSION,
      constellationOffsets: serializeMap(constellationLabelOffsets),
      galacticOffsets: serializeMap(galacticLabelOffsets)
    },
    lineEdits: {
      removedSegments: Array.from(removedLineSegments),
      hiddenLines: Array.from(hiddenLineKeys)
    }
  };

  try {
    localStorage.setItem(PRESET_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[savePresets] Failed to persist presets:', error);
  }
}

export function loadPresets({
  formId = 'filters-form',
  starLabelOffsets,
  starLabelRotations,
  starLabelScales,
  constellationLabelOffsets,
  galacticLabelOffsets,
  removedLineSegments,
  hiddenLineKeys
}) {
  let serialized = null;
  try {
    serialized = localStorage.getItem(PRESET_KEY);
  } catch (error) {
    console.warn('[loadPresets] Failed to read saved presets:', error);
    return false;
  }
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
  }

  if (payload.edits) {
    deserializeMap(payload.edits.starOffsets, starLabelOffsets);
    deserializeMap(payload.edits.starRotations, starLabelRotations);
    deserializeMap(payload.edits.starScales, starLabelScales);
    if (payload.edits.constellationLayoutVersion === CONSTELLATION_LABEL_LAYOUT_VERSION) {
      deserializeMap(payload.edits.constellationOffsets, constellationLabelOffsets);
    } else {
      constellationLabelOffsets.clear();
    }
    deserializeMap(payload.edits.galacticOffsets, galacticLabelOffsets);
  }

  if (payload.lineEdits) {
    deserializeSet(payload.lineEdits.removedSegments, removedLineSegments);
    deserializeSet(payload.lineEdits.hiddenLines, hiddenLineKeys);
  }

  return true;
}

export function clearSavedPresets() {
  try {
    localStorage.removeItem(PRESET_KEY);
  } catch (error) {
    console.warn('[clearSavedPresets] Failed to clear presets:', error);
  }
}
