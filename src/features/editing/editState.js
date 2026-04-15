import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';

export function initializeEditState(manager) {
  manager.labelEditMode = false;
  manager.starLabelOffsets = new Map();
  manager.starLabelRotations = new Map();
  manager.starLabelScales = new Map();
  manager.constellationLabelOffsets = new Map();
  manager.galacticLabelOffsets = new Map();
  manager.editableLabels = [];
  manager.selectedLabel = null;
  manager.dragOffset = new THREE.Vector3();
  manager.editPointer = new THREE.Vector2();
  manager.editRaycaster = new THREE.Raycaster();
  manager.editPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);

  manager.lineEditMode = false;
  manager.editableLines = [];
  manager.editHistory = [];
  manager.initialLabelPos = null;
  manager.editOverlay = null;
  manager.rotateHandle = null;
  manager.scaleHandle = null;
  manager.isDragging = false;
  manager.isRotating = false;
  manager.isScaling = false;
  manager.rotateStartAngle = 0;
  manager.rotateInitialRotation = 0;
  manager.rotateCurrentRotation = 0;
  manager.scaleStart = null;

  manager.removedLineSegments = new Set();
  manager.hiddenLineKeys = new Set();

  manager.ROTATE_SENSITIVITY = 0.3;
  manager.isolationOverlay = null;
}
