import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { createConnectionLines, createWideLineMaterial, mergeConnectionLines } from '../features/connections/connectionPairs.js';
import { buildWideLineGeometry, disposeObject3D } from '../render/engine/renderUtils.js';
import { getConnectionLineParams } from '../features/connections/connectionSettings.js';
import { ThreeDControls, TwoDControls } from '../render/interactions/cameraControls.js';
import { LabelManager } from '../features/labels/labelManager.js';
import { getMollweideLambda0, setMollweideLambda0, splitMollweideWrap } from '../shared/geometryUtils.js';
import { requestRenderIfAvailable } from '../shared/renderScheduler.js';
import { createMollweideBackground, createMollweideBorder, createMollweideMask, debounce } from './mapDecorations.js';
import { hashString, mixHash } from '../shared/hashUtils.js';
import { STAR_TEXTURE_SIZE, CONNECTION_LABEL_BASE_FONT } from '../shared/constants.js';
import { getViewpointStarId } from '../shared/viewpoint.js';

function getConnectionPairKey(pair) {
  return pair?.pairKey || `${pair?.starA?.starId || 'a'}|${pair?.starB?.starId || 'b'}`;
}

function haveSameKeys(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function buildConnectionVisualSignature(connectionObjs) {
  let hash = 2166136261;
  // Include viewpoint in signature so connections rebuild on viewpoint change
  hash = mixHash(hash, hashString(getViewpointStarId() || 'sol'));
  connectionObjs.forEach(pair => {
    hash = mixHash(hash, hashString(getConnectionPairKey(pair)));
    hash = mixHash(hash, hashString(pair.starA?.displayColor || ''));
    hash = mixHash(hash, hashString(pair.starB?.displayColor || ''));
  });
  return `${connectionObjs.length}:${hash}`;
}

let _cachedBounds = null;
let _cachedBoundsLength = -1;

function getConnectionDistanceBounds(connectionObjs) {
  if (!connectionObjs.length) {
    return { largestDistance: 0, smallestDistance: 0 };
  }

  // Return cached result if connection count hasn't changed
  if (_cachedBounds && _cachedBoundsLength === connectionObjs.length) {
    return _cachedBounds;
  }

  let largest = -Infinity;
  let smallest = Infinity;
  for (let i = 0; i < connectionObjs.length; i++) {
    const d = connectionObjs[i].distance;
    if (d > largest) largest = d;
    if (d < smallest) smallest = d;
  }
  _cachedBounds = { largestDistance: largest, smallestDistance: smallest };
  _cachedBoundsLength = connectionObjs.length;
  return _cachedBounds;
}

function invalidateConnectionBoundsCache() {
  _cachedBounds = null;
  _cachedBoundsLength = -1;
}

function createStarTexture() {
  const size = STAR_TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createStarMaterial(texture, opacity, sizeAttenuation, cameraZoom) {
  return new THREE.ShaderMaterial({
    uniforms: {
      pointTexture: { value: texture },
      opacity: { value: opacity },
      cameraZoom: { value: cameraZoom ?? 1.0 }
    },
    vertexShader: `
      attribute float size;
      attribute vec3 customColor;
      varying vec3 vColor;
      uniform float cameraZoom;
      void main() {
        vColor = customColor;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * cameraZoom;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D pointTexture;
      uniform float opacity;
      varying vec3 vColor;
      void main() {
        vec4 texColor = texture2D(pointTexture, gl_PointCoord);
        if (texColor.a < 0.01) discard;
        gl_FragColor = vec4(vColor, texColor.a * opacity);
      }
    `,
    transparent: true,
    depthWrite: false,
    vertexColors: true
  });
}

export class MapManager {
  constructor({ canvasId, mapType, state, scheduleMollweideUpdate, getEditManager }) {
    this.canvas = document.getElementById(canvasId);
    this.mapType = mapType;
    this.state = state;
    this.scheduleMollweideUpdate = scheduleMollweideUpdate;
    this.getEditManager = getEditManager;
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.starOpacity = 1.0;
    this.connectionOpacity = 0.5;
    this.labelOpacity = 1.0;
    this.points = null;
    this.instancedMesh = null;
    this.connectionGroup = null;
    this.connectionPairKeys = [];
    this.connectionParamSignature = '';
    this.connectionVisualSignature = '';

    if (mapType === 'Mollweide') {
      const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
      this.frustumSize = 400;
      this.camera = new THREE.OrthographicCamera(
        (-this.frustumSize * aspect) / 2,
        (this.frustumSize * aspect) / 2,
        this.frustumSize / 2,
        -this.frustumSize / 2,
        -1000,
        1000
      );
      this.camera.position.set(0, 0, 10);
    } else {
      this.camera = new THREE.PerspectiveCamera(75, this.canvas.clientWidth / this.canvas.clientHeight, 0.1, 10000);
      this.camera.position.set(0, 0, mapType === 'TrueCoordinates' ? 70 : 200);
    }

    this.scene.add(this.camera);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const pointLight = new THREE.PointLight(0xffffff, 1);
    this.scene.add(pointLight);

    if (mapType === 'Mollweide') {
      this.controls = new TwoDControls(this.camera, this.renderer.domElement, {
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
      this.controls = new ThreeDControls(this.camera, this.renderer.domElement);
    }

    this.labelManager = new LabelManager(mapType, this.scene);
    this.labelManager.setLabelOpacity(this.labelOpacity);
    this.starGroup = new THREE.Group();
    this.scene.add(this.starGroup);
    this.debouncedResize = debounce(() => this.onResize(), 200);
    window.addEventListener('resize', this.debouncedResize, false);
  }

  addStars(stars) {
    const count = stars.length;
    if (this.mapType === 'Mollweide') {
      if (!this.points || this.points.geometry.getAttribute('position').count !== count) {
        while (this.starGroup.children.length > 0) {
          const child = this.starGroup.children[0];
          this.starGroup.remove(child);
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        }
        if (count === 0) {
          this.points = null;
          return;
        }
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('customColor', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        const texture = createStarTexture();
        const zoomVal = this.camera.isOrthographicCamera ? this.camera.zoom : 1.0;
        const material = createStarMaterial(texture, this.starOpacity, !this.camera.isOrthographicCamera, zoomVal);
        this.points = new THREE.Points(geometry, material);
        this.points.renderOrder = 4;
        this.starGroup.add(this.points);
      }
    } else {
      if (!this.instancedMesh || this.instancedMesh.count !== count) {
        while (this.starGroup.children.length > 0) {
          const child = this.starGroup.children[0];
          this.starGroup.remove(child);
          if (child.geometry) child.geometry.dispose();
          if (child.material) child.material.dispose();
        }
        if (count === 0) {
          this.instancedMesh = null;
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
        const material = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: this.starOpacity,
          vertexColors: true
        });
        this.instancedMesh = new THREE.InstancedMesh(baseGeometry, material, count);
        this.instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
        this.instancedMesh.renderOrder = 4;
        this.starGroup.add(this.instancedMesh);
      }
    }
    this.updateStarPositions(stars);
  }

  updateStarPositions(stars) {
    // Reusable objects to avoid per-star allocations
    const _color = new THREE.Color();

    if (this.mapType === 'Mollweide') {
      if (!this.points) return;
      const positions = this.points.geometry.attributes.position.array;
      const colors = this.points.geometry.attributes.customColor.array;
      const sizes = this.points.geometry.attributes.size.array;
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        const pos = star.mollweidePosition;
        positions[i * 3]     = pos ? pos.x : 0;
        positions[i * 3 + 1] = pos ? pos.y : 0;
        positions[i * 3 + 2] = pos ? pos.z : 0;
        const size = star.displaySize !== undefined ? star.displaySize : 1;
        sizes[i] = size * 0.4 * 25.0;
        _color.set(star.displayColor || '#ffffff');
        colors[i * 3]     = _color.r;
        colors[i * 3 + 1] = _color.g;
        colors[i * 3 + 2] = _color.b;
      }
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.customColor.needsUpdate = true;
      this.points.geometry.attributes.size.needsUpdate = true;
    } else {
      if (!this.instancedMesh) return;
      const dummy = new THREE.Object3D();
      const colors = this.instancedMesh.instanceColor.array;
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
        _color.set(star.displayColor || '#ffffff');
        colors[i * 3]     = _color.r;
        colors[i * 3 + 1] = _color.g;
        colors[i * 3 + 2] = _color.b;
      }
      this.instancedMesh.instanceMatrix.needsUpdate = true;
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
    this.starObjects = stars;
    requestRenderIfAvailable();
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
    invalidateConnectionBoundsCache();
  }

  storeConnectionState(connectionObjs) {
    this.connectionPairKeys = connectionObjs.map(getConnectionPairKey);
    this.connectionParamSignature = this.getConnectionParamSignature();
    this.connectionVisualSignature = buildConnectionVisualSignature(connectionObjs);
  }

  captureConnectionOpacityScales(globalOpacity) {
    if (!this.connectionGroup) return;
    const safeOpacity = globalOpacity > 0 ? globalOpacity : 1;
    this.connectionGroup.traverse(obj => {
      if (Number.isFinite(obj.userData?.connectionOpacityScale)) {
        return;
      }
      const uniformOpacity = obj.material?.uniforms?.opacityFactor?.value;
      if (Number.isFinite(uniformOpacity)) {
        obj.userData.connectionOpacityScale = uniformOpacity / safeOpacity;
        return;
      }
      if (obj.material && Number.isFinite(obj.material.opacity)) {
        obj.userData.connectionOpacityScale = obj.material.opacity / safeOpacity;
      }
    });
  }

  applyConnectionOpacity(opacity) {
    this.connectionOpacity = opacity;
    if (!this.connectionGroup) return;

    this.connectionGroup.traverse(obj => {
      const opacityScale = obj.userData?.connectionOpacityScale;
      if (!Number.isFinite(opacityScale) || !obj.material) return;

      const nextOpacity = opacityScale * opacity;
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

    this.connectionGroup = new THREE.Group();
    if (this.mapType === 'Globe') {
      createConnectionLines(stars, connectionObjs, 'Globe', opacity).forEach(line => this.connectionGroup.add(line));
    } else if (this.mapType === 'Mollweide') {
      createConnectionLines(stars, connectionObjs, 'Mollweide', opacity).forEach(line => this.connectionGroup.add(line));
    } else {
      this.connectionGroup.add(mergeConnectionLines(connectionObjs, this.mapType, opacity));
      if (this.mapType === 'TrueCoordinates') {
        this.addTCDistanceLabels(connectionObjs, opacity);
      }
    }

    this.scene.add(this.connectionGroup);
    this.storeConnectionState(connectionObjs);
    this.captureConnectionOpacityScales(opacity);

    const editManager = this.getEditManager();
    if (editManager) editManager.applyStoredLineEdits(this.connectionGroup);
    return true;
  }

  createMollweideConnectionSegment(points, color, width, opacity, opacityScale = 1) {
    const geometry = buildWideLineGeometry(points, width);
    const material = createWideLineMaterial(color);
    material.uniforms.opacityFactor.value = opacity;
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

    const blendColor = new THREE.Color(starA.displayColor || '#ffffff')
      .lerp(new THREE.Color(starB.displayColor || '#ffffff'), 0.5);
    const normDist = (distance - bounds.smallestDistance) / (bounds.largestDistance - bounds.smallestDistance || 1);
    const width = THREE.MathUtils.lerp(getConnectionLineParams().connectionMaxWidth, 1, normDist);
    const relativeOpacity = THREE.MathUtils.lerp(1.0, 0.3, normDist);
    const opacity = relativeOpacity * opacityFactor;
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
    const safeConnections = Array.isArray(connectionObjs) ? connectionObjs : [];
    const nextPairKeys = safeConnections.map(getConnectionPairKey);
    const nextParamSignature = this.getConnectionParamSignature();
    const nextVisualSignature = buildConnectionVisualSignature(safeConnections);

    if (safeConnections.length === 0) {
      this.clearConnectionGroup();
      requestRenderIfAvailable();
      return;
    }

    const canReuseLayer =
      this.connectionGroup &&
      haveSameKeys(this.connectionPairKeys, nextPairKeys) &&
      this.connectionParamSignature === nextParamSignature &&
      this.connectionVisualSignature === nextVisualSignature;

    if (!canReuseLayer) {
      if (this.rebuildConnectionLayer(stars, safeConnections, opacity)) {
        requestRenderIfAvailable();
      }
      return;
    }

    this.applyConnectionOpacity(opacity);
    requestRenderIfAvailable();
  }

  addTCDistanceLabels(connectionObjs, opacityFactor) {
    const { connectionLabelSize } = getConnectionLineParams();
    if (connectionLabelSize <= 0.01) return;
    const bounds = getConnectionDistanceBounds(connectionObjs);
    const largest = bounds.largestDistance;
    const smallest = bounds.smallestDistance;
    connectionObjs.forEach(pair => {
      const { starA, starB, distance } = pair;
      const posA = starA.truePosition || new THREE.Vector3(starA.x_coordinate, starA.y_coordinate, starA.z_coordinate);
      const posB = starB.truePosition || new THREE.Vector3(starB.x_coordinate, starB.y_coordinate, starB.z_coordinate);
      if (!posA || !posB) return;
      const normDist = (distance - smallest) / (largest - smallest || 1);
      const lineOpacityScale = THREE.MathUtils.lerp(1.0, 0.3, normDist);
      const lineOpacity = lineOpacityScale * opacityFactor;
      const mid = posA.clone().lerp(posB, 0.5);
      const distText = `${distance < 10 ? distance.toFixed(1) : distance.toFixed(0)} ly`;
      const baseFontSize = CONNECTION_LABEL_BASE_FONT;
      const fontSize = baseFontSize * connectionLabelSize;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.font = `${fontSize}px Oswald`;
      const metrics = ctx.measureText(distText);
      const padX = 10;
      canvas.width = metrics.width + padX * 2;
      canvas.height = fontSize + 10;
      ctx.font = `${fontSize}px Oswald`;
      const c1 = new THREE.Color(starA.displayColor || '#ffffff');
      const c2 = new THREE.Color(starB.displayColor || '#ffffff');
      const labelColor = c1.clone().lerp(c2, 0.5);
      ctx.fillStyle = `#${labelColor.getHexString()}`;
      ctx.textBaseline = 'middle';
      ctx.fillText(distText, padX, canvas.height / 2);
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      const spriteMat = new THREE.SpriteMaterial({
        map: texture,
        depthWrite: false,
        depthTest: true,
        transparent: true,
        opacity: lineOpacity
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.renderOrder = 5;
      const scale = 0.15;
      sprite.scale.set(canvas.width / 100 * scale, canvas.height / 100 * scale, 1);
      sprite.position.copy(mid);
      sprite.userData.connectionOpacityScale = lineOpacityScale;
      this.connectionGroup.add(sprite);
    });
  }

  updateConnectionPositions(stars, connectionObjs) {
    if (this.mapType !== 'Mollweide' || !this.connectionGroup) {
      this.updateConnections(stars, connectionObjs, this.connectionOpacity);
      requestRenderIfAvailable();
      return;
    }

    const safeConnections = Array.isArray(connectionObjs) ? connectionObjs : [];
    const nextPairKeys = safeConnections.map(getConnectionPairKey);
    const nextParamSignature = this.getConnectionParamSignature();
    const nextVisualSignature = buildConnectionVisualSignature(safeConnections);

    const canUpdateInPlace =
      safeConnections.length > 0 &&
      haveSameKeys(this.connectionPairKeys, nextPairKeys) &&
      this.connectionParamSignature === nextParamSignature &&
      this.connectionVisualSignature === nextVisualSignature;

    if (!canUpdateInPlace || !this.updateMollweideConnectionPositionsInPlace(safeConnections)) {
      this.updateConnections(stars, safeConnections, this.connectionOpacity);
      requestRenderIfAvailable();
      return;
    }

    const editManager = this.getEditManager();
    if (editManager) editManager.applyStoredLineEdits(this.connectionGroup);
    this.applyConnectionOpacity(this.connectionOpacity);
    requestRenderIfAvailable();
  }

  setStarOpacity(opacity) {
    this.starOpacity = opacity;
    if (this.mapType === 'Mollweide') {
      if (this.points) {
        this.points.material.uniforms.opacity.value = opacity;
        this.points.material.needsUpdate = true;
      }
    } else if (this.instancedMesh) {
      this.instancedMesh.material.opacity = opacity;
      this.instancedMesh.material.needsUpdate = true;
    }
  }

  setConnectionOpacity(opacity) {
    this.applyConnectionOpacity(opacity);
    requestRenderIfAvailable();
  }

  setLabelOpacity(opacity) {
    this.labelOpacity = opacity;
    this.labelManager.setLabelOpacity(opacity);
  }

  setMollweideBorderAppearance(width, opacity) {
    if (this.mapType !== 'Mollweide' || !this.mollweideBorder) return;
    const border = this.mollweideBorder;
    const sanitizedWidth = Math.max(0.1, width || 0);
    const sanitizedOpacity = Math.max(0, Math.min(1, opacity !== undefined ? opacity : border.material.opacity));
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
    requestRenderIfAvailable();
  }

  updateMap(stars, connectionObjs) {
    this.addStars(stars);
    this.updateConnections(stars, connectionObjs, this.connectionOpacity);
  }

  onResize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
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
    this.renderer.setSize(width, height);
    requestRenderIfAvailable();
  }

  render() {
    if (!this.canvas.isConnected) return;
    if (this.points && this.points.material.uniforms.cameraZoom) {
      this.points.material.uniforms.cameraZoom.value = this.camera.isOrthographicCamera ? this.camera.zoom : 1.0;
    }
    this.labelManager.render?.(this.camera);
    this.renderer.render(this.scene, this.camera);
  }
}
