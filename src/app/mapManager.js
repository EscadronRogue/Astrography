import * as THREE from '../vendor/three.js';
import { createConnectionLines, mergeConnectionLines } from '../features/connections/connectionPairs.js';
import { clearObject3DChildren, disposeObject3D } from '../render/engine/renderUtils.js';
import { getConnectionLineParams } from '../features/connections/connectionSettings.js';
import { ThreeDControls } from '../render/interactions/cameraControls.js';
import { LabelManager } from '../features/labels/labelManager.js';
import { requestRenderIfAvailable } from '../shared/renderScheduler.js';
import { createInstancedStarMaterial } from './mapStarMaterials.js';
import { addTrueCoordinateDistanceLabels } from './mapConnectionLabels.js';
import { getViewpointStarId } from '../shared/viewpoint.js';
import { configureRendererForCanvas } from '../shared/canvasSizing.js';
import { clamp01, writeUnitRgb } from '../shared/colorParsing.js';
import { addWebGLContextLossHandlers, assertWebGLAvailable } from '../shared/webglSupport.js';
import {
  buildConnectionVisualSignature,
  getConnectionPairKey,
  haveSameKeys,
  resetConnectionDistanceBoundsCache
} from '../features/connections/connectionRenderState.js';

export class MapManager {
  constructor({ canvasId, mapType, state }) {
    this.canvas = document.getElementById(canvasId);
    this.mapType = mapType;
    this.state = state;
    this.scene = new THREE.Scene();
    assertWebGLAvailable();
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true
    });
    this.renderer.setClearColor(0x070a12, 1);

    const initialSize = configureRendererForCanvas(this.renderer, this.canvas);
    const initialAspect = initialSize.width / initialSize.height;
    this.starOpacity = 1.0;
    this.connectionOpacity = 0.5;
    this.labelOpacity = 1.0;
    this.instancedMesh = null;
    this.connectionGroup = null;
    this.connectionPairKeys = [];
    this.connectionParamSignature = '';
    this.connectionVisualSignature = '';
    this.connectionObjects = [];
    this.starObjects = [];
    this.renderDirty = true;

    this.camera = new THREE.PerspectiveCamera(72, initialAspect, 0.1, 10000);
    this.camera.position.set(0, 0, mapType === 'TrueCoordinates' ? 70 : 220);
    this.scene.add(this.camera);

    this.scene.add(new THREE.AmbientLight(0xffffff, mapType === 'Globe' ? 0.72 : 0.5));
    const pointLight = new THREE.PointLight(0xffffff, mapType === 'Globe' ? 0.8 : 1);
    pointLight.position.set(140, 160, 220);
    this.scene.add(pointLight);

    this.controls = new ThreeDControls(this.camera, this.renderer.domElement, {
      requestRender: () => requestRenderIfAvailable(this),
      minDistance: mapType === 'Globe' ? 115 : 5,
      maxDistance: mapType === 'Globe' ? 700 : 2000,
      target: new THREE.Vector3(0, 0, 0)
    });

    this.labelManager = new LabelManager(mapType, this.scene);
    this.labelManager.setLabelOpacity(this.labelOpacity);
    this.starGroup = new THREE.Group();
    this.scene.add(this.starGroup);
    this.debouncedResize = () => this.onResize();
    window.addEventListener('resize', this.debouncedResize, false);
    this.webglContextDisposer = addWebGLContextLossHandlers(this.canvas, {
      onLost: () => {
        this.renderDirty = false;
      },
      onRestored: () => {
        this.renderDirty = true;
        requestRenderIfAvailable(this);
      }
    });
  }

  clearStarGroup() {
    clearObject3DChildren(this.starGroup);
    this.instancedMesh = null;
  }

  addStars(stars) {
    const count = stars.length;
    if (!this.instancedMesh || this.instancedMesh.count !== count) {
      this.clearStarGroup();
      if (count === 0) {
        this.starObjects = [];
        return;
      }
      const baseGeometry = new THREE.SphereGeometry(1, 12, 12);
      const vertexCount = baseGeometry.attributes.position.count;
      const dummyColors = new Float32Array(vertexCount * 3);
      for (let i = 0; i < vertexCount; i += 1) {
        dummyColors[i * 3] = 1;
        dummyColors[i * 3 + 1] = 1;
        dummyColors[i * 3 + 2] = 1;
      }
      baseGeometry.setAttribute('color', new THREE.BufferAttribute(dummyColors, 3));
      baseGeometry.setAttribute('instanceOpacity', new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
      this.instancedMesh = new THREE.InstancedMesh(baseGeometry, createInstancedStarMaterial(this.starOpacity), count);
      this.instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
      this.instancedMesh.renderOrder = 4;
      this.starGroup.add(this.instancedMesh);
    }
    this.updateStarPositions(stars);
  }

  updateStarPositions(stars) {
    if (!this.instancedMesh) return;

    const dummy = new THREE.Object3D();
    const colors = this.instancedMesh.instanceColor.array;
    const instanceOpacity = this.instancedMesh.geometry.getAttribute('instanceOpacity');
    const opacities = instanceOpacity?.array;
    const isTrueCoordinates = this.mapType === 'TrueCoordinates';

    for (let i = 0; i < stars.length; i += 1) {
      const star = stars[i];
      if (isTrueCoordinates) {
        const pos = star.truePosition;
        if (pos) {
          dummy.position.copy(pos);
        } else {
          dummy.position.set(star.x_coordinate, star.y_coordinate, star.z_coordinate);
        }
      } else {
        const pos = star.spherePosition;
        if (pos) dummy.position.copy(pos);
        else dummy.position.set(0, 0, 0);
      }

      const size = star.displaySize !== undefined ? star.displaySize : 1;
      const scale = size * 0.2;
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, dummy.matrix);
      if (opacities) opacities[i] = Number.isFinite(star.displayOpacity) ? clamp01(star.displayOpacity) : 1;
      writeUnitRgb(colors, i * 3, star.displayColor, '#ffffff');
    }

    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.instancedMesh.instanceColor.needsUpdate = true;
    if (instanceOpacity) instanceOpacity.needsUpdate = true;
    this.starObjects = stars;
    requestRenderIfAvailable(this);
  }

  getConnectionParamSignature() {
    const { connectionMaxWidth, connectionFadePower, connectionLabelSize } = getConnectionLineParams();
    return `${connectionMaxWidth}|${connectionFadePower}|${connectionLabelSize}`;
  }

  clearConnectionGroup() {
    if (!this.connectionGroup) return;
    this.scene.remove(this.connectionGroup);
    disposeObject3D(this.connectionGroup);
    this.connectionGroup = null;
    this.connectionPairKeys = [];
    this.connectionParamSignature = '';
    this.connectionVisualSignature = '';
    this.connectionObjects = [];
    resetConnectionDistanceBoundsCache();
  }

  storeConnectionState(connectionObjs) {
    this.connectionPairKeys = connectionObjs.map(getConnectionPairKey);
    this.connectionParamSignature = this.getConnectionParamSignature();
    this.connectionVisualSignature = buildConnectionVisualSignature(connectionObjs, getViewpointStarId());
  }

  captureConnectionOpacityScales(globalOpacity) {
    if (!this.connectionGroup) return;
    const safeOpacity = clamp01(globalOpacity);
    const opacityDivisor = safeOpacity > 0 ? safeOpacity : 1;
    this.connectionGroup.traverse(obj => {
      if (Number.isFinite(obj.userData?.connectionOpacityScale)) return;
      const uniformOpacity = obj.material?.uniforms?.opacityFactor?.value;
      if (Number.isFinite(uniformOpacity)) {
        obj.userData.connectionOpacityScale = uniformOpacity / opacityDivisor;
        return;
      }
      if (obj.material && Number.isFinite(obj.material.opacity)) {
        obj.userData.connectionOpacityScale = obj.material.opacity / opacityDivisor;
      }
    });
  }

  applyConnectionOpacity(opacity) {
    const safeOpacity = clamp01(opacity);
    this.connectionOpacity = safeOpacity;
    if (!this.connectionGroup) return;

    this.connectionGroup.traverse(obj => {
      const opacityScale = obj.userData?.connectionOpacityScale;
      if (!Number.isFinite(opacityScale) || !obj.material) return;

      const nextOpacity = clamp01(opacityScale * safeOpacity);
      if (obj.material.uniforms?.opacityFactor) {
        obj.material.uniforms.opacityFactor.value = nextOpacity;
        obj.material.needsUpdate = true;
      } else if (obj.material.opacity !== undefined) {
        obj.material.opacity = nextOpacity;
        obj.material.needsUpdate = true;
      }
    });
  }

  rebuildConnectionLayer(stars, connectionObjs, opacity) {
    this.clearConnectionGroup();
    if (!connectionObjs || connectionObjs.length === 0) return false;
    const safeOpacity = clamp01(opacity);

    this.connectionGroup = new THREE.Group();
    if (this.mapType === 'Globe') {
      createConnectionLines(stars, connectionObjs, 'Globe', safeOpacity).forEach(line => this.connectionGroup.add(line));
    } else {
      this.connectionGroup.add(mergeConnectionLines(connectionObjs, this.mapType, safeOpacity));
      if (this.mapType === 'TrueCoordinates') {
        addTrueCoordinateDistanceLabels(this.connectionGroup, connectionObjs, safeOpacity);
      }
    }

    this.scene.add(this.connectionGroup);
    this.storeConnectionState(connectionObjs);
    this.captureConnectionOpacityScales(safeOpacity);
    return true;
  }

  updateConnections(stars, connectionObjs, opacity = 0.5) {
    const safeOpacity = clamp01(opacity);
    const safeConnections = Array.isArray(connectionObjs) ? connectionObjs : [];
    this.connectionObjects = safeConnections;
    const nextPairKeys = safeConnections.map(getConnectionPairKey);
    const nextParamSignature = this.getConnectionParamSignature();
    const nextVisualSignature = buildConnectionVisualSignature(safeConnections, getViewpointStarId());

    if (safeConnections.length === 0) {
      this.clearConnectionGroup();
      requestRenderIfAvailable(this);
      return;
    }

    const canReuseLayer =
      this.connectionGroup &&
      haveSameKeys(this.connectionPairKeys, nextPairKeys) &&
      this.connectionParamSignature === nextParamSignature &&
      this.connectionVisualSignature === nextVisualSignature;

    if (!canReuseLayer) {
      if (this.rebuildConnectionLayer(stars, safeConnections, safeOpacity)) {
        requestRenderIfAvailable(this);
      }
      return;
    }

    this.applyConnectionOpacity(safeOpacity);
    requestRenderIfAvailable(this);
  }

  updateConnectionPositions(stars, connectionObjs) {
    this.updateConnections(stars, connectionObjs, this.connectionOpacity);
  }

  setStarOpacity(opacity) {
    const safeOpacity = clamp01(opacity);
    this.starOpacity = safeOpacity;
    if (this.instancedMesh) {
      if (this.instancedMesh.material.uniforms?.opacity) {
        this.instancedMesh.material.uniforms.opacity.value = safeOpacity;
      }
      this.instancedMesh.material.needsUpdate = true;
    }
  }

  setConnectionOpacity(opacity) {
    this.applyConnectionOpacity(opacity);
    requestRenderIfAvailable(this);
  }

  setLabelOpacity(opacity) {
    const safeOpacity = clamp01(opacity);
    this.labelOpacity = safeOpacity;
    this.labelManager.setLabelOpacity(safeOpacity);
  }

  updateMap(stars, connectionObjs) {
    this.addStars(stars);
    this.updateConnections(stars, connectionObjs, this.connectionOpacity);
  }

  onResize() {
    const { width, height } = configureRendererForCanvas(this.renderer, this.canvas);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    requestRenderIfAvailable(this);
  }

  render() {
    if (!this.canvas.isConnected) return;
    this.labelManager.render?.(this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this.debouncedResize, false);
    this.starInteractionDisposer?.();
    this.controls?.dispose?.();
    this.labelManager?.removeAllLabels?.();
    this.clearConnectionGroup();
    this.webglContextDisposer?.();

    if (this.starGroup) {
      this.scene.remove(this.starGroup);
      disposeObject3D(this.starGroup);
      this.starGroup = null;
    }

    this.scene.children.slice().forEach(child => {
      this.scene.remove(child);
      disposeObject3D(child);
    });

    this.renderer.dispose();
  }
}
