import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { requestRenderIfAvailable } from './shared/renderScheduler.js';

export class ThreeDControls {
  constructor(camera, domElement, options = {}) {
    this.camera = camera;
    this.domElement = domElement;
    this.target = options.target || new THREE.Vector3(0, 0, 0);
    this.rotationSpeed = options.rotationSpeed ?? 0.005;
    this.zoomSpeed = options.zoomSpeed ?? 0.1;
    this.minDistance = options.minDistance ?? 5;
    this.maxDistance = options.maxDistance ?? 2000;
    this.isRotating = false;
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
    this.isRotating = true;
    this.previousPointerPosition.x = event.clientX;
    this.previousPointerPosition.y = event.clientY;
    this.domElement.setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event) {
    if (!this.isRotating) return;
    const deltaX = event.clientX - this.previousPointerPosition.x;
    const deltaY = event.clientY - this.previousPointerPosition.y;
    this.previousPointerPosition.x = event.clientX;
    this.previousPointerPosition.y = event.clientY;

    const offset = this.camera.position.clone().sub(this.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta -= deltaX * this.rotationSpeed;
    spherical.phi -= deltaY * this.rotationSpeed;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi, 0.01, Math.PI - 0.01);
    offset.setFromSpherical(spherical);
    this.camera.position.copy(this.target.clone().add(offset));
    this.camera.lookAt(this.target);
    requestRenderIfAvailable();
  }

  onPointerUp(event) {
    this.isRotating = false;
    this.domElement.releasePointerCapture?.(event.pointerId);
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

  dispose() {
    this.domElement.removeEventListener('pointerdown', this.onPointerDown, false);
    this.domElement.removeEventListener('pointermove', this.onPointerMove, false);
    this.domElement.removeEventListener('pointerup', this.onPointerUp, false);
    this.domElement.removeEventListener('pointercancel', this.onPointerUp, false);
    this.domElement.removeEventListener('wheel', this.onWheel, false);
  }
}

export class TwoDControls {
  constructor(camera, domElement, options = {}) {
    this.camera = camera;
    this.domElement = domElement;
    this.panSpeed = options.panSpeed ?? 1;
    this.zoomSpeed = options.zoomSpeed ?? 0.001;
    this.minZoom = options.minZoom ?? 0.25;
    this.maxZoom = options.maxZoom ?? 20;
    this.isPanning = false;
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
    this.isPanning = true;
    this.previousPointerPosition.x = event.clientX;
    this.previousPointerPosition.y = event.clientY;
    this.domElement.setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event) {
    if (!this.isPanning) return;
    const dx = event.clientX - this.previousPointerPosition.x;
    const dy = event.clientY - this.previousPointerPosition.y;
    this.previousPointerPosition.x = event.clientX;
    this.previousPointerPosition.y = event.clientY;
    this.camera.position.x -= dx * this.panSpeed / this.camera.zoom;
    this.camera.position.y += dy * this.panSpeed / this.camera.zoom;
    requestRenderIfAvailable();
  }

  onPointerUp(event) {
    this.isPanning = false;
    this.domElement.releasePointerCapture?.(event.pointerId);
  }

  onWheel(event) {
    event.preventDefault();
    const nextZoom = THREE.MathUtils.clamp(this.camera.zoom * (1 - event.deltaY * this.zoomSpeed), this.minZoom, this.maxZoom);
    this.camera.zoom = nextZoom;
    this.camera.updateProjectionMatrix();
    requestRenderIfAvailable();
  }

  dispose() {
    this.domElement.removeEventListener('pointerdown', this.onPointerDown, false);
    this.domElement.removeEventListener('pointermove', this.onPointerMove, false);
    this.domElement.removeEventListener('pointerup', this.onPointerUp, false);
    this.domElement.removeEventListener('pointercancel', this.onPointerUp, false);
    this.domElement.removeEventListener('wheel', this.onWheel, false);
  }
}
