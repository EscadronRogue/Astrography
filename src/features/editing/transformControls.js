import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';

export function setupEditOverlay(manager) {
  const container = document.querySelector('.label-container');
  if (!container) return;
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

  manager.rotateHandle.addEventListener('pointerdown', event => {
    if (!manager.selectedLabel) return;
    manager.isRotating = true;
    const rect = manager.editOverlay.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    manager.rotateStartAngle = Math.atan2(event.clientY - cy, event.clientX - cx);
    manager.rotateInitialRotation = manager.selectedLabel.material.rotation || 0;
    manager.rotateCurrentRotation = manager.rotateInitialRotation;
    document.addEventListener('pointermove', manager.onRotateMove);
    document.addEventListener('pointerup', manager.onRotateUp);
    event.stopPropagation();
    event.preventDefault();
  });

  manager.scaleHandle.addEventListener('pointerdown', event => {
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
    document.addEventListener('pointermove', manager.onScaleMove);
    document.addEventListener('pointerup', manager.onScaleUp);
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
  document.removeEventListener('pointermove', manager.onRotateMove);
  document.removeEventListener('pointerup', manager.onRotateUp);
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
  document.removeEventListener('pointermove', manager.onScaleMove);
  document.removeEventListener('pointerup', manager.onScaleUp);
  manager.editHistory.push({
    type: 'scaleLabel',
    label: manager.selectedLabel,
    prevScale: new THREE.Vector3(manager.scaleStart.sx, manager.scaleStart.sy, 1)
  });
  manager.isScaling = false;
  manager.maybePersistPresets();
}
