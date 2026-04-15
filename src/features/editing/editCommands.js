export function getLineKeyFromObject(obj) {
  const posAttr = obj.geometry && obj.geometry.getAttribute('position');
  if (!posAttr || posAttr.array.length < 6) return null;
  const arr = posAttr.array;
  return [arr[0], arr[1], arr[2], arr[3], arr[4], arr[5]].join(',');
}

export function undoLastEdit(manager) {
  const action = manager.editHistory.pop();
  if (!action) return false;

  if (action.type === 'toggleVisible') {
    action.object.visible = action.prevVisible;
  } else if (action.type === 'removeSegment') {
    const posAttr = action.object.geometry.getAttribute('position');
    const base = action.index * 3;
    action.prevPos.forEach((value, offset) => {
      posAttr.array[base + offset] = value;
    });
    posAttr.needsUpdate = true;
    if (action.prevAlpha) {
      const alphaAttr = action.object.geometry.getAttribute('alpha');
      if (alphaAttr) {
        alphaAttr.array[action.index] = action.prevAlpha[0];
        alphaAttr.array[action.index + 1] = action.prevAlpha[1];
        alphaAttr.needsUpdate = true;
      }
    }
  } else if (action.type === 'moveLabel') {
    const label = action.label;
    const anchor = label.userData.anchorFunc();
    const newPos = anchor.clone().add(action.prevOffset);
    label.position.copy(newPos);
    if (label.userData.editType === 'star') {
      manager.starLabelOffsets.set(label.userData.editId, { x: action.prevOffset.x, y: action.prevOffset.y });
      if (label.userData.starRef) label.userData.starRef.mollLabelOffset = action.prevOffset.clone();
      if (label.userData.lineObj) label.userData.lineObj.geometry.setFromPoints([anchor, newPos]);
    } else if (label.userData.editType === 'constellation') {
      manager.constellationLabelOffsets.set(label.userData.editId, { x: action.prevOffset.x, y: action.prevOffset.y });
      label.userData.offset = action.prevOffset.clone();
    } else if (label.userData.editType === 'galactic') {
      manager.galacticLabelOffsets.set(label.userData.editId, { x: action.prevOffset.x, y: action.prevOffset.y });
      label.userData.offset = action.prevOffset.clone();
    }
    manager.updateEditOverlay();
  } else if (action.type === 'rotateLabel') {
    const label = action.label;
    label.material.rotation = action.prevRotation;
    if (label.userData.starRef) label.userData.starRef.mollLabelRotation = action.prevRotation;
    manager.starLabelRotations.set(label.userData.editId, action.prevRotation);
    manager.updateEditOverlay();
  } else if (action.type === 'scaleLabel') {
    const label = action.label;
    label.scale.copy(action.prevScale);
    if (label.userData.starRef) label.userData.starRef.mollLabelScale = action.prevScale.clone();
    manager.starLabelScales.set(label.userData.editId, { x: action.prevScale.x, y: action.prevScale.y });
    manager.updateEditOverlay();
  }

  manager.requestRender();
  manager.maybePersistPresets();
  return true;
}
