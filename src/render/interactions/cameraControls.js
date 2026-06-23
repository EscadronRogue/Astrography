import * as THREE from '../../vendor/three.js';
import { requestRenderIfAvailable } from '../../shared/renderScheduler.js';

const KEYBOARD_ROTATION_STEP = 0.08;
const KEYBOARD_PAN_STEP = 32;
const KEYBOARD_ZOOM_FACTOR = 0.88;

class BaseCameraControls {
  constructor(camera, domElement, options = {}) {
    this.camera = camera;
    this.domElement = domElement;
    this.zoomSpeed = options.zoomSpeed ?? 0.1;
    this.pinchZoomSpeed = options.pinchZoomSpeed ?? 0.005;
    this.activePointers = new Map();
    this.pinchDistance = null;
    this.previousPointerPosition = { x: 0, y: 0 };
    this.wheelListenerOptions = { passive: false };
    this.requestRender = options.requestRender || requestRenderIfAvailable;

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onWheel = this.onWheel.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);

    if (!this.domElement.hasAttribute?.('tabindex')) {
      this.domElement.setAttribute?.('tabindex', '0');
    }

    this.domElement.addEventListener('pointerdown', this.onPointerDown, false);
    this.domElement.addEventListener('pointermove', this.onPointerMove, false);
    this.domElement.addEventListener('pointerup', this.onPointerUp, false);
    this.domElement.addEventListener('pointercancel', this.onPointerUp, false);
    this.domElement.addEventListener('wheel', this.onWheel, this.wheelListenerOptions);
    this.domElement.addEventListener('keydown', this.onKeyDown, false);
  }

  onPointerDown(event) {
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY, pointerType: event.pointerType });
    this._setDragFlag(this.activePointers.size === 1);
    this.previousPointerPosition.x = event.clientX;
    this.previousPointerPosition.y = event.clientY;
    if (this.activePointers.size >= 2) this.pinchDistance = this.getPinchDistance();
    this.domElement.setPointerCapture?.(event.pointerId);
  }

  onPointerUp(event) {
    this.activePointers.delete(event.pointerId);
    this._setDragFlag(this.activePointers.size === 1);
    if (this.activePointers.size === 1) {
      const remaining = Array.from(this.activePointers.values())[0];
      this.previousPointerPosition.x = remaining.x;
      this.previousPointerPosition.y = remaining.y;
    } else {
      this.pinchDistance = null;
    }
    this.domElement.releasePointerCapture?.(event.pointerId);
  }

  getPinchDistance() {
    const pointers = Array.from(this.activePointers.values());
    if (pointers.length < 2) return null;
    const [a, b] = pointers;
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  onKeyDown(event) {
    if (this.handleKeyboardInput?.(event)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  dispose() {
    this.domElement.removeEventListener('pointerdown', this.onPointerDown, false);
    this.domElement.removeEventListener('pointermove', this.onPointerMove, false);
    this.domElement.removeEventListener('pointerup', this.onPointerUp, false);
    this.domElement.removeEventListener('pointercancel', this.onPointerUp, false);
    this.domElement.removeEventListener('wheel', this.onWheel, this.wheelListenerOptions);
    this.domElement.removeEventListener('keydown', this.onKeyDown, false);
  }
}

export class ThreeDControls extends BaseCameraControls {
  constructor(camera, domElement, options = {}) {
    super(camera, domElement, options);
    this.target = options.target || new THREE.Vector3(0, 0, 0);
    this.rotationSpeed = options.rotationSpeed ?? 0.005;
    this.touchRotationSpeed = options.touchRotationSpeed ?? this.rotationSpeed * 0.65;
    this.minDistance = options.minDistance ?? 5;
    this.maxDistance = options.maxDistance ?? 2000;
    this.isRotating = false;
  }

  rotateBy(deltaTheta, deltaPhi) {
    const offset = this.camera.position.clone().sub(this.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta += deltaTheta;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi + deltaPhi, 0.01, Math.PI - 0.01);
    offset.setFromSpherical(spherical);
    this.camera.position.copy(this.target.clone().add(offset));
    this.camera.lookAt(this.target);
    this.requestRender();
  }

  zoomByFactor(factor) {
    const offset = this.camera.position.clone().sub(this.target);
    const distance = offset.length();
    const next = THREE.MathUtils.clamp(distance * factor, this.minDistance, this.maxDistance);
    offset.setLength(next);
    this.camera.position.copy(this.target.clone().add(offset));
    this.camera.lookAt(this.target);
    this.requestRender();
  }

  _setDragFlag(value) {
    this.isRotating = value;
  }

  handleKeyboardInput(event) {
    const zoomIn = event.key === '+' || event.key === '=' || event.key === 'PageUp';
    const zoomOut = event.key === '-' || event.key === '_' || event.key === 'PageDown';
    if (zoomIn || zoomOut) {
      this.zoomByFactor(zoomIn ? KEYBOARD_ZOOM_FACTOR : 1 / KEYBOARD_ZOOM_FACTOR);
      return true;
    }

    const rotationMap = {
      ArrowLeft: [-KEYBOARD_ROTATION_STEP, 0],
      ArrowRight: [KEYBOARD_ROTATION_STEP, 0],
      ArrowUp: [0, -KEYBOARD_ROTATION_STEP],
      ArrowDown: [0, KEYBOARD_ROTATION_STEP]
    };
    const delta = rotationMap[event.key];
    if (!delta) return false;
    this.rotateBy(delta[0], delta[1]);
    return true;
  }

  onPointerMove(event) {
    if (!this.activePointers.has(event.pointerId)) return;
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY, pointerType: event.pointerType });

    if (this.activePointers.size >= 2) {
      const nextPinchDistance = this.getPinchDistance();
      if (this.pinchDistance != null && nextPinchDistance != null) {
        const delta = nextPinchDistance - this.pinchDistance;
        if (Math.abs(delta) > 0) {
          const factor = 1 - delta * this.pinchZoomSpeed;
          this.zoomByFactor(factor);
        }
      }
      this.pinchDistance = nextPinchDistance;
      return;
    }

    if (!this.isRotating) return;
    const deltaX = event.clientX - this.previousPointerPosition.x;
    const deltaY = event.clientY - this.previousPointerPosition.y;
    this.previousPointerPosition.x = event.clientX;
    this.previousPointerPosition.y = event.clientY;

    const speed = event.pointerType === 'touch' ? this.touchRotationSpeed : this.rotationSpeed;
    this.rotateBy(-deltaX * speed, -deltaY * speed);
  }

  onWheel(event) {
    event.preventDefault();
    this.zoomByFactor(1 + Math.sign(event.deltaY) * this.zoomSpeed);
  }
}

