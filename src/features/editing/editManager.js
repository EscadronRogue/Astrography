import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { initializeEditState } from './editState.js';
import { downloadLabelEdits, applyLabelEdits, buildSerializableEditState } from './editPersistence.js';
import { setupEditIOControls } from './editIOControls.js';
import { updateEditOverlayPosition, registerEditableLabels } from './labelEditor.js';
import { getLineKey as getStoredLineKey, applyStoredLineEdits, registerEditableLines } from './lineEditor.js';

export class EditManager {
  constructor(mollweideMap, cachedStars, constellationLabelsMoll, galacticDirectionLabelsMoll, getStarId, buildAndApplyFilters, maybePersistPresets, requestRender) {
    this.mollweideMap = mollweideMap;
    this.cachedStars = cachedStars;
    this.constellationLabelsMoll = constellationLabelsMoll;
    this.galacticDirectionLabelsMoll = galacticDirectionLabelsMoll;
    this.getStarId = getStarId;
    this.buildAndApplyFilters = buildAndApplyFilters;
    this.maybePersistPresets = maybePersistPresets;
    this.requestRender = requestRender;
    initializeEditState(this);
  }

  downloadLabelEdits() {
    downloadLabelEdits(this);
  }

  applyLabelEdits(edits) {
    applyLabelEdits(this, edits);
  }

  setupEditIOControls() {
    setupEditIOControls(this);
  }

  getPointerPos(event) {
    const rect = this.mollweideMap.canvas.getBoundingClientRect();
    this.editPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.editPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.editRaycaster.setFromCamera(this.editPointer, this.mollweideMap.camera);
    const point = new THREE.Vector3();
    this.editRaycaster.ray.intersectPlane(this.editPlane, point);
    return point;
  }

  updateEditOverlay() {
    updateEditOverlayPosition(this);
  }

  registerMollweideEditableLabels() {
    registerEditableLabels(this);
  }

  getLineKey(obj) {
    return getStoredLineKey(obj);
  }

  applyStoredLineEdits(root) {
    applyStoredLineEdits(this, root);
  }

  registerMollweideEditableLines() {
    registerEditableLines(this);
  }

