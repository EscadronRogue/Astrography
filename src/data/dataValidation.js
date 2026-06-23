function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value) {
  const number = typeof value === 'string' ? Number.parseFloat(value) : value;
  return Number.isFinite(number) ? number : undefined;
}

function warnInvalid(source, message, index = null) {
  const suffix = index === null ? '' : ` at index ${index}`;
  console.warn(`Invalid ${source}${suffix}: ${message}`);
}

export function validateManifestFiles(manifest, source = 'data manifest') {
  const fileNames = Array.isArray(manifest) ? manifest : manifest?.files;
  if (!Array.isArray(fileNames)) {
    throw new Error(`${source} must be an array or an object with a files array.`);
  }

  return fileNames.filter((name, index) => {
    const valid = typeof name === 'string' &&
      /^[a-z0-9_.-]+\.json$/i.test(name) &&
      !name.includes('..');
    if (!valid) warnInvalid(source, `file name must be a local JSON file name, got ${String(name)}`, index);
    return valid;
  });
}

export function validateStarBatch(batch, source = 'star data') {
  if (!Array.isArray(batch)) {
    throw new Error(`${source} must be an array of star records.`);
  }

  return batch.filter((record, index) => {
    if (!isPlainObject(record)) {
      warnInvalid(source, 'record must be an object', index);
      return false;
    }

    const distance = toFiniteNumber(record.distance ?? record.Distance_from_the_Sun);
    const ra = toFiniteNumber(record.RA_in_degrees);
    const dec = toFiniteNumber(record.DEC_in_degrees);
    const hasNameOrCatalogId = Boolean(
      record.starId ||
      record.Source_id ||
      record.HIP_number ||
      record.HD_catalogue_identifier ||
      record.Common_name_of_the_star ||
      record.Common_name_of_the_star_system
    );

    if (!Number.isFinite(distance) || !Number.isFinite(ra) || !Number.isFinite(dec) || !hasNameOrCatalogId) {
      warnInvalid(source, 'record requires finite distance, RA/DEC degrees, and a name or catalog id', index);
      return false;
    }

    return true;
  });
}

export function validateCloudData(data, source = 'cloud data') {
  if (!Array.isArray(data)) {
    throw new Error(`${source} must be an array of cloud star records.`);
  }

  const valid = data.filter((record, index) => {
    if (!isPlainObject(record)) {
      warnInvalid(source, 'record must be an object', index);
      return false;
    }

    const name = record['Star Name'] || record.starName || record.name;
    if (typeof name !== 'string' || !name.trim()) {
      warnInvalid(source, 'record requires a Star Name, starName, or name string', index);
      return false;
    }

    const hasRa = record.RA !== undefined && record.RA !== null && record.RA !== '';
    const hasDec = record.DEC !== undefined && record.DEC !== null && record.DEC !== '';
    const ra = hasRa ? toFiniteNumber(record.RA) : undefined;
    const dec = hasDec ? toFiniteNumber(record.DEC) : undefined;
    if ((hasRa && !Number.isFinite(ra)) || (hasDec && !Number.isFinite(dec))) {
      warnInvalid(source, 'RA and DEC must be finite numbers when present', index);
      return false;
    }

    return true;
  });

  if (!valid.length && data.length) {
    throw new Error(`${source} did not contain any valid cloud star records.`);
  }

  return valid;
}

export function validateConstellationCenters(data, source = 'constellation centers') {
  if (!Array.isArray(data)) {
    throw new Error(`${source} must be an array.`);
  }

  return data.filter((record, index) => {
    const valid = isPlainObject(record) &&
      typeof record.name === 'string' &&
      record.name.trim() &&
      Number.isFinite(toFiniteNumber(record.raDeg)) &&
      Number.isFinite(toFiniteNumber(record.decDeg));
    if (!valid) warnInvalid(source, 'record requires name plus finite raDeg and decDeg', index);
    return valid;
  });
}

export function validateConstellationFullNames(data, source = 'constellation full names') {
  if (!isPlainObject(data)) {
    throw new Error(`${source} must be an object keyed by constellation abbreviation.`);
  }

  return Object.fromEntries(
    Object.entries(data).filter(([abbr, name]) => {
      const valid = /^[A-Z0-9]{3,4}$/.test(abbr) && typeof name === 'string' && name.trim();
      if (!valid) warnInvalid(source, `invalid mapping ${abbr}: ${String(name)}`);
      return valid;
    })
  );
}

export function validateStellarClassData(data, source = 'stellar class data') {
  if (!isPlainObject(data)) {
    throw new Error(`${source} must be an object keyed by stellar class.`);
  }

  const colorPattern = /^#[0-9a-f]{6}$/i;
  const result = {};
  Object.entries(data).forEach(([key, value]) => {
    const valid = isPlainObject(value) &&
      colorPattern.test(value.color) &&
      Number.isFinite(toFiniteNumber(value.size)) &&
      Number.isFinite(toFiniteNumber(value.hierarchy));

    if (!valid) {
      warnInvalid(source, `${key} requires hex color, finite size, and finite hierarchy`);
      return;
    }

    result[key] = {
      ...value,
      size: toFiniteNumber(value.size),
      hierarchy: toFiniteNumber(value.hierarchy)
    };
  });

  if (!result.Other) {
    throw new Error(`${source} must include a valid Other class fallback.`);
  }

  return result;
}