export class TwoDControls extends BaseCameraControls {
  constructor(camera, domElement, options = {}) {
    super(camera, domElement, {
      ...options,
      zoomSpeed: options.zoomSpeed ?? 0.001,
      pinchZoomSpeed: options.pinchZoomSpeed ?? 0.0035
    });
    this.panSpeed = options.panSpeed ?? 1;
    this.touchPanSpeed = options.touchPanSpeed ?? this.panSpeed * 0.65;
    this.minZoom = options.minZoom ?? 0.25;
    this.maxZoom = options.maxZoom ?? 20;
    this.isPanning = false;
  }

  panBy(deltaX, deltaY) {
    this.camera.position.x += deltaX / this.camera.zoom;
    this.camera.position.y += deltaY / this.camera.zoom;
    this.requestRender();
  }

  zoomByFactor(factor) {
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * factor, this.minZoom, this.maxZoom);
    this.camera.updateProjectionMatrix();
    this.requestRender();
  }

  _setDragFlag(value) {
    this.isPanning = value;
  }

  handleKeyboardInput(event) {
    const zoomIn = event.key === '+' || event.key === '=' || event.key === 'PageUp';
    const zoomOut = event.key === '-' || event.key === '_' || event.key === 'PageDown';
    if (zoomIn || zoomOut) {
      this.zoomByFactor(zoomIn ? 1 / KEYBOARD_ZOOM_FACTOR : KEYBOARD_ZOOM_FACTOR);
      return true;
    }

    const panMap = {
      ArrowLeft: [-KEYBOARD_PAN_STEP, 0],
      ArrowRight: [KEYBOARD_PAN_STEP, 0],
      ArrowUp: [0, KEYBOARD_PAN_STEP],
      ArrowDown: [0, -KEYBOARD_PAN_STEP]
    };
    const delta = panMap[event.key];
    if (!delta) return false;
    this.panBy(delta[0], delta[1]);
    return true;
  }

  onPointerMove(event) {
    if (!this.activePointers.has(event.pointerId)) return;
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY, pointerType: event.pointerType });

    if (this.activePointers.size >= 2) {
      const nextPinchDistance = this.getPinchDistance();
      if (this.pinchDistance != null && nextPinchDistance != null) {
        const delta = nextPinchDistance - this.pinchDistance;
        this.zoomByFactor(1 + delta * this.pinchZoomSpeed);
      }
      this.pinchDistance = nextPinchDistance;
      return;
    }

    if (!this.isPanning) return;
    const dx = event.clientX - this.previousPointerPosition.x;
    const dy = event.clientY - this.previousPointerPosition.y;
    this.previousPointerPosition.x = event.clientX;
    this.previousPointerPosition.y = event.clientY;
    const speed = event.pointerType === 'touch' ? this.touchPanSpeed : this.panSpeed;
    this.panBy(-dx * speed, dy * speed);
  }

  onWheel(event) {
    event.preventDefault();
    this.zoomByFactor(1 - event.deltaY * this.zoomSpeed);
  }
}
