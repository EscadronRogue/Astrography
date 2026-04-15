import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { initializeEditState } from './editState.js';
import { downloadLabelEdits, applyLabelEdits, buildSerializableEditState } from './editPersistence.js';
import { setupEditIOControls } from './editIOControls.js';
import { updateEditOverlayPosition, registerEditableLabels } from './labelEditor.js';
import { handleEditPointerDown, handleEditPointerMove, handleEditPointerUp, setupLabelEditor } from './labelDragControls.js';
import {
  getLineKey as getStoredLineKey,
  applyStoredLineEdits,
  registerEditableLines,
  handleLinePointerDown
} from './lineEditor.js';
import { undoLastEdit } from './editCommands.js';
import { setupEditOverlay, handleRotateMove, handleRotateUp, handleScaleMove, handleScaleUp } from './transformControls.js';

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

  onLinePointerDown = event => {
    handleLinePointerDown(this, event);
  };

  onEditPointerDown = event => {
    handleEditPointerDown(this, event);
  };

  onEditPointerMove = event => {
    handleEditPointerMove(this, event);
  };

  onEditPointerUp = () => {
    handleEditPointerUp(this);
  };

  setupLabelEditor() {
    setupLabelEditor(this);
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
      undoLastEdit(this);
    });
  }

  angleDiff(a, b) {
    let diff = a - b;
    diff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
    return diff;
  }

  setupEditOverlay() {
    setupEditOverlay(this);
  }

  onRotateMove = event => {
    handleRotateMove(this, event);
  };

  onRotateUp = () => {
    handleRotateUp(this);
  };

  onScaleMove = event => {
    handleScaleMove(this, event);
  };

  onScaleUp = () => {
    handleScaleUp(this);
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
