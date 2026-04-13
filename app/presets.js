export const PRESET_KEY = 'astrography-presets';
export const PRESET_SCHEMA_VERSION = 2;

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

  const formState = {};
  form.querySelectorAll('input, select, textarea').forEach(element => {
    if (!element.id) return;
    formState[element.id] = element.type === 'checkbox' || element.type === 'radio'
      ? element.checked
      : element.value;
  });

  const payload = {
    schemaVersion: PRESET_SCHEMA_VERSION,
    remember: true,
    form: formState,
    edits: {
      starOffsets: serializeMap(starLabelOffsets),
      starRotations: serializeMap(starLabelRotations),
      starScales: serializeMap(starLabelScales),
      constellationOffsets: serializeMap(constellationLabelOffsets),
      galacticOffsets: serializeMap(galacticLabelOffsets)
    },
    lineEdits: {
      removedSegments: Array.from(removedLineSegments),
      hiddenLines: Array.from(hiddenLineKeys)
    }
  };

  localStorage.setItem(PRESET_KEY, JSON.stringify(payload));
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
  const serialized = localStorage.getItem(PRESET_KEY);
  if (!serialized) return;

  let payload;
  try {
    payload = JSON.parse(serialized);
  } catch {
    return;
  }

  if (payload.schemaVersion && payload.schemaVersion > PRESET_SCHEMA_VERSION) {
    return;
  }

  if (payload.remember) {
    const checkbox = document.getElementById('enable-save-presets');
    if (checkbox) checkbox.checked = true;
  }

  const form = document.getElementById(formId);
  if (form && payload.form) {
    Object.entries(payload.form).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (!element) return;

      if (element.type === 'checkbox' || element.type === 'radio') {
        element.checked = value;
        element.dispatchEvent(new Event('change'));
      } else {
        element.value = value;
        element.dispatchEvent(new Event('input'));
      }
    });
  }

  if (payload.edits) {
    deserializeMap(payload.edits.starOffsets, starLabelOffsets);
    deserializeMap(payload.edits.starRotations, starLabelRotations);
    deserializeMap(payload.edits.starScales, starLabelScales);
    deserializeMap(payload.edits.constellationOffsets, constellationLabelOffsets);
    deserializeMap(payload.edits.galacticOffsets, galacticLabelOffsets);
  }

  if (payload.lineEdits) {
    deserializeSet(payload.lineEdits.removedSegments, removedLineSegments);
    deserializeSet(payload.lineEdits.hiddenLines, hiddenLineKeys);
  }
}

export function clearSavedPresets() {
  localStorage.removeItem(PRESET_KEY);
}
