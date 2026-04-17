import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { requestRenderIfAvailable } from '../../shared/renderScheduler.js';

class BaseCameraControls {
  constructor(camera, domElement, options = {}) {
    this.camera = camera;
    this.domElement = domElement;
    this.zoomSpeed = options.zoomSpeed ?? 0.1;
    this.pinchZoomSpeed = options.pinchZoomSpeed ?? 0.005;
    this.activePointers = new Map();
    this.pinchDistance = null;
    this.previousPointerPosition = { x: 0, y: 0 };

    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onWheel = this.onWheel.bind(this);

    this.domElement.addEventListener('pointerdown', this.onPointerDown, false);
    this.domElement.addEventListener('pointermove', this.onPointerMove, false);
    this.domElement.addEventListener('pointerup', this.onPointerUp, false);
    this.domElement.addEventListener('pointercancel', this.onPointerUp, false);
    this.domElement.addEventListener('wheel', this.onWheel, { passive: false });
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

  dispose() {
    this.domElement.removeEventListener('pointerdown', this.onPointerDown, false);
    this.domElement.removeEventListener('pointermove', this.onPointerMove, false);
    this.domElement.removeEventListener('pointerup', this.onPointerUp, false);
    this.domElement.removeEventListener('pointercancel', this.onPointerUp, false);
    this.domElement.removeEventListener('wheel', this.onWheel, false);
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

  _setDragFlag(value) {
    this.isRotating = value;
  }

  onPointerMove(event) {
    if (!this.activePointers.has(event.pointerId)) return;
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY, pointerType: event.pointerType });

    if (this.activePointers.size >= 2) {
      const nextPinchDistance = this.getPinchDistance();
      if (this.pinchDistance != null && nextPinchDistance != null) {
        const delta = nextPinchDistance - this.pinchDistance;
        if (Math.abs(delta) > 0) {
          const offset = this.camera.position.clone().sub(this.target);
          const distance = offset.length();
          const factor = 1 - delta * this.pinchZoomSpeed;
          const next = THREE.MathUtils.clamp(distance * factor, this.minDistance, this.maxDistance);
          offset.setLength(next);
          this.camera.position.copy(this.target.clone().add(offset));
          this.camera.lookAt(this.target);
          requestRenderIfAvailable();
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
    const offset = this.camera.position.clone().sub(this.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta -= deltaX * speed;
    spherical.phi -= deltaY * speed;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0.01, Math.PI - 0.01);
    offset.setFromSpherical(spherical);
    this.camera.position.copy(this.target.clone().add(offset));
    this.camera.lookAt(this.target);
    requestRenderIfAvailable();
  }

  onWheel(event) {
    event.preventDefault();
    const offset = this.camera.position.clone().sub(this.target);
    const distance = offset.length();
    const next = THREE.MathUtils.clamp(distance * (1 + Math.sign(event.deltaY) * this.zoomSpeed), this.minDistance, this.maxDistance);
    offset.setLength(next);
    this.camera.position.copy(this.target.clone().add(offset));
    this.camera.lookAt(this.target);
    requestRenderIfAvailable();
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

  _setDragFlag(value) {
    this.isPanning = value;
  }

  onPointerMove(event) {
    if (!this.activePointers.has(event.pointerId)) return;
    this.activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY, pointerType: event.pointerType });

    if (this.activePointers.size >= 2) {
      const nextPinchDistance = this.getPinchDistance();
      if (this.pinchDistance != null && nextPinchDistance != null) {
        const delta = nextPinchDistance - this.pinchDistance;
        const zoomFactor = 1 + delta * this.pinchZoomSpeed;
        this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * zoomFactor, this.minZoom, this.maxZoom);
        this.camera.updateProjectionMatrix();
        requestRenderIfAvailable();
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
    this.camera.position.x -= dx * speed / this.camera.zoom;
    this.camera.position.y += dy * speed / this.camera.zoom;
    requestRenderIfAvailable();
  }

  onWheel(event) {
    event.preventDefault();
    const nextZoom = THREE.MathUtils.clamp(this.camera.zoom * (1 - event.deltaY * this.zoomSpeed), this.minZoom, this.maxZoom);
    this.camera.zoom = nextZoom;
    this.camera.updateProjectionMatrix();
    requestRenderIfAvailable();
  }
}