  onLinePointerDown = (e) => {
    if (!this.lineEditMode) return;
    this.getPointerPos(e);
    this.editRaycaster.setFromCamera(this.editPointer, this.mollweideMap.camera);
    const intersects = this.editRaycaster.intersectObjects(this.editableLines, false);
    if (intersects.length > 0) {
      let intersect = null;
      for (const intr of intersects) {
        const obj = intr.object;
        const idx = intr.index;
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
              intersect = intr;
              break;
            }
          }
        } else {
          intersect = intr;
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
          this.removedLineSegments.add(prevPos.join(','));
          this.editHistory.push({
            type: 'removeSegment',
            object: obj,
            index: start,
            prevPos,
            prevAlpha
          });
          this.requestRender();
          e.preventDefault();
          this.maybePersistPresets();
          return;
        }
      }
      this.editHistory.push({ type: 'toggleVisible', object: obj, prevVisible: obj.visible });
      obj.visible = false;
      const key = this.getLineKey(obj);
      if (key) this.hiddenLineKeys.add(key);
      this.requestRender();
      e.preventDefault();
      this.maybePersistPresets();
    }
  };

  onEditPointerDown = (e) => {
    if (!this.labelEditMode) return;
    const pos = this.getPointerPos(e);
    this.editRaycaster.setFromCamera(this.editPointer, this.mollweideMap.camera);
    const intersects = this.editRaycaster.intersectObjects(this.editableLabels, false);
    if (intersects.length > 0) {
      const label = intersects[0].object;
      if (this.selectedLabel !== label) {
        this.selectedLabel = label;
        this.updateEditOverlay();
      }
      this.initialLabelPos = this.selectedLabel.position.clone();
      this.dragOffset.copy(pos).sub(this.selectedLabel.position);
      this.selectedLabel.userData._origColor = this.selectedLabel.material.color.clone();
      if (this.selectedLabel.userData.lineObj) {
        this.selectedLabel.userData._origLineColor = this.selectedLabel.userData.lineObj.material.color.clone();
      }
      this.selectedLabel.material.color.offsetHSL(0, 0, 0.1);
      if (this.selectedLabel.userData.lineObj) {
        this.selectedLabel.userData.lineObj.material.color.offsetHSL(0, 0, 0.1);
      }
      this.mollweideMap.canvas.classList.add('dragging');
      this.isDragging = true;
      this.requestRender();
      e.preventDefault();
    } else {
      if (this.selectedLabel) {
        this.selectedLabel = null;
        this.updateEditOverlay();
        this.requestRender();
      }
    }
  };

  onEditPointerMove = (e) => {
    if (!this.labelEditMode || !this.selectedLabel || !this.isDragging) return;
    const pos = this.getPointerPos(e);
    this.selectedLabel.position.copy(pos.clone().sub(this.dragOffset));
    if (this.selectedLabel.userData.editType === 'star' && this.selectedLabel.userData.lineObj) {
      const anchor = this.selectedLabel.userData.anchorFunc();
      this.selectedLabel.userData.lineObj.geometry.setFromPoints([anchor, this.selectedLabel.position]);
    }
    this.updateEditOverlay();
    this.requestRender();
    e.preventDefault();
  };

  onEditPointerUp = () => {
    if (!this.labelEditMode || !this.selectedLabel) return;
    const anchor = this.selectedLabel.userData.anchorFunc();
    const offsetVec = this.selectedLabel.position.clone().sub(anchor);
    if (this.selectedLabel.userData.editType === 'star') {
      this.starLabelOffsets.set(this.selectedLabel.userData.editId, { x: offsetVec.x, y: offsetVec.y });
      if (this.selectedLabel.userData.starRef) {
        this.selectedLabel.userData.starRef.mollLabelOffset = offsetVec.clone();
      }
      if (this.selectedLabel.userData.lineObj) {
        this.selectedLabel.userData.lineObj.geometry.setFromPoints([anchor, this.selectedLabel.position]);
      }
    } else if (this.selectedLabel.userData.editType === 'constellation') {
      this.constellationLabelOffsets.set(this.selectedLabel.userData.editId, { x: offsetVec.x, y: offsetVec.y });
      this.selectedLabel.userData.offset = offsetVec.clone();
    } else if (this.selectedLabel.userData.editType === 'galactic') {
      this.galacticLabelOffsets.set(this.selectedLabel.userData.editId, { x: offsetVec.x, y: offsetVec.y });
      this.selectedLabel.userData.offset = offsetVec.clone();
    }
    if (this.selectedLabel.userData._origColor) {
      this.selectedLabel.material.color.copy(this.selectedLabel.userData._origColor);
    }
    if (this.selectedLabel.userData.lineObj && this.selectedLabel.userData._origLineColor) {
      this.selectedLabel.userData.lineObj.material.color.copy(this.selectedLabel.userData._origLineColor);
    }
    this.mollweideMap.canvas.classList.remove('dragging');
    if (this.initialLabelPos) {
      const prevOffset = this.initialLabelPos.clone().sub(anchor);
      this.editHistory.push({ type: 'moveLabel', label: this.selectedLabel, prevOffset });
    }
    this.isDragging = false;
    this.updateEditOverlay();
    this.requestRender();
    this.initialLabelPos = null;
    this.maybePersistPresets();
  };

  setupLabelEditor() {
    const btn = document.getElementById('toggle-label-editor');
    if (!btn) return;
    btn.addEventListener('click', () => {
      this.labelEditMode = !this.labelEditMode;
      btn.classList.toggle('active', this.labelEditMode);
      if (this.labelEditMode) {
        this.lineEditMode = false;
        const lbtn = document.getElementById('toggle-line-editor');
        if (lbtn) lbtn.classList.remove('active');
      }
      this.mollweideMap.canvas.classList.toggle('edit-mode', this.labelEditMode || this.lineEditMode);
      if (this.labelEditMode) {
        this.registerMollweideEditableLabels();
      } else {
        this.selectedLabel = null;
        this.updateEditOverlay();
      }
      this.requestRender();
    });
    this.mollweideMap.canvas.addEventListener('pointerdown', this.onEditPointerDown);
    this.mollweideMap.canvas.addEventListener('pointermove', this.onEditPointerMove);
    window.addEventListener('pointerup', this.onEditPointerUp);
  }

  setupLineEditor() {
    const btn = document.getElementById('toggle-line-editor');
    if (!btn) return;
    btn.addEventListener('click', () => {
      this.lineEditMode = !this.lineEditMode;
      btn.classList.toggle('active', this.lineEditMode);
      if (this.lineEditMode) {
        this.labelEditMode = false;
        const lbtn = document.getElementById('toggle-label-editor');
        if (lbtn) lbtn.classList.remove('active');
        this.registerMollweideEditableLines();
        this.selectedLabel = null;
        this.updateEditOverlay();
      }
      this.mollweideMap.canvas.classList.toggle('edit-mode', this.lineEditMode || this.labelEditMode);
      this.requestRender();
    });
    this.mollweideMap.canvas.addEventListener('pointerdown', this.onLinePointerDown);
  }

  setupUndoButton() {
    const btn = document.getElementById('undo-edit');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const action = this.editHistory.pop();
      if (!action) return;
      if (action.type === 'toggleVisible') {
        action.object.visible = action.prevVisible;
      } else if (action.type === 'removeSegment') {
        const posAttr = action.object.geometry.getAttribute('position');
        const base = action.index * 3;
        action.prevPos.forEach((v, i) => {
          posAttr.array[base + i] = v;
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
          this.starLabelOffsets.set(label.userData.editId, { x: action.prevOffset.x, y: action.prevOffset.y });
          if (label.userData.starRef) label.userData.starRef.mollLabelOffset = action.prevOffset.clone();
          if (label.userData.lineObj) label.userData.lineObj.geometry.setFromPoints([anchor, newPos]);
        } else if (label.userData.editType === 'constellation') {
          this.constellationLabelOffsets.set(label.userData.editId, { x: action.prevOffset.x, y: action.prevOffset.y });
          label.userData.offset = action.prevOffset.clone();
        } else if (label.userData.editType === 'galactic') {
          this.galacticLabelOffsets.set(label.userData.editId, { x: action.prevOffset.x, y: action.prevOffset.y });
          label.userData.offset = action.prevOffset.clone();
        }
        this.updateEditOverlay();
      } else if (action.type === 'rotateLabel') {
        const label = action.label;
        label.material.rotation = action.prevRotation;
        if (label.userData.starRef) label.userData.starRef.mollLabelRotation = action.prevRotation;
        this.starLabelRotations.set(label.userData.editId, action.prevRotation);
        this.updateEditOverlay();
      } else if (action.type === 'scaleLabel') {
        const label = action.label;
        label.scale.copy(action.prevScale);
        if (label.userData.starRef) label.userData.starRef.mollLabelScale = action.prevScale.clone();
        this.starLabelScales.set(label.userData.editId, { x: action.prevScale.x, y: action.prevScale.y });
        this.updateEditOverlay();
      }
      this.requestRender();
      this.maybePersistPresets();
    });
  }

  angleDiff(a, b) {
    let diff = a - b;
    diff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
    return diff;
  }

  setupEditOverlay() {
    const container = document.querySelector('.label-container');
    if (!container) return;
    this.editOverlay = document.createElement('div');
    this.editOverlay.id = 'label-edit-overlay';
    this.rotateHandle = document.createElement('div');
    this.rotateHandle.className = 'handle rotate-handle';
    this.rotateHandle.textContent = '⟳';
    this.scaleHandle = document.createElement('div');
    this.scaleHandle.className = 'handle scale-handle';
    this.scaleHandle.textContent = '⤡';
    this.editOverlay.appendChild(this.rotateHandle);
    this.editOverlay.appendChild(this.scaleHandle);
    container.appendChild(this.editOverlay);

    this.rotateHandle.addEventListener('pointerdown', e => {
      if (!this.selectedLabel) return;
      this.isRotating = true;
      const rect = this.editOverlay.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      this.rotateStartAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
      this.rotateInitialRotation = this.selectedLabel.material.rotation || 0;
      this.rotateCurrentRotation = this.rotateInitialRotation;
      document.addEventListener('pointermove', this.onRotateMove);
      document.addEventListener('pointerup', this.onRotateUp);
      e.stopPropagation();
      e.preventDefault();
    });

    this.scaleHandle.addEventListener('pointerdown', e => {
      if (!this.selectedLabel) return;
      this.isScaling = true;
      const rect = this.editOverlay.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      this.scaleStart = { dist: Math.hypot(dx, dy), sx: this.selectedLabel.scale.x, sy: this.selectedLabel.scale.y };
      document.addEventListener('pointermove', this.onScaleMove);
      document.addEventListener('pointerup', this.onScaleUp);
      e.stopPropagation();
      e.preventDefault();
    });
  }

  onRotateMove = (e) => {
    if (!this.isRotating || !this.selectedLabel) return;
    const rect = this.editOverlay.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
    const delta = this.angleDiff(angle, this.rotateStartAngle);
    this.rotateCurrentRotation -= delta * this.ROTATE_SENSITIVITY;
    this.selectedLabel.material.rotation = this.rotateCurrentRotation;
    this.rotateStartAngle = angle;
    if (this.selectedLabel.userData.starRef) {
      this.selectedLabel.userData.starRef.mollLabelRotation = this.rotateCurrentRotation;
    }
    this.starLabelRotations.set(this.selectedLabel.userData.editId, this.rotateCurrentRotation);
    this.updateEditOverlay();
    this.requestRender();
  };

  onRotateUp = () => {
    if (!this.isRotating) return;
    document.removeEventListener('pointermove', this.onRotateMove);
    document.removeEventListener('pointerup', this.onRotateUp);
    this.editHistory.push({ type: 'rotateLabel', label: this.selectedLabel, prevRotation: this.rotateInitialRotation });
    this.isRotating = false;
    this.maybePersistPresets();
  };

  onScaleMove = (e) => {
    if (!this.isScaling || !this.selectedLabel) return;
    const rect = this.editOverlay.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const dist = Math.hypot(dx, dy);
    const ratio = dist / this.scaleStart.dist;
    const factor = 1 + (ratio - 1) * 0.5;
    const newX = this.scaleStart.sx * factor;
    const newY = this.scaleStart.sy * factor;
    this.selectedLabel.scale.set(newX, newY, 1);
    if (this.selectedLabel.userData.starRef) this.selectedLabel.userData.starRef.mollLabelScale = new THREE.Vector3(newX, newY, 1);
    this.starLabelScales.set(this.selectedLabel.userData.editId, { x: newX, y: newY });
    this.updateEditOverlay();
    this.requestRender();
  };

  onScaleUp = () => {
    if (!this.isScaling) return;
    document.removeEventListener('pointermove', this.onScaleMove);
    document.removeEventListener('pointerup', this.onScaleUp);
    this.editHistory.push({ type: 'scaleLabel', label: this.selectedLabel, prevScale: new THREE.Vector3(this.scaleStart.sx, this.scaleStart.sy, 1) });
    this.isScaling = false;
    this.maybePersistPresets();
  };

  setupAll() {
    this.setupEditOverlay();
    this.setupLabelEditor();
    this.setupLineEditor();
    this.setupUndoButton();
    this.setupEditIOControls();
  }

  setConstellationLinesMoll(constellationLinesMoll) {
    this.constellationLinesMoll = constellationLinesMoll;
  }

  setIsolationOverlay(isolationOverlay) {
    this.isolationOverlay = isolationOverlay;
  }

  getState() {
    return buildSerializableEditState(this);
  }
}
