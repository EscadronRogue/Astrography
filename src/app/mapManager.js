import * as THREE from '../vendor/three.js';
import { createConnectionLines, createWideLineMaterial, mergeConnectionLines } from '../features/connections/connectionPairs.js';
import { buildWideLineGeometry, clearObject3DChildren, disposeObject3D } from '../render/engine/renderUtils.js';
import { getConnectionLineParams } from '../features/connections/connectionSettings.js';
import { ThreeDControls, TwoDControls } from '../render/interactions/cameraControls.js';
import { LabelManager } from '../features/labels/labelManager.js';
import { getMollweideLambda0, setMollweideLambda0, splitMollweideWrap } from '../shared/geometryUtils.js';
import { requestRenderIfAvailable } from '../shared/renderScheduler.js';
import { createMollweideBackground, createMollweideBorder, createMollweideMask, debounce } from './mapDecorations.js';
import { createInstancedStarMaterial, createStarMaterial, createStarTexture } from './mapStarMaterials.js';
import { addTrueCoordinateDistanceLabels } from './mapConnectionLabels.js';
import { getViewpointStarId } from '../shared/viewpoint.js';
import { configureRendererForCanvas } from '../shared/canvasSizing.js';
import { clamp01, normalizeHexColor, writeUnitRgb } from '../shared/colorParsing.js';
import { addWebGLContextLossHandlers, assertWebGLAvailable } from '../shared/webglSupport.js';
import {
  buildConnectionVisualSignature,
  getConnectionDistanceBounds,
  getConnectionPairKey,
  haveSameKeys,
  resetConnectionDistanceBoundsCache
} from '../features/connections/connectionRenderState.js';

