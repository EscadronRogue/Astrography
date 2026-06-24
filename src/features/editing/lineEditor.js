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
  if (manager.isolationOverlay?.mollweideLineLayer) {
    manager.editableLines.push(manager.isolationOverlay.mollweideLineLayer);
  } else if (manager.isolationOverlay && manager.isolationOverlay.adjacentLines) {
    manager.isolationOverlay.adjacentLines.forEach(obj => {
      if (obj.lineM) manager.editableLines.push(obj.lineM);
    });
  }
  manager.editableLines.forEach(line => applyStoredLineEdits(manager, line));
}

export function handleLinePointerDown(manager, event) {
  if (!manager.lineEditMode) return;
  manager.getPointerPos(event);
  manager.editRaycaster.setFromCamera(manager.editPointer, manager.mollweideMap.camera);
  const intersects = manager.editRaycaster.intersectObjects(manager.editableLines, false);
  if (intersects.length === 0) return;

  let intersect = null;
  for (const candidate of intersects) {
    const object = candidate.object;
    const index = candidate.index;
    const positionAttribute = object.geometry && object.geometry.getAttribute('position');
    if (positionAttribute && index !== undefined) {
      const start = object.type === 'LineSegments' ? index - (index % 2) : index;
      const base = start * 3;
      if (base + 5 < positionAttribute.array.length) {
        let removed = true;
        for (let i = 0; i < 6; i++) {
          if (!Number.isNaN(positionAttribute.array[base + i])) {
            removed = false;
            break;
          }
        }
        if (!removed) {
          intersect = candidate;
          break;
        }
      }
    } else {
      intersect = candidate;
      break;
    }
  }

  if (!intersect) return;

  const object = intersect.object;
  const index = intersect.index;
  const positionAttribute = object.geometry && object.geometry.getAttribute('position');
  if (positionAttribute && index !== undefined) {
    const start = object.type === 'LineSegments' ? index - (index % 2) : index;
    const base = start * 3;
    if (base + 5 < positionAttribute.array.length) {
      const previousPosition = [
        positionAttribute.array[base], positionAttribute.array[base + 1], positionAttribute.array[base + 2],
        positionAttribute.array[base + 3], positionAttribute.array[base + 4], positionAttribute.array[base + 5]
      ];
      for (let i = 0; i < 6; i++) positionAttribute.array[base + i] = NaN;
      positionAttribute.needsUpdate = true;
      let previousAlpha = null;
      const alphaAttribute = object.geometry.getAttribute('alpha');
      if (alphaAttribute) {
        previousAlpha = [alphaAttribute.array[start], alphaAttribute.array[start + 1]];
        alphaAttribute.array[start] = 0;
        alphaAttribute.array[start + 1] = 0;
        alphaAttribute.needsUpdate = true;
      }
      manager.removedLineSegments.add(previousPosition.join(','));
      manager.editHistory.push({
        type: 'removeSegment',
        object,
        index: start,
        prevPos: previousPosition,
        prevAlpha: previousAlpha
      });
      manager.requestRender();
      event.preventDefault();
      manager.maybePersistPresets();
      return;
    }
  }

  manager.editHistory.push({ type: 'toggleVisible', object, prevVisible: object.visible });
  object.visible = false;
  const key = manager.getLineKey(object);
  if (key) manager.hiddenLineKeys.add(key);
  manager.requestRender();
  event.preventDefault();
  manager.maybePersistPresets();
}
