import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { createConnectionLines, mergeConnectionLines } from '../filters/connectionsFilter.js';
import { buildWideLineGeometry } from '../utils/renderUtils.js';
import { ThreeDControls, TwoDControls } from '../cameraControls.js';
import { LabelManager } from '../labelManager.js';
import { cachedRadToSphere, setMollweideLambda0, getMollweideLambda0 } from '../utils/geometryUtils.js';
import { requestRenderIfAvailable } from '../shared/renderScheduler.js';

function debounce(func, wait) {
  let timeout;
  return function debounced(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

export function createGlobeGrid(R = 100, options = {}) {
  const gridGroup = new THREE.Group();
  const gridColor = options.color || 0x444444;
  const lineOpacity = options.opacity !== undefined ? options.opacity : 0.2;
  const lineWidth = options.lineWidth || 1;
  const material = new THREE.LineBasicMaterial({
    color: gridColor,
    transparent: true,
    opacity: lineOpacity,
    linewidth: lineWidth
  });
  for (let raDeg = 0; raDeg < 360; raDeg += 30) {
    const ra = THREE.MathUtils.degToRad(raDeg);
    const points = [];
    for (let decDeg = -80; decDeg <= 80; decDeg += 2) {
      const dec = THREE.MathUtils.degToRad(decDeg);
      points.push(cachedRadToSphere(ra, dec, R));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material);
    gridGroup.add(line);
  }
  for (let decDeg = -60; decDeg <= 60; decDeg += 30) {
    const dec = THREE.MathUtils.degToRad(decDeg);
    const points = [];
    const segments = 64;
    for (let i = 0; i <= segments; i++) {
      const ra = (i / segments) * 2 * Math.PI;
      points.push(cachedRadToSphere(ra, dec, R));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const line = new THREE.Line(geometry, material);
    gridGroup.add(line);
  }
  return gridGroup;
}

function createMollweideBackground(R = 100, segments = 1024) {
  const geometry = new THREE.CircleGeometry(R, segments);
  geometry.scale(2, 1, 1);
  const material = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 0;
  return mesh;
}

function createMollweideBorder(R = 100, thickness = 1, opacity = 1, segments = 1024) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(2 * R * Math.cos(theta), R * Math.sin(theta), 0));
  }
  const geometry = buildWideLineGeometry(points, thickness);
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 6;
  mesh.frustumCulled = false;
  mesh.userData = {
    baseWidth: thickness,
    baseOpacity: opacity,
    points
  };
  return mesh;
}

function createMollweideMask(R = 100, segments = 1024) {
  const worldW = 4 * R;
  const worldH = 2 * R;
  const planeGeom = new THREE.PlaneGeometry(worldW, worldH);
  const canvas = document.createElement('canvas');
  const texW = 2048;
  const texH = 1024;
  canvas.width = texW;
  canvas.height = texH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  ctx.clearRect(0, 0, texW, texH);
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, texW, texH);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const px = texW / 2 + Math.cos(t) * texW / 2;
    const py = texH / 2 + Math.sin(t) * texH / 2;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';

  const alphaTex = new THREE.CanvasTexture(canvas);
  alphaTex.minFilter = THREE.LinearFilter;
  alphaTex.magFilter = THREE.LinearFilter;
  alphaTex.wrapS = THREE.ClampToEdgeWrapping;
  alphaTex.wrapT = THREE.ClampToEdgeWrapping;
  const planeMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    alphaMap: alphaTex,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    opacity: 1,
    side: THREE.DoubleSide
  });
  const mask = new THREE.Mesh(planeGeom, planeMat);
  mask.position.set(0, 0, 0.001);
  mask.renderOrder = 1;
  return mask;
}

function createStarTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.4)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function createStarMaterial(texture, opacity, sizeAttenuation, cameraZoom) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: texture },
      opacity: { value: opacity },
      sizeAttenuation: { value: sizeAttenuation ? 1.0 : 0.0 },
      cameraZoom: { value: cameraZoom }
    },
    vertexShader: `
      attribute float size;
      attribute vec3 customColor;
      varying vec3 vColor;
      uniform float sizeAttenuation;
      uniform float cameraZoom;
      void main() {
        vColor = customColor;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float s = size;
        if (sizeAttenuation > 0.5) {
          s *= 300.0 / -mvPosition.z;
        } else {
          s *= cameraZoom;
        }
        gl_PointSize = s;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform float opacity;
      varying vec3 vColor;
      void main() {
        vec4 tex = texture2D(map, gl_PointCoord);
        vec3 col = vColor * tex.a;
        gl_FragColor = vec4(col, tex.a * opacity);
        if (gl_FragColor.a < 0.01) discard;
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}

export class MapManager {
  constructor({ canvasId, mapType, onMollweidePan, onMollweideIsolationPan, applyStoredLineEdits }) {
    this.canvas = document.getElementById(canvasId);
    this.mapType = mapType;
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 1);
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.starOpacity = 1.0;
    this.connectionOpacity = 0.5;
    this.labelOpacity = 1.0;
    this.points = null;
    this.instancedMesh = null;
    this.applyStoredLineEdits = applyStoredLineEdits;

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
      if (mapType === 'TrueCoordinates') {
        this.camera.position.set(0, 0, 70);
      } else {
        this.camera.position.set(0, 0, 200);
      }
    }

    this.scene.add(this.camera);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const pointLight = new THREE.PointLight(0xffffff, 1);
    this.scene.add(pointLight);

    if (mapType === 'Mollweide') {
      this.controls = new TwoDControls(this.camera, this.renderer.domElement, {
        rightCallback: (dx) => {
          let lambda0 = getMollweideLambda0() - dx * 0.002;
          const twoPi = Math.PI * 2;
          lambda0 = ((lambda0 % twoPi) + twoPi) % twoPi;
          setMollweideLambda0(lambda0);
          onMollweidePan?.();
        },
        leftCallback: () => {
          onMollweideIsolationPan?.();
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
          child.geometry?.dispose?.();
          child.material?.dispose?.();
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
          child.geometry?.dispose?.();
          child.material?.dispose?.();
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
        let pos;
        if (this.mapType === 'TrueCoordinates') {
          pos = star.truePosition ? star.truePosition.clone() : new THREE.Vector3(star.x_coordinate, star.y_coordinate, star.z_coordinate);
        } else if (this.mapType === 'Globe') {
          pos = star.spherePosition ? star.spherePosition.clone() : new THREE.Vector3(0, 0, 0);
        } else {
          pos = star.mollweidePosition ? star.mollweidePosition.clone() : new THREE.Vector3(0, 0, 0);
        }
        const size = star.displaySize !== undefined ? star.displaySize : 1;
        const baseScale = this.mapType === 'Mollweide' ? 0.4 : 0.2;
        const scale = size * baseScale * 25.0;
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
        let pos;
        if (this.mapType === 'TrueCoordinates') {
          pos = star.truePosition ? star.truePosition.clone() : new THREE.Vector3(star.x_coordinate, star.y_coordinate, star.z_coordinate);
        } else if (this.mapType === 'Globe') {
          pos = star.spherePosition ? star.spherePosition.clone() : new THREE.Vector3(0, 0, 0);
        } else {
          pos = star.mollweidePosition ? star.mollweidePosition.clone() : new THREE.Vector3(0, 0, 0);
        }
        const size = star.displaySize !== undefined ? star.displaySize : 1;
        const baseScale = 0.2;
        const scale = size * baseScale;
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
    }
    this.scene.add(this.connectionGroup);
    this.applyStoredLineEdits?.(this.connectionGroup);
    requestRenderIfAvailable();
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
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (this.camera.isOrthographicCamera) {
      const aspect = w / h;
      this.camera.left = (-this.frustumSize * aspect) / 2;
      this.camera.right = (this.frustumSize * aspect) / 2;
      this.camera.top = this.frustumSize / 2;
      this.camera.bottom = -this.frustumSize / 2;
    } else {
      this.camera.aspect = w / h;
    }
    this.camera.updateProjectionMatrix();
    if (this.points?.material.uniforms.cameraZoom) {
      const zoomVal = this.camera.isOrthographicCamera ? this.camera.zoom : 1.0;
      this.points.material.uniforms.cameraZoom.value = zoomVal;
    }
    this.renderer.setSize(w, h);
    requestRenderIfAvailable();
  }

  render() {
    if (!this.canvas.isConnected) return;
    if (this.points?.material.uniforms.cameraZoom) {
      const zoomVal = this.camera.isOrthographicCamera ? this.camera.zoom : 1.0;
      this.points.material.uniforms.cameraZoom.value = zoomVal;
    }
    this.renderer.render(this.scene, this.camera);
  }
}