export class MapManager {
  constructor({ canvasId, mapType, state, scheduleMollweideUpdate, getEditManager }) {
    this.canvas = document.getElementById(canvasId);
    this.mapType = mapType;
    this.state = state;
    this.scheduleMollweideUpdate = scheduleMollweideUpdate;
    this.getEditManager = getEditManager;
    this.scene = new THREE.Scene();
    assertWebGLAvailable();
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true
    });
    const initialSize = configureRendererForCanvas(this.renderer, this.canvas);
    const initialAspect = initialSize.width / initialSize.height;
    this.starOpacity = 1.0;
    this.connectionOpacity = 0.5;
    this.labelOpacity = 1.0;
    this.points = null;
    this.instancedMesh = null;
    this.connectionGroup = null;
    this.connectionPairKeys = [];
    this.connectionParamSignature = '';
    this.connectionVisualSignature = '';
    this.connectionObjects = [];
    this.renderDirty = true;

    if (mapType === 'Mollweide') {
      this.frustumSize = 400;
      this.camera = new THREE.OrthographicCamera(
        (-this.frustumSize * initialAspect) / 2,
        (this.frustumSize * initialAspect) / 2,
        this.frustumSize / 2,
        -this.frustumSize / 2,
        -1000,
        1000
      );
      this.camera.position.set(0, 0, 10);
    } else {
      this.camera = new THREE.PerspectiveCamera(75, initialAspect, 0.1, 10000);
      this.camera.position.set(0, 0, mapType === 'TrueCoordinates' ? 70 : 200);
    }

    this.scene.add(this.camera);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const pointLight = new THREE.PointLight(0xffffff, 1);
    this.scene.add(pointLight);

    if (mapType === 'Mollweide') {
      this.controls = new TwoDControls(this.camera, this.renderer.domElement, {
        requestRender: () => requestRenderIfAvailable(this),
        rightCallback: dx => {
          let lambda0 = getMollweideLambda0() - dx * 0.002;
          const twoPi = Math.PI * 2;
          lambda0 = ((lambda0 % twoPi) + twoPi) % twoPi;
          setMollweideLambda0(lambda0);
          this.scheduleMollweideUpdate();
        },
        leftCallback: () => {
          if (this.state.enableIsolationFilterFlag && this.state.isolationOverlay && typeof this.state.isolationOverlay.refreshMollweide === 'function') {
            this.state.isolationOverlay.refreshMollweide();
          }
        },
        panCameraLeft: true,
        panCameraRight: false
      });
      this.scene.add(createMollweideBackground(100));
      this.scene.add(createMollweideMask(100));
      this.mollweideBorder = createMollweideBorder(100);
      this.scene.add(this.mollweideBorder);
    } else {
      this.controls = new ThreeDControls(this.camera, this.renderer.domElement, {
        requestRender: () => requestRenderIfAvailable(this)
      });
    }

    this.labelManager = new LabelManager(mapType, this.scene);
    this.labelManager.setLabelOpacity(this.labelOpacity);
    this.starGroup = new THREE.Group();
    this.scene.add(this.starGroup);
    this.debouncedResize = debounce(() => this.onResize(), 200);
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
    this.points = null;
    this.instancedMesh = null;
  }

  addStars(stars) {
    const count = stars.length;
    if (this.mapType === 'Mollweide') {
      if (!this.points || this.points.geometry.getAttribute('position').count !== count) {
        this.clearStarGroup();
        if (count === 0) {
          return;
        }
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        const opacities = new Float32Array(count);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('customColor', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('customOpacity', new THREE.BufferAttribute(opacities, 1));
        const texture = createStarTexture();
        const zoomVal = this.camera.isOrthographicCamera ? this.camera.zoom : 1.0;
        const material = createStarMaterial(texture, this.starOpacity, !this.camera.isOrthographicCamera, zoomVal);
        this.points = new THREE.Points(geometry, material);
        this.points.renderOrder = 4;
        this.starGroup.add(this.points);
      }
    } else {
      if (!this.instancedMesh || this.instancedMesh.count !== count) {
        this.clearStarGroup();
        if (count === 0) {
          return;
        }
        const baseGeometry = new THREE.SphereGeometry(1, 12, 12);
        const vertexCount = baseGeometry.attributes.position.count;
        const dummyColors = new Float32Array(vertexCount * 3);
        for (let i = 0; i < vertexCount; i++) {
          dummyColors[i * 3] = 1;
          dummyColors[i * 3 + 1] = 1;
          dummyColors[i * 3 + 2] = 1;
        }
        baseGeometry.setAttribute('color', new THREE.BufferAttribute(dummyColors, 3));
        const material = createInstancedStarMaterial(this.starOpacity);
        baseGeometry.setAttribute('instanceOpacity', new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
        this.instancedMesh = new THREE.InstancedMesh(baseGeometry, material, count);
        this.instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
        this.instancedMesh.renderOrder = 4;
        this.starGroup.add(this.instancedMesh);
      }
    }
    this.updateStarPositions(stars);
  }

  updateStarPositions(stars) {
    if (this.mapType === 'Mollweide') {
      if (!this.points) return;
      const positions = this.points.geometry.attributes.position.array;
      const colors = this.points.geometry.attributes.customColor.array;
      const sizes = this.points.geometry.attributes.size.array;
      const opacities = this.points.geometry.attributes.customOpacity.array;
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        const pos = star.mollweidePosition;
        positions[i * 3]     = pos ? pos.x : 0;
        positions[i * 3 + 1] = pos ? pos.y : 0;
        positions[i * 3 + 2] = pos ? pos.z : 0;
        const size = star.displaySize !== undefined ? star.displaySize : 1;
        sizes[i] = size * 0.4 * 25.0;
        opacities[i] = Number.isFinite(star.displayOpacity) ? clamp01(star.displayOpacity) : 1;
        writeUnitRgb(colors, i * 3, star.displayColor, '#ffffff');
      }
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.customColor.needsUpdate = true;
      this.points.geometry.attributes.size.needsUpdate = true;
      this.points.geometry.attributes.customOpacity.needsUpdate = true;
    } else {
      if (!this.instancedMesh) return;
      const dummy = new THREE.Object3D();
      const colors = this.instancedMesh.instanceColor.array;
      const instanceOpacity = this.instancedMesh.geometry.getAttribute('instanceOpacity');
      const opacities = instanceOpacity?.array;
      const isTrueCoordinates = this.mapType === 'TrueCoordinates';
      const isGlobe = this.mapType === 'Globe';
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        let pos;
        if (isTrueCoordinates) {
          pos = star.truePosition;
          if (!pos) {
            dummy.position.set(star.x_coordinate, star.y_coordinate, star.z_coordinate);
          } else {
            dummy.position.copy(pos);
          }
        } else if (isGlobe) {
          pos = star.spherePosition;
          if (pos) { dummy.position.copy(pos); } else { dummy.position.set(0, 0, 0); }
        } else {
          pos = star.mollweidePosition;
          if (pos) { dummy.position.copy(pos); } else { dummy.position.set(0, 0, 0); }
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
    }
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
      if (Number.isFinite(obj.userData?.connectionOpacityScale)) {
        return;
      }
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
    } else if (this.mapType === 'Mollweide') {
      createConnectionLines(stars, connectionObjs, 'Mollweide', safeOpacity).forEach(line => this.connectionGroup.add(line));
    } else {
      this.connectionGroup.add(mergeConnectionLines(connectionObjs, this.mapType, safeOpacity));
      if (this.mapType === 'TrueCoordinates') {
        addTrueCoordinateDistanceLabels(this.connectionGroup, connectionObjs, safeOpacity);
      }
    }

    this.scene.add(this.connectionGroup);
    this.storeConnectionState(connectionObjs);
    this.captureConnectionOpacityScales(safeOpacity);

    const editManager = this.getEditManager();
    if (editManager) editManager.applyStoredLineEdits(this.connectionGroup);
    return true;
  }

  createMollweideConnectionSegment(points, color, width, opacity, opacityScale = 1) {
    const geometry = buildWideLineGeometry(points, width);
    const material = createWideLineMaterial(color);
    material.uniforms.opacityFactor.value = clamp01(opacity);
    material.uniforms.fadePower.value = getConnectionLineParams().connectionFadePower;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 3;
    mesh.userData = {
      baseWidth: width,
      points,
      isMollweideConnectionSegment: true,
      connectionOpacityScale: opacityScale
    };
    return mesh;
  }

  updateMollweideConnectionGroup(group, pair, bounds, opacityFactor) {
    const { starA, starB, distance } = pair;
    if (!starA?.mollweidePosition || !starB?.mollweidePosition) {
      group.visible = false;
      return;
    }

    const blendColor = new THREE.Color(normalizeHexColor(starA.displayColor, '#ffffff'))
      .lerp(new THREE.Color(normalizeHexColor(starB.displayColor, '#ffffff')), 0.5);
    const normDist = (distance - bounds.smallestDistance) / (bounds.largestDistance - bounds.smallestDistance || 1);
    const width = THREE.MathUtils.lerp(getConnectionLineParams().connectionMaxWidth, 1, normDist);
    const relativeOpacity = THREE.MathUtils.lerp(1.0, 0.3, normDist);
    const opacity = clamp01(relativeOpacity * opacityFactor);
    const segments = splitMollweideWrap(starA.mollweidePosition, starB.mollweidePosition);

    const segmentMeshes = group.children.filter(child => child.userData?.isMollweideConnectionSegment);
    if (segmentMeshes.length !== segments.length) {
      segmentMeshes.forEach(mesh => {
        group.remove(mesh);
        disposeObject3D(mesh);
      });
      segments.forEach(([start, end]) => {
        group.add(this.createMollweideConnectionSegment([start, end], blendColor, width, opacity, relativeOpacity));
      });
    } else {
      segmentMeshes.forEach((mesh, index) => {
        const points = segments[index];
        mesh.geometry.dispose();
        mesh.geometry = buildWideLineGeometry(points, width);
        mesh.material.uniforms.color.value.copy(blendColor);
        mesh.material.uniforms.opacityFactor.value = opacity;
        mesh.material.uniforms.fadePower.value = getConnectionLineParams().connectionFadePower;
        mesh.userData.baseWidth = width;
        mesh.userData.points = points;
      });
    }

    const segmentChildren = group.children.filter(child => child.userData?.isMollweideConnectionSegment);
    segmentChildren.forEach(mesh => {
      mesh.userData.connectionOpacityScale = relativeOpacity;
    });

    let totalLength = 0;
    const segmentLengths = segments.map(([start, end]) => {
      const length = start.distanceTo(end);
      totalLength += length;
      return length;
    });
    let midpoint = segments[0]?.[0]?.clone() || new THREE.Vector3();
    let tangent = new THREE.Vector3(1, 0, 0);
    const halfway = totalLength / 2;
    let traversed = 0;
    for (let index = 0; index < segments.length; index++) {
      const [start, end] = segments[index];
      const length = segmentLengths[index];
      if (traversed + length >= halfway) {
        const t = (halfway - traversed) / (length || 1);
        midpoint = start.clone().lerp(end, t);
        tangent = end.clone().sub(start);
        break;
      }
      traversed += length;
    }

    let rotation = Math.atan2(tangent.y, tangent.x);
    if (rotation > Math.PI / 2) rotation -= Math.PI;
    if (rotation < -Math.PI / 2) rotation += Math.PI;

    const labelSprite = group.children.find(child => child.userData?.isConnectionLabel);
    if (labelSprite) {
      labelSprite.position.copy(midpoint);
      labelSprite.material.rotation = rotation;
      labelSprite.material.opacity = opacity;
      labelSprite.material.needsUpdate = true;
      labelSprite.userData.connectionOpacityScale = relativeOpacity;
    }

    group.visible = true;
  }

  updateMollweideConnectionPositionsInPlace(connectionObjs) {
    if (!this.connectionGroup || this.connectionGroup.children.length !== connectionObjs.length) {
      return false;
    }

    const bounds = getConnectionDistanceBounds(connectionObjs);
    for (let index = 0; index < connectionObjs.length; index++) {
      const pair = connectionObjs[index];
      const group = this.connectionGroup.children[index];
      if (!(group instanceof THREE.Group) || group.userData?.pairKey !== getConnectionPairKey(pair)) {
        return false;
      }
      this.updateMollweideConnectionGroup(group, pair, bounds, this.connectionOpacity);
    }
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
    if (this.mapType !== 'Mollweide' || !this.connectionGroup) {
      this.updateConnections(stars, connectionObjs, this.connectionOpacity);
      requestRenderIfAvailable(this);
      return;
    }

    const safeConnections = Array.isArray(connectionObjs) ? connectionObjs : [];
    this.connectionObjects = safeConnections;
    const nextPairKeys = safeConnections.map(getConnectionPairKey);
    const nextParamSignature = this.getConnectionParamSignature();
    const nextVisualSignature = buildConnectionVisualSignature(safeConnections, getViewpointStarId());

    const canUpdateInPlace =
      safeConnections.length > 0 &&
      haveSameKeys(this.connectionPairKeys, nextPairKeys) &&
      this.connectionParamSignature === nextParamSignature &&
      this.connectionVisualSignature === nextVisualSignature;

    if (!canUpdateInPlace || !this.updateMollweideConnectionPositionsInPlace(safeConnections)) {
      this.updateConnections(stars, safeConnections, this.connectionOpacity);
      requestRenderIfAvailable(this);
      return;
    }

    const editManager = this.getEditManager();
    if (editManager) editManager.applyStoredLineEdits(this.connectionGroup);
    this.applyConnectionOpacity(this.connectionOpacity);
    requestRenderIfAvailable(this);
  }

  setStarOpacity(opacity) {
    const safeOpacity = clamp01(opacity);
    this.starOpacity = safeOpacity;
    if (this.mapType === 'Mollweide') {
      if (this.points) {
        this.points.material.uniforms.opacity.value = safeOpacity;
        this.points.material.needsUpdate = true;
      }
    } else if (this.instancedMesh) {
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

  setMollweideBorderAppearance(width, opacity) {
    if (this.mapType !== 'Mollweide' || !this.mollweideBorder) return;
    const border = this.mollweideBorder;
    const sanitizedWidth = Math.max(0.1, width || 0);
    const sanitizedOpacity = clamp01(opacity !== undefined ? opacity : border.material.opacity);
    if (Math.abs((border.userData.baseWidth || 0) - sanitizedWidth) > 1e-4) {
      border.geometry.dispose();
      border.geometry = buildWideLineGeometry(border.userData.points, sanitizedWidth);
      border.userData.baseWidth = sanitizedWidth;
      if (border.material) border.material.needsUpdate = true;
    }
    if (border.material && border.material.opacity !== sanitizedOpacity) {
      border.material.opacity = sanitizedOpacity;
      border.material.needsUpdate = true;
    }
    border.userData.baseOpacity = sanitizedOpacity;
    requestRenderIfAvailable(this);
  }

  updateMap(stars, connectionObjs) {
    this.addStars(stars);
    this.updateConnections(stars, connectionObjs, this.connectionOpacity);
  }

  onResize() {
    const { width, height } = configureRendererForCanvas(this.renderer, this.canvas);
    if (this.camera.isOrthographicCamera) {
      const aspect = width / height;
      this.camera.left = (-this.frustumSize * aspect) / 2;
      this.camera.right = (this.frustumSize * aspect) / 2;
      this.camera.top = this.frustumSize / 2;
      this.camera.bottom = -this.frustumSize / 2;
    } else {
      this.camera.aspect = width / height;
    }
    this.camera.updateProjectionMatrix();
    if (this.points && this.points.material.uniforms.cameraZoom) {
      this.points.material.uniforms.cameraZoom.value = this.camera.isOrthographicCamera ? this.camera.zoom : 1.0;
    }
    requestRenderIfAvailable(this);
  }

  render() {
    if (!this.canvas.isConnected) return;
    if (this.points && this.points.material.uniforms.cameraZoom) {
      this.points.material.uniforms.cameraZoom.value = this.camera.isOrthographicCamera ? this.camera.zoom : 1.0;
    }
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
