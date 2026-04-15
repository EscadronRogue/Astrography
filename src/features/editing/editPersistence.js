import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';

export function downloadLabelEdits(manager) {
  const edits = {
    starOffsets: Array.from(manager.starLabelOffsets.entries()),
    starRotations: Array.from(manager.starLabelRotations.entries()),
    starScales: Array.from(manager.starLabelScales.entries()),
    constellationOffsets: Array.from(manager.constellationLabelOffsets.entries()),
    galacticOffsets: Array.from(manager.galacticLabelOffsets.entries())
  };
  const blob = new Blob([JSON.stringify(edits, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'label-edits.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

export function applyLabelEdits(manager, edits) {
  if (!edits) return;
  if (edits.starOffsets) {
    manager.starLabelOffsets.clear();
    edits.starOffsets.forEach(([id, off]) => manager.starLabelOffsets.set(id, off));
  }
  if (edits.starRotations) {
    manager.starLabelRotations.clear();
    edits.starRotations.forEach(([id, rot]) => manager.starLabelRotations.set(id, rot));
  }
  if (edits.starScales) {
    manager.starLabelScales.clear();
    edits.starScales.forEach(([id, sc]) => manager.starLabelScales.set(id, sc));
  }
  if (edits.constellationOffsets) {
    manager.constellationLabelOffsets.clear();
    edits.constellationOffsets.forEach(([id, off]) => manager.constellationLabelOffsets.set(id, off));
  }
  if (edits.galacticOffsets) {
    manager.galacticLabelOffsets.clear();
    edits.galacticOffsets.forEach(([id, off]) => manager.galacticLabelOffsets.set(id, off));
  }

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
  manager.buildAndApplyFilters();
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
