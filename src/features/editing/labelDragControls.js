export function handleEditPointerDown(manager, event) {
  if (!manager.labelEditMode) return;
  const position = manager.getPointerPos(event);
  manager.editRaycaster.setFromCamera(manager.editPointer, manager.mollweideMap.camera);
  const intersects = manager.editRaycaster.intersectObjects(manager.editableLabels, false);
  if (intersects.length > 0) {
    const label = intersects[0].object;
    if (manager.selectedLabel !== label) {
      manager.selectedLabel = label;
      manager.updateEditOverlay();
    }
    manager.initialLabelPos = manager.selectedLabel.position.clone();
    manager.dragOffset.copy(position).sub(manager.selectedLabel.position);
    manager.selectedLabel.userData._origColor = manager.selectedLabel.material.color.clone();
    if (manager.selectedLabel.userData.lineObj) {
      manager.selectedLabel.userData._origLineColor = manager.selectedLabel.userData.lineObj.material.color.clone();
    }
    manager.selectedLabel.material.color.offsetHSL(0, 0, 0.1);
    if (manager.selectedLabel.userData.lineObj) {
      manager.selectedLabel.userData.lineObj.material.color.offsetHSL(0, 0, 0.1);
    }
    manager.mollweideMap.canvas.classList.add('dragging');
    manager.isDragging = true;
    manager.requestRender();
    event.preventDefault();
    return;
  }

  if (manager.selectedLabel) {
    manager.selectedLabel = null;
    manager.updateEditOverlay();
    manager.requestRender();
  }
}

export function handleEditPointerMove(manager, event) {
  if (!manager.labelEditMode || !manager.selectedLabel || !manager.isDragging) return;
  const position = manager.getPointerPos(event);
  manager.selectedLabel.position.copy(position.clone().sub(manager.dragOffset));
  if (manager.selectedLabel.userData.editType === 'star' && manager.selectedLabel.userData.lineObj) {
    const anchor = manager.selectedLabel.userData.anchorFunc();
    manager.selectedLabel.userData.lineObj.geometry.setFromPoints([anchor, manager.selectedLabel.position]);
  }
  manager.updateEditOverlay();
  manager.requestRender();
  event.preventDefault();
}

export function handleEditPointerUp(manager) {
  if (!manager.labelEditMode || !manager.selectedLabel) return;
  const anchor = manager.selectedLabel.userData.anchorFunc();
  const offsetVec = manager.selectedLabel.position.clone().sub(anchor);
  if (manager.selectedLabel.userData.editType === 'star') {
    manager.starLabelOffsets.set(manager.selectedLabel.userData.editId, { x: offsetVec.x, y: offsetVec.y });
    if (manager.selectedLabel.userData.starRef) {
      manager.selectedLabel.userData.starRef.mollLabelOffset = offsetVec.clone();
    }
    if (manager.selectedLabel.userData.lineObj) {
      manager.selectedLabel.userData.lineObj.geometry.setFromPoints([anchor, manager.selectedLabel.position]);
    }
  } else if (manager.selectedLabel.userData.editType === 'constellation') {
    manager.constellationLabelOffsets.set(manager.selectedLabel.userData.editId, { x: offsetVec.x, y: offsetVec.y });
    manager.selectedLabel.userData.offset = offsetVec.clone();
  } else if (manager.selectedLabel.userData.editType === 'galactic') {
    manager.galacticLabelOffsets.set(manager.selectedLabel.userData.editId, { x: offsetVec.x, y: offsetVec.y });
    manager.selectedLabel.userData.offset = offsetVec.clone();
  }

  if (manager.selectedLabel.userData._origColor) {
    manager.selectedLabel.material.color.copy(manager.selectedLabel.userData._origColor);
  }
  if (manager.selectedLabel.userData.lineObj && manager.selectedLabel.userData._origLineColor) {
    manager.selectedLabel.userData.lineObj.material.color.copy(manager.selectedLabel.userData._origLineColor);
  }

  manager.mollweideMap.canvas.classList.remove('dragging');
  if (manager.initialLabelPos) {
    const prevOffset = manager.initialLabelPos.clone().sub(anchor);
    manager.editHistory.push({ type: 'moveLabel', label: manager.selectedLabel, prevOffset });
  }
  manager.isDragging = false;
  manager.updateEditOverlay();
  manager.requestRender();
  manager.initialLabelPos = null;
  manager.maybePersistPresets();
}

export function setupLabelEditor(manager) {
  const button = document.getElementById('toggle-label-editor');
  if (!button) return;
  button.addEventListener('click', () => {
    manager.labelEditMode = !manager.labelEditMode;
    button.classList.toggle('active', manager.labelEditMode);
    if (manager.labelEditMode) {
      manager.lineEditMode = false;
      const lineButton = document.getElementById('toggle-line-editor');
      if (lineButton) lineButton.classList.remove('active');
    }
    manager.mollweideMap.canvas.classList.toggle('edit-mode', manager.labelEditMode || manager.lineEditMode);
    if (manager.labelEditMode) {
      manager.registerMollweideEditableLabels();
    } else {
      manager.selectedLabel = null;
      manager.updateEditOverlay();
    }
    manager.requestRender();
  });
  manager.mollweideMap.canvas.addEventListener('pointerdown', manager.onEditPointerDown);
  manager.mollweideMap.canvas.addEventListener('pointermove', manager.onEditPointerMove);
  window.addEventListener('pointerup', manager.onEditPointerUp);
}
