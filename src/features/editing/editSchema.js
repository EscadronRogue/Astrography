export const EDIT_SCHEMA = 'astrography-edits';
export const LEGACY_LABEL_SCHEMA = 'astrography-label-edits';
export const EDIT_SCHEMA_VERSION = 2;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validateEntryArray(value, fieldName, validateValue) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array of [id, value] pairs.`);
  }

  return value.map((entry, index) => {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
      throw new Error(`${fieldName}[${index}] must be a [string, value] pair.`);
    }
    return [entry[0], validateValue(entry[1], `${fieldName}[${index}]`)];
  });
}

function validateVector2Like(value, path) {
  if (!isPlainObject(value) || !Number.isFinite(value.x) || !Number.isFinite(value.y)) {
    throw new Error(`${path} must contain finite x and y numbers.`);
  }
  return { x: value.x, y: value.y };
}

function validateRotation(value, path) {
  if (!Number.isFinite(value)) {
    throw new Error(`${path} must be a finite number.`);
  }
  return value;
}

function validateStringArray(value, fieldName) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array of strings.`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== 'string') {
      throw new Error(`${fieldName}[${index}] must be a string.`);
    }
    return entry;
  });
}

export function normalizeLabelEdits(raw) {
  if (!isPlainObject(raw)) {
    throw new Error('Edit file must contain a JSON object.');
  }

  let source = raw;
  if (raw.schema === EDIT_SCHEMA || raw.schema === LEGACY_LABEL_SCHEMA) {
    source = raw.edits;
  } else if (raw.schema !== undefined) {
    throw new Error(`Unsupported edit file schema: ${raw.schema}`);
  } else if (isPlainObject(raw.edits)) {
    source = raw.edits;
  }

  if (!isPlainObject(source)) {
    throw new Error('Edit file is missing an edits object.');
  }

  const lineEdits = isPlainObject(source.lineEdits) ? source.lineEdits : {};

  return {
    starOffsets: validateEntryArray(source.starOffsets, 'starOffsets', validateVector2Like),
    starRotations: validateEntryArray(source.starRotations, 'starRotations', validateRotation),
    starScales: validateEntryArray(source.starScales, 'starScales', validateVector2Like),
    constellationOffsets: validateEntryArray(source.constellationOffsets, 'constellationOffsets', validateVector2Like),
    galacticOffsets: validateEntryArray(source.galacticOffsets, 'galacticOffsets', validateVector2Like),
    removedLineSegments: validateStringArray(lineEdits.removedSegments, 'lineEdits.removedSegments'),
    hiddenLineKeys: validateStringArray(lineEdits.hiddenLines, 'lineEdits.hiddenLines')
  };
}

export function createEditExportPayload(manager, exportedAt = new Date()) {
  return {
    schema: EDIT_SCHEMA,
    version: EDIT_SCHEMA_VERSION,
    exportedAt: exportedAt instanceof Date ? exportedAt.toISOString() : String(exportedAt),
    edits: {
      starOffsets: Array.from(manager.starLabelOffsets.entries()),
      starRotations: Array.from(manager.starLabelRotations.entries()),
      starScales: Array.from(manager.starLabelScales.entries()),
      constellationOffsets: Array.from(manager.constellationLabelOffsets.entries()),
      galacticOffsets: Array.from(manager.galacticLabelOffsets.entries()),
      lineEdits: {
        removedSegments: Array.from(manager.removedLineSegments),
        hiddenLines: Array.from(manager.hiddenLineKeys)
      }
    }
  };
}
