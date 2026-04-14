import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { cachedRadToMollweide, getMollweideLambda0 } from '../utils/geometryUtils.js';
import { rebuildConstellationMeshFromSegments } from '../filters/constellationFilter.js';
import { getStarId } from '../shared/starUtils.js';

const ROTATE_SENSITIVITY = 0.3;

function angleDiff(a, b) {
  let diff = a - b;
  diff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
  return diff;
}

export function createEditManager({
  mollweideMap,
  getConstellationLabelsMoll,
  getConstellationLinesMoll,
  getGalacticDirectionLabelsMoll,
  getIsolationOverlay,
  getCachedStars,
  requestRender,
  maybePersistPresets,
  rebuildFilters,
  presetMaps,
  lineState
}) {
  const editPointer = new THREE.Vector2();
  const editRaycaster = new THREE.Raycaster();
  const editPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const dragOffset = new THREE.Vector3();

  const state = {
    labelEditMode: false,
    lineEditMode: false,
    editableLabels: [],
    editableLines: [],
    selectedLabel: null,
    initialLabelPos: null,
    editOverlay: null,
    rotateHandle: null,
    scaleHandle: null,
    editHistory: [],
    isDragging: false,
    isRotating: false,
    isScaling: false,
    rotateStartAngle: 0,
    rotateInitialRotation: 0,
    rotateCurrentRotation: 0,
    scaleStart: null
  };

  function getPointerPos(event) {
    const rect = mollweideMap.canvas.getBoundingClientRect();
    editPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    editPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    editRaycaster.setFromCamera(editPointer, mollweideMap.camera);
    const point = new THREE.Vector3();
    editRaycaster.ray.intersectPlane(editPlane, point);
    return point;
  }

  function updateEditOverlay() {
    if (!state.editOverlay) return;
    if (!state.selectedLabel) {
      state.editOverlay.style.display = 'none';
      return;
    }
    const rect = mollweideMap.canvas.getBoundingClientRect();
    const pos = state.selectedLabel.position.clone().project(mollweideMap.camera);
    const x = (pos.x * 0.5 + 0.5) * rect.width + rect.left;
    const y = (-pos.y * 0.5 + 0.5) * rect.height + rect.top;
    state.editOverlay.style.display = 'block';
    state.editOverlay.style.left = `${x}px`;
    state.editOverlay.style.top = `${y}px`;

    const center = state.selectedLabel.position.clone();
    const halfW = state.selectedLabel.scale.x / 2;
    const rightVec = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(mollweideMap.camera.quaternion)
      .multiplyScalar(halfW);
    const leftWorld = center.clone().sub(rightVec);
    const rightWorld = center.clone().add(rightVec);
    const lp = leftWorld.clone().project(mollweideMap.camera);
    const rp = rightWorld.clone().project(mollweideMap.camera);
    const lx = (lp.x * 0.5 + 0.5) * rect.width + rect.left;
    const rx = (rp.x * 0.5 + 0.5) * rect.width + rect.left;
    const labelWidth = Math.abs(rx - lx);
    const iconSize = 36;
    const offset = labelWidth / 2 + iconSize / 2 + 10;
    state.rotateHandle.style.left = `-${offset}px`;
    state.scaleHandle.style.left = `${offset}px`;
  }

  function applyCurrentEditsToStar(star, id) {
    if (presetMaps.starLabelOffsets.has(id)) {
      const off = presetMaps.starLabelOffsets.get(id);
      star.mollLabelOffset = new THREE.Vector3(off.x, off.y, 0);
    } else {
      delete star.mollLabelOffset;
    }
    if (presetMaps.starLabelRotations.has(id)) {
      star.mollLabelRotation = presetMaps.starLabelRotations.get(id);
    } else {
      delete star.mollLabelRotation;
    }
    if (presetMaps.starLabelScales.has(id)) {
      const sc = presetMaps.starLabelScales.get(id);
      star.mollLabelScale = new THREE.Vector3(sc.x, sc.y, 1);
    } else {
      delete star.mollLabelScale;
    }
  }

  function downloadLabelEdits() {
    const edits = {
      starOffsets: Array.from(presetMaps.starLabelOffsets.entries()),
      starRotations: Array.from(presetMaps.starLabelRotations.entries()),
      starScales: Array.from(presetMaps.starLabelScales.entries()),
      constellationOffsets: Array.from(presetMaps.constellationLabelOffsets.entries()),
      galacticOffsets: Array.from(presetMaps.galacticLabelOffsets.entries())
    };
    const blob = new Blob([JSON.stringify(edits, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'label-edits.json';
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function applyLabelEdits(edits) {
    if (!edits) return;
    if (edits.starOffsets) {
      presetMaps.starLabelOffsets.clear();
      edits.starOffsets.forEach(([id, off]) => presetMaps.starLabelOffsets.set(id, off));
    }
    if (edits.starRotations) {
      presetMaps.starLabelRotations.clear();
      edits.starRotations.forEach(([id, rot]) => presetMaps.starLabelRotations.set(id, rot));
    }
    if (edits.starScales) {
      presetMaps.starLabelScales.clear();
      edits.starScales.forEach(([id, sc]) => presetMaps.starLabelScales.set(id, sc));
    }
    if (edits.constellationOffsets) {
      presetMaps.constellationLabelOffsets.clear();
      edits.constellationOffsets.forEach(([id, off]) => presetMaps.constellationLabelOffsets.set(id, off));
    }
    if (edits.galacticOffsets) {
      presetMaps.galacticLabelOffsets.clear();
      edits.galacticOffsets.forEach(([id, off]) => presetMaps.galacticLabelOffsets.set(id, off));
    }

    const cachedStars = getCachedStars();
    if (cachedStars) {
      cachedStars.forEach(star => {
        applyCurrentEditsToStar(star, getStarId(star));
      });
    }
    rebuildFilters();
    maybePersistPresets();
  }

  function registerMollweideEditableLabels() {
    state.editableLabels = [];

    mollweideMap.labelManager.sprites.forEach((sprite, star) => {
      const id = getStarId(star);
      sprite.userData = sprite.userData || {};
      sprite.userData.editType = 'star';
      sprite.userData.editId = id;
      sprite.userData.lineObj = mollweideMap.labelManager.lines.get(star);
      sprite.userData.starRef = star;
      sprite.userData.anchorFunc = () => star.mollweidePosition.clone();
      state.editableLabels.push(sprite);
      applyCurrentEditsToStar(star, id);
      if (star.mollLabelOffset) sprite.position.copy(star.mollweidePosition.clone().add(star.mollLabelOffset));
      if (star.mollLabelRotation !== undefined) sprite.material.rotation = star.mollLabelRotation;
      if (star.mollLabelScale) sprite.scale.set(star.mollLabelScale.x, star.mollLabelScale.y, 1);
    });

    getConstellationLabelsMoll().forEach(sprite => {
      if (!sprite.userData) return;
      sprite.userData.editType = 'constellation';
      sprite.userData.editId = sprite.userData.name;
      sprite.userData.anchorFunc = () => {
        const p = cachedRadToMollweide(sprite.userData.ra, sprite.userData.dec, 100, getMollweideLambda0());
        return new THREE.Vector3(p.x, p.y, 0);
      };
      state.editableLabels.push(sprite);
      const anchor = sprite.userData.anchorFunc();
      sprite.position.copy(anchor);
      if (presetMaps.constellationLabelOffsets.has(sprite.userData.name)) {
        const off = presetMaps.constellationLabelOffsets.get(sprite.userData.name);
        const offsetVec = new THREE.Vector3(off.x, off.y, 0);
        sprite.position.add(offsetVec);
        sprite.userData.offset = offsetVec.clone();
      }
    });

    getGalacticDirectionLabelsMoll().forEach(sprite => {
      if (!sprite.userData) return;
      sprite.userData.editType = 'galactic';
      sprite.userData.editId = sprite.userData.name;
      sprite.userData.anchorFunc = () => {
        const p = cachedRadToMollweide(sprite.userData.ra, sprite.userData.dec, 100, getMollweideLambda0());
        return new THREE.Vector3(p.x, p.y, 0);
      };
      state.editableLabels.push(sprite);
      const anchor = sprite.userData.anchorFunc();
      sprite.position.copy(anchor);
      if (presetMaps.galacticLabelOffsets.has(sprite.userData.name)) {
        const off = presetMaps.galacticLabelOffsets.get(sprite.userData.name);
        const offsetVec = new THREE.Vector3(off.x, off.y, 0);
        sprite.position.add(offsetVec);
        sprite.userData.offset = offsetVec.clone();
      }
    });
  }

  function getLineKey(obj) {
    const posAttr = obj.geometry && obj.geometry.getAttribute('position');
    if (!posAttr || posAttr.array.length < 6) return null;
    const arr = posAttr.array;
    return [arr[0], arr[1], arr[2], arr[3], arr[4], arr[5]].join(',');
  }

  function applyStoredLineEdits(root) {
    if (!root) return;
    root.traverse(obj => {
      const key = getLineKey(obj);
      if (key && lineState.hiddenLineKeys.has(key)) obj.visible = false;
      if (obj.type !== 'Line' && obj.type !== 'LineSegments') return;
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
        if (lineState.removedLineSegments.has(segKey)) {
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
        if (obj.userData && obj.userData.visibleMesh) rebuildConstellationMeshFromSegments(obj);
      }
    });
  }

  function registerMollweideEditableLines() {
    state.editableLines = [];
    if (mollweideMap.connectionGroup) {
      mollweideMap.connectionGroup.traverse(obj => {
        if (obj.isLine || obj.type === 'Line' || obj.type === 'LineSegments') {
          state.editableLines.push(obj);
        }
      });
    }
    getConstellationLinesMoll().forEach(line => state.editableLines.push(line));
    const isolationOverlay = getIsolationOverlay();
    if (isolationOverlay && isolationOverlay.adjacentLines) {
      isolationOverlay.adjacentLines.forEach(item => state.editableLines.push(item.lineM));
    }
    state.editableLines.forEach(applyStoredLineEdits);
  }

  function onLinePointerDown(event) {
    if (!state.lineEditMode) return;
    getPointerPos(event);
    editRaycaster.setFromCamera(editPointer, mollweideMap.camera);
    const intersects = editRaycaster.intersectObjects(state.editableLines, false);
    if (intersects.length === 0) return;

    let intersect = null;
    for (const candidate of intersects) {
      const obj = candidate.object;
      const idx = candidate.index;
      const posAttr = obj.geometry && obj.geometry.getAttribute('position');
      if (posAttr && idx !== undefined) {
        const start = obj.type === 'LineSegments' ? idx - (idx % 2) : idx;
        const base = start * 3;
        if (base + 5 < posAttr.array.length) {
          let removed = true;
          for (let i = 0; i < 6; i++) {
            if (!Number.isNaN(posAttr.array[base + i])) {
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

    const obj = intersect.object;
    const idx = intersect.index;
    const posAttr = obj.geometry && obj.geometry.getAttribute('position');
    if (posAttr && idx !== undefined) {
      const start = obj.type === 'LineSegments' ? idx - (idx % 2) : idx;
      const base = start * 3;
      if (base + 5 < posAttr.array.length) {
        const prevPos = [
          posAttr.array[base], posAttr.array[base + 1], posAttr.array[base + 2],
          posAttr.array[base + 3], posAttr.array[base + 4], posAttr.array[base + 5]
        ];
        for (let i = 0; i < 6; i++) posAttr.array[base + i] = NaN;
        posAttr.needsUpdate = true;
        let prevAlpha = null;
        const alphaAttr = obj.geometry.getAttribute('alpha');
        if (alphaAttr) {
          prevAlpha = [alphaAttr.array[start], alphaAttr.array[start + 1]];
          alphaAttr.array[start] = 0;
          alphaAttr.array[start + 1] = 0;
          alphaAttr.needsUpdate = true;
        }
        lineState.removedLineSegments.add(prevPos.join(','));
        state.editHistory.push({ type: 'removeSegment', object: obj, index: start, prevPos, prevAlpha });
        requestRender();
        event.preventDefault();
        maybePersistPresets();
        return;
      }
    }

    state.editHistory.push({ type: 'toggleVisible', object: obj, prevVisible: obj.visible });
    obj.visible = false;
    const key = getLineKey(obj);
    if (key) lineState.hiddenLineKeys.add(key);
    requestRender();
    event.preventDefault();
    maybePersistPresets();
  }

  function onEditPointerDown(event) {
    if (!state.labelEditMode) return;
    const pos = getPointerPos(event);
    editRaycaster.setFromCamera(editPointer, mollweideMap.camera);
    const intersects = editRaycaster.intersectObjects(state.editableLabels, false);
    if (intersects.length > 0) {
      const label = intersects[0].object;
      if (state.selectedLabel !== label) {
        state.selectedLabel = label;
        updateEditOverlay();
      }
      state.initialLabelPos = state.selectedLabel.position.clone();
      dragOffset.copy(pos).sub(state.selectedLabel.position);
      state.selectedLabel.userData._origColor = state.selectedLabel.material.color.clone();
      if (state.selectedLabel.userData.lineObj) {
        state.selectedLabel.userData._origLineColor = state.selectedLabel.userData.lineObj.material.color.clone();
      }
      state.selectedLabel.material.color.offsetHSL(0, 0, 0.1);
      if (state.selectedLabel.userData.lineObj) {
        state.selectedLabel.userData.lineObj.material.color.offsetHSL(0, 0, 0.1);
      }
      mollweideMap.canvas.classList.add('dragging');
      state.isDragging = true;
      requestRender();
      event.preventDefault();
      return;
    }

    if (state.selectedLabel) {
      state.selectedLabel = null;
      updateEditOverlay();
      requestRender();
    }
  }

  function onEditPointerMove(event) {
    if (!state.labelEditMode || !state.selectedLabel || !state.isDragging) return;
    const pos = getPointerPos(event);
    state.selectedLabel.position.copy(pos.clone().sub(dragOffset));
    if (state.selectedLabel.userData.editType === 'star' && state.selectedLabel.userData.lineObj) {
      const anchor = state.selectedLabel.userData.anchorFunc();
      state.selectedLabel.userData.lineObj.geometry.setFromPoints([anchor, state.selectedLabel.position]);
    }
    updateEditOverlay();
    requestRender();
    event.preventDefault();
  }

  function onEditPointerUp() {
    if (!state.labelEditMode || !state.selectedLabel) return;
    const anchor = state.selectedLabel.userData.anchorFunc();
    const offsetVec = state.selectedLabel.position.clone().sub(anchor);
    if (state.selectedLabel.userData.editType === 'star') {
      presetMaps.starLabelOffsets.set(state.selectedLabel.userData.editId, { x: offsetVec.x, y: offsetVec.y });
      if (state.selectedLabel.userData.starRef) state.selectedLabel.userData.starRef.mollLabelOffset = offsetVec.clone();
      if (state.selectedLabel.userData.lineObj) {
        state.selectedLabel.userData.lineObj.geometry.setFromPoints([anchor, state.selectedLabel.position]);
      }
    } else if (state.selectedLabel.userData.editType === 'constellation') {
      presetMaps.constellationLabelOffsets.set(state.selectedLabel.userData.editId, { x: offsetVec.x, y: offsetVec.y });
      state.selectedLabel.userData.offset = offsetVec.clone();
    } else if (state.selectedLabel.userData.editType === 'galactic') {
      presetMaps.galacticLabelOffsets.set(state.selectedLabel.userData.editId, { x: offsetVec.x, y: offsetVec.y });
      state.selectedLabel.userData.offset = offsetVec.clone();
    }
    if (state.selectedLabel.userData._origColor) {
      state.selectedLabel.material.color.copy(state.selectedLabel.userData._origColor);
    }
    if (state.selectedLabel.userData.lineObj && state.selectedLabel.userData._origLineColor) {
      state.selectedLabel.userData.lineObj.material.color.copy(state.selectedLabel.userData._origLineColor);
    }
    mollweideMap.canvas.classList.remove('dragging');
    if (state.initialLabelPos) {
      const prevOffset = state.initialLabelPos.clone().sub(anchor);
      state.editHistory.push({ type: 'moveLabel', label: state.selectedLabel, prevOffset });
    }
    state.isDragging = false;
    updateEditOverlay();
    requestRender();
    state.initialLabelPos = null;
    maybePersistPresets();
  }

  function onRotateMove(event) {
    if (!state.isRotating || !state.selectedLabel) return;
    const rect = state.editOverlay.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = Math.atan2(event.clientY - cy, event.clientX - cx);
    const delta = angleDiff(angle, state.rotateStartAngle);
    state.rotateCurrentRotation -= delta * ROTATE_SENSITIVITY;
    state.selectedLabel.material.rotation = state.rotateCurrentRotation;
    state.rotateStartAngle = angle;
    if (state.selectedLabel.userData.starRef) state.selectedLabel.userData.starRef.mollLabelRotation = state.rotateCurrentRotation;
    presetMaps.starLabelRotations.set(state.selectedLabel.userData.editId, state.rotateCurrentRotation);
    updateEditOverlay();
    requestRender();
  }

  function onRotateUp() {
    if (!state.isRotating) return;
    document.removeEventListener('pointermove', onRotateMove);
    document.removeEventListener('pointerup', onRotateUp);
    state.editHistory.push({ type: 'rotateLabel', label: state.selectedLabel, prevRotation: state.rotateInitialRotation });
    state.isRotating = false;
    maybePersistPresets();
  }

  function onScaleMove(event) {
    if (!state.isScaling || !state.selectedLabel) return;
    const rect = state.editOverlay.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const ratio = dist / state.scaleStart.dist;
    const factor = 1 + (ratio - 1) * 0.5;
    const newX = state.scaleStart.sx * factor;
    const newY = state.scaleStart.sy * factor;
    state.selectedLabel.scale.set(newX, newY, 1);
    if (state.selectedLabel.userData.starRef) state.selectedLabel.userData.starRef.mollLabelScale = new THREE.Vector3(newX, newY, 1);
    presetMaps.starLabelScales.set(state.selectedLabel.userData.editId, { x: newX, y: newY });
    updateEditOverlay();
    requestRender();
  }

  function onScaleUp() {
    if (!state.isScaling) return;
    document.removeEventListener('pointermove', onScaleMove);
    document.removeEventListener('pointerup', onScaleUp);
    state.editHistory.push({
      type: 'scaleLabel',
      label: state.selectedLabel,
      prevScale: new THREE.Vector3(state.scaleStart.sx, state.scaleStart.sy, 1)
    });
    state.isScaling = false;
    maybePersistPresets();
  }

  function setupLabelEditor() {
    const btn = document.getElementById('toggle-label-editor');
    if (!btn) return;
    btn.addEventListener('click', () => {
      state.labelEditMode = !state.labelEditMode;
      btn.classList.toggle('active', state.labelEditMode);
      if (state.labelEditMode) {
        state.lineEditMode = false;
        const lineButton = document.getElementById('toggle-line-editor');
        if (lineButton) lineButton.classList.remove('active');
      }
      mollweideMap.canvas.classList.toggle('edit-mode', state.labelEditMode || state.lineEditMode);
      if (state.labelEditMode) {
        registerMollweideEditableLabels();
      } else {
        state.selectedLabel = null;
        updateEditOverlay();
      }
      requestRender();
    });
    mollweideMap.canvas.addEventListener('pointerdown', onEditPointerDown);
    mollweideMap.canvas.addEventListener('pointermove', onEditPointerMove);
    window.addEventListener('pointerup', onEditPointerUp);
  }

  function setupLineEditor() {
    const btn = document.getElementById('toggle-line-editor');
    if (!btn) return;
    btn.addEventListener('click', () => {
      state.lineEditMode = !state.lineEditMode;
      btn.classList.toggle('active', state.lineEditMode);
      if (state.lineEditMode) {
        state.labelEditMode = false;
        const labelButton = document.getElementById('toggle-label-editor');
        if (labelButton) labelButton.classList.remove('active');
        registerMollweideEditableLines();
        state.selectedLabel = null;
        updateEditOverlay();
      }
      mollweideMap.canvas.classList.toggle('edit-mode', state.lineEditMode || state.labelEditMode);
      requestRender();
    });
    mollweideMap.canvas.addEventListener('pointerdown', onLinePointerDown);
  }

  function setupUndoButton() {
    const btn = document.getElementById('undo-edit');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const action = state.editHistory.pop();
      if (!action) return;
      if (action.type === 'toggleVisible') {
        action.object.visible = action.prevVisible;
      } else if (action.type === 'removeSegment') {
        const posAttr = action.object.geometry.getAttribute('position');
        const base = action.index * 3;
        action.prevPos.forEach((value, index) => {
          posAttr.array[base + index] = value;
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
          presetMaps.starLabelOffsets.set(label.userData.editId, { x: action.prevOffset.x, y: action.prevOffset.y });
          if (label.userData.starRef) label.userData.starRef.mollLabelOffset = action.prevOffset.clone();
          if (label.userData.lineObj) label.userData.lineObj.geometry.setFromPoints([anchor, newPos]);
        } else if (label.userData.editType === 'constellation') {
          presetMaps.constellationLabelOffsets.set(label.userData.editId, { x: action.prevOffset.x, y: action.prevOffset.y });
          label.userData.offset = action.prevOffset.clone();
        } else if (label.userData.editType === 'galactic') {
          presetMaps.galacticLabelOffsets.set(label.userData.editId, { x: action.prevOffset.x, y: action.prevOffset.y });
          label.userData.offset = action.prevOffset.clone();
        }
        updateEditOverlay();
      } else if (action.type === 'rotateLabel') {
        const label = action.label;
        label.material.rotation = action.prevRotation;
        if (label.userData.starRef) label.userData.starRef.mollLabelRotation = action.prevRotation;
        presetMaps.starLabelRotations.set(label.userData.editId, action.prevRotation);
        updateEditOverlay();
      } else if (action.type === 'scaleLabel') {
        const label = action.label;
        label.scale.copy(action.prevScale);
        if (label.userData.starRef) label.userData.starRef.mollLabelScale = action.prevScale.clone();
        presetMaps.starLabelScales.set(label.userData.editId, { x: action.prevScale.x, y: action.prevScale.y });
        updateEditOverlay();
      }
      requestRender();
      maybePersistPresets();
    });
  }

  function setupEditIOControls() {
    const downloadButton = document.getElementById('download-edits');
    if (downloadButton) downloadButton.addEventListener('click', downloadLabelEdits);

    const uploadButton = document.getElementById('upload-edits');
    const fileInput = document.getElementById('upload-edits-input');
    if (!uploadButton || !fileInput) return;
    uploadButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        applyLabelEdits(JSON.parse(text));
      } catch {
        alert('Invalid edits file');
      }
      fileInput.value = '';
    });
  }

  function setupEditOverlay() {
    const container = document.querySelector('.label-container');
    if (!container) return;
    state.editOverlay = document.createElement('div');
    state.editOverlay.id = 'label-edit-overlay';
    state.rotateHandle = document.createElement('div');
    state.rotateHandle.className = 'handle rotate-handle';
    state.rotateHandle.textContent = '⟳';
    state.scaleHandle = document.createElement('div');
    state.scaleHandle.className = 'handle scale-handle';
    state.scaleHandle.textContent = '⤡';
    state.editOverlay.appendChild(state.rotateHandle);
    state.editOverlay.appendChild(state.scaleHandle);
    container.appendChild(state.editOverlay);

    state.rotateHandle.addEventListener('pointerdown', event => {
      if (!state.selectedLabel) return;
      state.isRotating = true;
      const rect = state.editOverlay.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      state.rotateStartAngle = Math.atan2(event.clientY - cy, event.clientX - cx);
      state.rotateInitialRotation = state.selectedLabel.material.rotation || 0;
      state.rotateCurrentRotation = state.rotateInitialRotation;
      document.addEventListener('pointermove', onRotateMove);
      document.addEventListener('pointerup', onRotateUp);
      event.stopPropagation();
      event.preventDefault();
    });

    state.scaleHandle.addEventListener('pointerdown', event => {
      if (!state.selectedLabel) return;
      state.isScaling = true;
      const rect = state.editOverlay.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = event.clientX - cx;
      const dy = event.clientY - cy;
      state.scaleStart = {
        dist: Math.hypot(dx, dy),
        sx: state.selectedLabel.scale.x,
        sy: state.selectedLabel.scale.y
      };
      document.addEventListener('pointermove', onScaleMove);
      document.addEventListener('pointerup', onScaleUp);
      event.stopPropagation();
      event.preventDefault();
    });
  }

  function setup() {
    setupLabelEditor();
    setupLineEditor();
    setupUndoButton();
    setupEditIOControls();
    setupEditOverlay();
  }

  return {
    setup,
    registerMollweideEditableLabels,
    applyStoredLineEdits,
    updateOverlay: updateEditOverlay
  };
}
