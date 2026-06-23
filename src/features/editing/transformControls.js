import * as THREE from '../../vendor/three.js';

function replaceTransformDocumentListeners(manager, key, moveHandler, upHandler) {
  manager[key]?.();
  const disposers = [
    manager.addManagedEventListener(globalThis.document, 'pointermove', moveHandler),
    manager.addManagedEventListener(globalThis.document, 'pointerup', upHandler)
  ].filter(dispose => typeof dispose === 'function');
  manager[key] = () => {
    while (disposers.length) {
      disposers.pop()();
    }
    manager[key] = null;
  };
}

export function setupEditOverlay(manager) {
  const container = document.querySelector('.label-container');
  if (!container) return;
  manager.editOverlay?.remove?.();
  manager.editOverlay = document.createElement('div');
  manager.editOverlay.id = 'label-edit-overlay';
  manager.rotateHandle = document.createElement('div');
  manager.rotateHandle.className = 'handle rotate-handle';
  manager.rotateHandle.textContent = '⟳';
  manager.scaleHandle = document.createElement('div');
  manager.scaleHandle.className = 'handle scale-handle';
  manager.scaleHandle.textContent = '⤡';
  manager.editOverlay.appendChild(manager.rotateHandle);
  manager.editOverlay.appendChild(manager.scaleHandle);
  container.appendChild(manager.editOverlay);

  manager.addManagedEventListener(manager.rotateHandle, 'pointerdown', event => {
    if (!manager.selectedLabel) return;
    manager.isRotating = true;
    const rect = manager.editOverlay.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    manager.rotateStartAngle = Math.atan2(event.clientY - cy, event.clientX - cx);
    manager.rotateInitialRotation = manager.selectedLabel.material.rotation || 0;
    manager.rotateCurrentRotation = manager.rotateInitialRotation;
    replaceTransformDocumentListeners(manager, 'stopRotateTransformListeners', manager.onRotateMove, manager.onRotateUp);
    event.stopPropagation();
    event.preventDefault();
  });

  manager.addManagedEventListener(manager.scaleHandle, 'pointerdown', event => {
    if (!manager.selectedLabel) return;
    manager.isScaling = true;
    const rect = manager.editOverlay.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    manager.scaleStart = {
      dist: Math.hypot(dx, dy),
      sx: manager.selectedLabel.scale.x,
      sy: manager.selectedLabel.scale.y
    };
    replaceTransformDocumentListeners(manager, 'stopScaleTransformListeners', manager.onScaleMove, manager.onScaleUp);
    event.stopPropagation();
    event.preventDefault();
  });
}

export function handleRotateMove(manager, event) {
  if (!manager.isRotating || !manager.selectedLabel) return;
  const rect = manager.editOverlay.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const angle = Math.atan2(event.clientY - cy, event.clientX - cx);
  const delta = manager.angleDiff(angle, manager.rotateStartAngle);
  manager.rotateCurrentRotation -= delta * manager.ROTATE_SENSITIVITY;
  manager.selectedLabel.material.rotation = manager.rotateCurrentRotation;
  manager.rotateStartAngle = angle;
  if (manager.selectedLabel.userData.starRef) {
    manager.selectedLabel.userData.starRef.mollLabelRotation = manager.rotateCurrentRotation;
  }
  manager.starLabelRotations.set(manager.selectedLabel.userData.editId, manager.rotateCurrentRotation);
  manager.updateEditOverlay();
  manager.requestRender();
}

export function handleRotateUp(manager) {
  if (!manager.isRotating) return;
  manager.stopRotateTransformListeners?.();
  manager.editHistory.push({ type: 'rotateLabel', label: manager.selectedLabel, prevRotation: manager.rotateInitialRotation });
  manager.isRotating = false;
  manager.maybePersistPresets();
}

export function handleScaleMove(manager, event) {
  if (!manager.isScaling || !manager.selectedLabel) return;
  const rect = manager.editOverlay.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = event.clientX - cx;
  const dy = event.clientY - cy;
  const dist = Math.hypot(dx, dy);
  const ratio = dist / manager.scaleStart.dist;
  const factor = 1 + (ratio - 1) * 0.5;
  const newX = manager.scaleStart.sx * factor;
  const newY = manager.scaleStart.sy * factor;
  manager.selectedLabel.scale.set(newX, newY, 1);
  if (manager.selectedLabel.userData.starRef) {
    manager.selectedLabel.userData.starRef.mollLabelScale = new THREE.Vector3(newX, newY, 1);
  }
  manager.starLabelScales.set(manager.selectedLabel.userData.editId, { x: newX, y: newY });
  manager.updateEditOverlay();
  manager.requestRender();
}

export function handleScaleUp(manager) {
  if (!manager.isScaling) return;
  manager.stopScaleTransformListeners?.();
  manager.editHistory.push({
    type: 'scaleLabel',
    label: manager.selectedLabel,
    prevScale: new THREE.Vector3(manager.scaleStart.sx, manager.scaleStart.sy, 1)
  });
  manager.isScaling = false;
  manager.maybePersistPresets();
}
