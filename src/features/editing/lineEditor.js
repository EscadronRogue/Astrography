import { rebuildConstellationMeshFromSegments } from '../constellations/constellationRenderer.js';
import { getLineKeyFromObject } from './editCommands.js';

export function getLineKey(obj) {
  return getLineKeyFromObject(obj);
}

export function applyStoredLineEdits(manager, root) {
  if (!root) return;
  root.traverse(obj => {
    const key = getLineKey(obj);
    if (key && manager.hiddenLineKeys.has(key)) {
      obj.visible = false;
    }
    if (obj.type !== 'Line' && obj.type !== 'LineSegments') {
      return;
    }
    const posAttr = obj.geometry && obj.geometry.getAttribute('position');
    if (!posAttr) return;
    const array = posAttr.array;
    const alphaAttr = obj.geometry.getAttribute('alpha');
    let changed = false;
    for (let i = 0; i + 5 < array.length; i += 6) {
      const segKey = [
        array[i], array[i + 1], array[i + 2],
        array[i + 3], array[i + 4], array[i + 5]
      ].join(',');
      if (manager.removedLineSegments.has(segKey)) {
        for (let j = 0; j < 6; j++) array[i + j] = NaN;
        if (alphaAttr) {
          const idx = (i / 3);
          alphaAttr.array[idx] = 0;
          alphaAttr.array[idx + 1] = 0;
          alphaAttr.needsUpdate = true;
        }
        changed = true;
      }
    }
    if (changed) {
      posAttr.needsUpdate = true;
      if (obj.userData && obj.userData.visibleMesh) {
        rebuildConstellationMeshFromSegments(obj);
      }
    }
  });
}

export function registerEditableLines(manager) {
  manager.editableLines = [];
  if (manager.mollweideMap.connectionGroup) {
    manager.mollweideMap.connectionGroup.traverse(obj => {
      if (obj.isLine || obj.type === 'Line' || obj.type === 'LineSegments') {
        manager.editableLines.push(obj);
      }
    });
  }
  if (manager.constellationLinesMoll && Array.isArray(manager.constellationLinesMoll)) {
    manager.constellationLinesMoll.forEach(line => manager.editableLines.push(line));
  }
  if (manager.isolationOverlay && manager.isolationOverlay.adjacentLines) {
    manager.isolationOverlay.adjacentLines.forEach(obj => manager.editableLines.push(obj.lineM));
  }
  manager.editableLines.forEach(line => applyStoredLineEdits(manager, line));
}
