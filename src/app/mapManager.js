import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { createConnectionLines, mergeConnectionLines } from '../features/connections/connectionsRenderer.js';
import { buildWideLineGeometry } from '../render/engine/renderUtils.js';
import { getConnectionLineParams } from '../features/connections/connectionSettings.js';
import { ThreeDControls, TwoDControls } from '../render/interactions/cameraControls.js';
import { LabelManager } from '../features/labels/labelManager.js';
import { getMollweideLambda0, setMollweideLambda0 } from '../shared/geometryUtils.js';
import { requestRenderIfAvailable } from '../shared/renderScheduler.js';
import { createMollweideBackground, createMollweideBorder, createMollweideMask, debounce } from './mapDecorations.js';

function createStarTexture() {
  const size = 64;
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
    if (this.mapType === 'Mollweide') {
      if (!this.points) return;
      const positions = this.points.geometry.attributes.position.array;
      const colors = this.points.geometry.attributes.customColor.array;
      const sizes = this.points.geometry.attributes.size.array;
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        const pos = this.mapType === 'TrueCoordinates'
          ? (star.truePosition ? star.truePosition.clone() : new THREE.Vector3(star.x_coordinate, star.y_coordinate, star.z_coordinate))
          : this.mapType === 'Globe'
            ? (star.spherePosition ? star.spherePosition.clone() : new THREE.Vector3(0, 0, 0))
            : (star.mollweidePosition ? star.mollweidePosition.clone() : new THREE.Vector3(0, 0, 0));
        const size = star.displaySize !== undefined ? star.displaySize : 1;
        const scale = size * (this.mapType === 'Mollweide' ? 0.4 : 0.2) * 25.0;
        positions[i * 3] = pos.x;
        positions[i * 3 + 1] = pos.y;
        positions[i * 3 + 2] = pos.z;
        sizes[i] = scale;
        const color = new THREE.Color(star.displayColor || '#ffffff');
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.customColor.needsUpdate = true;
      this.points.geometry.attributes.size.needsUpdate = true;
    } else {
      if (!this.instancedMesh) return;
      const dummy = new THREE.Object3D();
      const colors = this.instancedMesh.instanceColor.array;
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        const pos = this.mapType === 'TrueCoordinates'
          ? (star.truePosition ? star.truePosition.clone() : new THREE.Vector3(star.x_coordinate, star.y_coordinate, star.z_coordinate))
          : this.mapType === 'Globe'
            ? (star.spherePosition ? star.spherePosition.clone() : new THREE.Vector3(0, 0, 0))
            : (star.mollweidePosition ? star.mollweidePosition.clone() : new THREE.Vector3(0, 0, 0));
        const size = star.displaySize !== undefined ? star.displaySize : 1;
        const scale = size * 0.2;
        dummy.position.copy(pos);
        dummy.scale.set(scale, scale, scale);
        dummy.updateMatrix();
        this.instancedMesh.setMatrixAt(i, dummy.matrix);
        const color = new THREE.Color(star.displayColor || '#ffffff');
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }
      this.instancedMesh.instanceMatrix.needsUpdate = true;
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
    this.starObjects = stars;
    requestRenderIfAvailable();
  }

  updateConnections(stars, connectionObjs, opacity = 0.5) {
    if (this.connectionGroup) {
      this.scene.remove(this.connectionGroup);
      this.connectionGroup = null;
    }
    if (!connectionObjs || connectionObjs.length === 0) return;
    this.connectionGroup = new THREE.Group();
    if (this.mapType === 'Globe') {
      createConnectionLines(stars, connectionObjs, 'Globe', opacity).forEach(line => this.connectionGroup.add(line));
    } else if (this.mapType === 'Mollweide') {
      createConnectionLines(stars, connectionObjs, 'Mollweide', opacity).forEach(line => this.connectionGroup.add(line));
    } else {
      this.connectionGroup.add(mergeConnectionLines(connectionObjs, this.mapType, opacity));
      // Add distance labels for TrueCoordinates
      if (this.mapType === 'TrueCoordinates') {
        this.addTCDistanceLabels(connectionObjs, opacity);
      }
    }
    this.scene.add(this.connectionGroup);
    const editManager = this.getEditManager();
    if (editManager) editManager.applyStoredLineEdits(this.connectionGroup);
    requestRenderIfAvailable();
  }

  addTCDistanceLabels(connectionObjs, opacityFactor) {
    const { connectionLabelSize } = getConnectionLineParams();
    if (connectionLabelSize <= 0.01) return;
    const distances = connectionObjs.map(p => p.distance);
    const largest = Math.max(...distances);
    const smallest = Math.min(...distances);
    connectionObjs.forEach(pair => {
      const { starA, starB, distance } = pair;
      const posA = starA.truePosition || new THREE.Vector3(starA.x_coordinate, starA.y_coordinate, starA.z_coordinate);
      const posB = starB.truePosition || new THREE.Vector3(starB.x_coordinate, starB.y_coordinate, starB.z_coordinate);
      if (!posA || !posB) return;
      const normDist = (distance - smallest) / (largest - smallest || 1);
      const lineOpacity = THREE.MathUtils.lerp(1.0, 0.3, normDist) * opacityFactor;
      const mid = posA.clone().lerp(posB, 0.5);
      const distText = `${distance < 10 ? distance.toFixed(1) : distance.toFixed(0)} ly`;
      const baseFontSize = 72;
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
      this.connectionGroup.add(sprite);
    });
  }

  updateConnectionPositions(stars, connectionObjs) {
    if (!this.connectionGroup) return;
    this.updateConnections(stars, connectionObjs, this.connectionOpacity);
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
    this.connectionOpacity = opacity;
    if (this.connectionGroup) {
      this.connectionGroup.traverse(obj => {
        if (obj.material) {
          obj.material.opacity = opacity;
          obj.material.needsUpdate = true;
        }
      });
    }
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
    this.renderer.render(this.scene, this.camera);
  }
}
