import { getSceneSnapshotSize } from './exportSizing.js';

export function normalizeExportFilename(filenameBase) {
  return String(filenameBase || 'astrography_export')
    .replace(/[^a-z0-9_-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase() || 'astrography_export';
}

export function createExportSceneModel({
  kind,
  formatFamily,
  formats = [],
  mapType = 'unknown',
  width = null,
  height = null,
  renderer = 'unknown',
  source = null,
  layers = [],
  metadata = {}
} = {}) {
  return {
    kind,
    formatFamily,
    formats,
    mapType,
    width,
    height,
    renderer,
    source,
    layers,
    metadata
  };
}

export function collectSceneSnapshotModel(manager, { formats = ['png', 'pdf'], filenameBase = '' } = {}) {
  const { width, height } = getSceneSnapshotSize(manager);
  return createExportSceneModel({
    kind: 'scene-snapshot',
    formatFamily: 'raster-canvas',
    formats,
    mapType: manager?.mapType || manager?.constructor?.name || 'unknown',
    width,
    height,
    renderer: 'webgl',
    source: manager,
    metadata: {
      filename: normalizeExportFilename(filenameBase),
      cameraType: manager?.camera?.type || 'Camera',
      includesLabels: Boolean(manager?.labelManager)
    }
  });
}
