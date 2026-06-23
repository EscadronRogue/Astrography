import * as THREE from '../../vendor/three.js';
import { downloadBlob } from '../export/downloadUtils.js';
import { createEditExportPayload, normalizeLabelEdits } from './editSchema.js';

export { normalizeLabelEdits } from './editSchema.js';

export function downloadLabelEdits(manager) {
  const payload = createEditExportPayload(manager);
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  downloadBlob(blob, 'astrography-edits.json');
}

export function applyLabelEdits(manager, edits) {
  const normalized = normalizeLabelEdits(edits);

  manager.starLabelOffsets.clear();
  normalized.starOffsets.forEach(([id, off]) => manager.starLabelOffsets.set(id, off));
  manager.starLabelRotations.clear();
  normalized.starRotations.forEach(([id, rot]) => manager.starLabelRotations.set(id, rot));
  manager.starLabelScales.clear();
  normalized.starScales.forEach(([id, sc]) => manager.starLabelScales.set(id, sc));
  manager.constellationLabelOffsets.clear();
  normalized.constellationOffsets.forEach(([id, off]) => manager.constellationLabelOffsets.set(id, off));
  manager.galacticLabelOffsets.clear();
  normalized.galacticOffsets.forEach(([id, off]) => manager.galacticLabelOffsets.set(id, off));
  manager.removedLineSegments.clear();
  normalized.removedLineSegments.forEach(key => manager.removedLineSegments.add(key));
  manager.hiddenLineKeys.clear();
  normalized.hiddenLineKeys.forEach(key => manager.hiddenLineKeys.add(key));
  manager.editHistory = [];

  if (manager.cachedStars) {
    manager.cachedStars.forEach(star => {
      const id = manager.getStarId(star);
      if (manager.starLabelOffsets.has(id)) {
        const off = manager.starLabelOffsets.get(id);
        star.mollLabelOffset = new THREE.Vector3(off.x, off.y, 0);
      } else {
        delete star.mollLabelOffset;
      }
      if (manager.starLabelRotations.has(id)) {
        star.mollLabelRotation = manager.starLabelRotations.get(id);
      } else {
        delete star.mollLabelRotation;
      }
      if (manager.starLabelScales.has(id)) {
        const sc = manager.starLabelScales.get(id);
        star.mollLabelScale = new THREE.Vector3(sc.x, sc.y, 1);
      } else {
        delete star.mollLabelScale;
      }
    });
  }
  Promise.resolve(manager.buildAndApplyFilters()).catch(error => {
    console.error('Failed to refresh after applying label edits:', error);
  });
  if (typeof manager.registerMollweideEditableLines === 'function') {
    manager.registerMollweideEditableLines();
  }
  manager.maybePersistPresets();
}

export function buildSerializableEditState(manager) {
  return {
    starLabelOffsets: manager.starLabelOffsets,
    starLabelRotations: manager.starLabelRotations,
    starLabelScales: manager.starLabelScales,
    constellationLabelOffsets: manager.constellationLabelOffsets,
    galacticLabelOffsets: manager.galacticLabelOffsets,
    removedLineSegments: manager.removedLineSegments,
    hiddenLineKeys: manager.hiddenLineKeys
  };
}
