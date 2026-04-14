// script.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { setupFilterUI } from './filters/index.js';
import { createConnectionLines, mergeConnectionLines } from './filters/connectionsFilter.js';
import { buildWideLineGeometry, disposeObject3D } from './utils/renderUtils.js';
import { rebuildConstellationMeshFromSegments } from './filters/constellationFilter.js';
import { ThreeDControls, TwoDControls } from './cameraControls.js';
import { LabelManager } from './labelManager.js';
import { cachedRadToSphere, cachedRadToMollweide, degToRad, setMollweideLambda0, getMollweideLambda0 } from './utils/geometryUtils.js';
import { minimalRADifference } from './utils.js';
import { initFilterUI } from './ui/filterUI.js';
import { loadStarData } from './app/starData.js';
import { maybeSavePresets, savePresets, loadPresets, clearSavedPresets } from './app/presets.js';
import { GLOBE_RADIUS, MOLLWEIDE_ELLIPSE_SEGMENTS, STAR_TEXTURE_SIZE } from './shared/constants.js';
import { getStarId as getSharedStarId, getStarTruePosition as getSharedStarTruePosition, getStarGlobePosition, getStarMollweidePosition, precalcMollweideData as precalcSharedMollweideData } from './shared/starUtils.js';
import { buildAndApplyFilters as runFilterPipeline, updateMollweideView as refreshMollweideMap } from './script/filterPipeline.js';
import { initStarInteractions } from './script/starInteractions.js';
import { setRenderRequester, requestRenderIfAvailable } from './shared/renderScheduler.js';

const state = {
  cachedStars: null,
  currentFilteredStars: [],
  currentConnections: [],
  currentGlobeFilteredStars: [],
  currentGlobeConnections: [],
  currentMollweideFilteredStars: [],
  currentMollweideConnections: [],
  selectedStarData: null,
  selectedHighlightTrue: null,
  selectedHighlightGlobe: null,
  selectedHighlightMollweide: null,
  constellationLinesGlobe: [],
  constellationLabelsGlobe: [],
  constellationOverlayGlobe: [],
  constellationLinesMoll: [],
  constellationLabelsMoll: [],
  constellationOverlayMoll: [],
  globeSurfaceSphere: null,
  isolationOverlay: null,
  densityOverlay: null,
  cloudDensityOverlays: [],
  galacticPlaneTrue: null,
  eclipticPlaneTrue: null,
  celestialEquatorTrue: null,
  galacticPlaneGlobe: null,
  eclipticPlaneGlobe: null,
  celestialEquatorGlobe: null,
  galacticPlaneMoll: null,
  eclipticPlaneMoll: null,
  celestialEquatorMoll: null,
  galacticDirectionLabelsTrue: [],
  galacticDirectionLabelsGlobe: [],
  galacticDirectionLabelsMoll: [],
  showConstellationBoundariesFlag: false,
  showConstellationNamesFlag: false,
  showConstellationOverlayFlag: false,
  enableIsolationFilterFlag: false,
  enableDensityFilterFlag: false,
  showCloudsFlag: false,
  showCloudDensityFlag: false,
  showGalacticPlaneFlag: false,
  showEclipticPlaneFlag: false,
  showCelestialEquatorFlag: false
};

let trueCoordinatesMap;
let globeMap;
let mollweideMap;

// --- Label Editing ---
let labelEditMode = false;
const starLabelOffsets = new Map();
const starLabelRotations = new Map();
const starLabelScales = new Map();
const constellationLabelOffsets = new Map();
const galacticLabelOffsets = new Map();
let editableLabels = [];
let selectedLabel = null;
const dragOffset = new THREE.Vector3();
const editPointer = new THREE.Vector2();
const editRaycaster = new THREE.Raycaster();
const editPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
let lineEditMode = false;
let editableLines = [];
const editHistory = [];
let initialLabelPos = null;
let editOverlay = null;
let rotateHandle = null;
let scaleHandle = null;
let isDragging = false;
let isRotating = false;
let isScaling = false;
let rotateStartAngle = 0;
let rotateInitialRotation = 0;
let rotateCurrentRotation = 0;
let scaleStart = null;

const removedLineSegments = new Set();
const hiddenLineKeys = new Set();

// --- Export Selection ---
let exportSelectMode = false;
let exportOverlay = null;
let exportRectElem = null;
let exportPngBtn = null;
let exportPdfBtn = null;
let exportStart = null;
let exportCurrentRect = null;
let isSelecting = false;

const ROTATE_SENSITIVITY = 0.3;

const appContext = {
  state,
  getMaps: () => ({ trueCoordinatesMap, globeMap, mollweideMap }),
  getStarTruePosition,
  projectStarGlobe,
  projectStarMollweide,
  precalcMollweideData,
  updateMollweidePosition,
  applyGlobeSurface,
  requestRender: () => requestRender(),
  editManager: {
    registerMollweideEditableLabels: () => registerMollweideEditableLabels(),
    applyStoredLineEdits: root => applyStoredLineEdits(root)
  }
};

async function buildAndApplyFilters() {
  return runFilterPipeline(appContext);
}

async function updateMollweideView() {
  return refreshMollweideMap(appContext);
}

function persistPresets() {
  savePresets({
    starLabelOffsets,
    starLabelRotations,
    starLabelScales,
    constellationLabelOffsets,
    galacticLabelOffsets,
    removedLineSegments,
    hiddenLineKeys
  });
}

function maybePersistPresets() {
  maybeSavePresets(persistPresets);
}

function angleDiff(a, b) {
  let diff = a - b;
  diff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
  return diff;
}

function getStarId(star) {
  return getSharedStarId(star);
}

function getStarTruePosition(star) {
  return getSharedStarTruePosition(star);
}

function projectStarGlobe(star) {
  return getStarGlobePosition(star);
}

function projectStarMollweide(star) {
  return getStarMollweidePosition(star);
}

function precalcMollweideData(star) {
  return precalcSharedMollweideData(star);
}

function updateMollweidePosition(star) {
  const lambda = minimalRADifference(star.raRad - getMollweideLambda0());
  if (!star.mollweidePosition) star.mollweidePosition = new THREE.Vector3();
  star.mollweidePosition.set(star.mollXFactor * lambda, star.mollY, 0);
}

function createGlobeGrid(R = GLOBE_RADIUS, options = {}) {
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

function createMollweideBackground(R = GLOBE_RADIUS, segments = MOLLWEIDE_ELLIPSE_SEGMENTS) {
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

function createMollweideBorder(R = GLOBE_RADIUS, thickness = 1, opacity = 1, segments = MOLLWEIDE_ELLIPSE_SEGMENTS) {
  const clampedThickness = Math.max(0.1, thickness);
  const clampedOpacity = Math.max(0, Math.min(1, opacity));
  const pts = [];
  let prev = null;
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * 2 * Math.PI;
    const p = new THREE.Vector3(2 * R * Math.cos(theta), R * Math.sin(theta), 0);
    if (prev) {
      pts.push(prev, p);
    }
    prev = p;
  }
  const geometry = buildWideLineGeometry(pts, clampedThickness);
  const material = new THREE.MeshBasicMaterial({
    color: 0xbbbbbb,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    opacity: clampedOpacity
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 1001;
  mesh.userData = {
    baseWidth: clampedThickness,
    points: pts,
    exportLineWidthFactor: 1,
    baseRadius: R,
    segments,
    isMollweideBorder: true,
    baseColor: 0xbbbbbb,
    exportColor: 0x888888,
    baseOpacity: clampedOpacity,
    exportOpacityFactor: 1
  };
  return mesh;
}

function createMollweideMask(R = GLOBE_RADIUS, segments = MOLLWEIDE_ELLIPSE_SEGMENTS) {
  const outer = 1000;
  const shape = new THREE.Shape();
  shape.moveTo(-outer / 2, -outer / 2);
  shape.lineTo(outer / 2, -outer / 2);
  shape.lineTo(outer / 2, outer / 2);
  shape.lineTo(-outer / 2, outer / 2);
  shape.lineTo(-outer / 2, -outer / 2);

  const hole = new THREE.Path();
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * 2 * Math.PI;
    const x = 2 * R * Math.cos(theta);
    const y = R * Math.sin(theta);
    if (i === 0) hole.moveTo(x, y);
    else hole.lineTo(x, y);
  }
  hole.closePath();
  shape.holes.push(hole);
  const geom = new THREE.ShapeGeometry(shape);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    transparent: true // ensure mask renders with transparent objects
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.renderOrder = 1000;
  return mesh;
}

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => { func.apply(this, args); }, wait);
  };
}

let pendingMollweideUpdate = false;
function scheduleMollweideUpdate() {
  if (!pendingMollweideUpdate) {
    pendingMollweideUpdate = true;
    requestAnimationFrame(() => {
      pendingMollweideUpdate = false;
      updateMollweideView();
    });
  }
}





function applyGlobeSurface(isOpaque) {
  if (state.globeSurfaceSphere) {
    globeMap.scene.remove(state.globeSurfaceSphere);
    state.globeSurfaceSphere.geometry?.dispose?.();
    state.globeSurfaceSphere.material?.dispose?.();
    state.globeSurfaceSphere = null;
  }
  if (isOpaque) {
    const geom = new THREE.SphereGeometry(GLOBE_RADIUS - 1, 32, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.FrontSide,
      depthWrite: true,
      depthTest: true,
      transparent: false
    });
    state.globeSurfaceSphere = new THREE.Mesh(geom, mat);
    state.globeSurfaceSphere.renderOrder = 0;
    state.globeSurfaceSphere.frustumCulled = false;
    globeMap.scene.add(state.globeSurfaceSphere);
  }
}

function createStarTexture() {
  const size = STAR_TEXTURE_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2
  );
  // Create a bright, opaque core that quickly fades outward so stars look like
  // they have a luminous center with radiating light.
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

class MapManager {
  constructor({ canvasId, mapType }) {
    this.canvas = document.getElementById(canvasId);
    this.mapType = mapType;
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
      // Use a larger frustum so the entire Mollweide projection fits on screen
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
      this.camera = new THREE.PerspectiveCamera(
        75,
        this.canvas.clientWidth / this.canvas.clientHeight,
        0.1,
        10000
      );
      if (mapType === 'TrueCoordinates') {
        this.camera.position.set(0, 0, 70);
      } else {
        this.camera.position.set(0, 0, 200);
      }
    }
    this.scene.add(this.camera);
    const amb = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(amb);
    const pt = new THREE.PointLight(0xffffff, 1);
    this.scene.add(pt);
    if (mapType === 'Mollweide') {
      this.controls = new TwoDControls(this.camera, this.renderer.domElement, {
        rightCallback: (dx) => {
          let lambda0 = getMollweideLambda0() - dx * 0.002;
          const twoPi = Math.PI * 2;
          lambda0 = ((lambda0 % twoPi) + twoPi) % twoPi;
          setMollweideLambda0(lambda0);
          scheduleMollweideUpdate();
        },
        leftCallback: () => {
          if (state.enableIsolationFilterFlag && state.isolationOverlay &&
              typeof state.isolationOverlay.refreshMollweide === 'function') {
            state.isolationOverlay.refreshMollweide();
          }
        },
        panCameraLeft: true,
        panCameraRight: false
      });
      const background = createMollweideBackground(100);
      this.scene.add(background);
      const mask = createMollweideMask(100);
      this.scene.add(mask);
      const border = createMollweideBorder(100);
      this.mollweideBorder = border;
      this.scene.add(border);
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
        const material = createStarMaterial(
          texture,
          this.starOpacity,
          !this.camera.isOrthographicCamera,
          zoomVal
        );
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
      const linesArray = createConnectionLines(stars, connectionObjs, 'Globe', opacity);
      linesArray.forEach(line => this.connectionGroup.add(line));
    } else if (this.mapType === 'Mollweide') {
      const linesArray = createConnectionLines(stars, connectionObjs, 'Mollweide', opacity);
      linesArray.forEach(line => this.connectionGroup.add(line));
    } else {
      const merged = mergeConnectionLines(connectionObjs, this.mapType, opacity);
      this.connectionGroup.add(merged);
    }
    this.scene.add(this.connectionGroup);
    applyStoredLineEdits(this.connectionGroup);
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
      if (border.material) {
        border.material.needsUpdate = true;
      }
    }
    if (border.material) {
      if (border.material.opacity !== sanitizedOpacity) {
        border.material.opacity = sanitizedOpacity;
        border.material.needsUpdate = true;
      }
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
    if (this.points && this.points.material.uniforms.cameraZoom) {
      const zoomVal = this.camera.isOrthographicCamera ? this.camera.zoom : 1.0;
      this.points.material.uniforms.cameraZoom.value = zoomVal;
    }
    this.renderer.setSize(w, h);
    requestRenderIfAvailable();
  }

  render() {
    if (!this.canvas.isConnected) return;
    if (this.points && this.points.material.uniforms.cameraZoom) {
      const zoomVal = this.camera.isOrthographicCamera ? this.camera.zoom : 1.0;
      this.points.material.uniforms.cameraZoom.value = zoomVal;
    }
    this.renderer.render(this.scene, this.camera);
  }
}

const mapManagers = [];
let renderRequested = false;
function requestRender() {
  if (!renderRequested) {
    renderRequested = true;
    requestAnimationFrame(() => {
      renderRequested = false;
      mapManagers.forEach(m => m.render());
      updateEditOverlay();
    });
  }
}
setRenderRequester(requestRender);

function setupMapProjectionToggles() {
  const mapsSection = document.querySelector('.maps-section');
  const trueContainer = document.getElementById('map3D').parentElement;
  const globeContainer = document.getElementById('sphereMap').parentElement;
  const mollContainer = document.getElementById('mollweideMap').parentElement;
  [trueContainer, globeContainer, mollContainer].forEach(c => c.remove());

  function handle(id, container, manager) {
    const cb = document.getElementById(id);
    if (!cb) return;
    function update() {
      if (cb.checked) {
        mapsSection.appendChild(container);
        manager.onResize();
      } else if (container.isConnected) {
        container.remove();
      }
      requestRender();
    }
    cb.addEventListener('change', () => {
      update();
      maybePersistPresets();
    });
    update();
  }

  handle('map-true', trueContainer, trueCoordinatesMap);
  handle('map-globe', globeContainer, globeMap);
  handle('map-mollweide', mollContainer, mollweideMap);
}




function scaleMollweideSceneForExport(scale) {
  if (mollweideMap.points && mollweideMap.points.material.uniforms.cameraZoom) {
    mollweideMap.points.material.uniforms.cameraZoom.value *= scale;
  }
  mollweideMap.scene.traverse(obj => {
    if (obj.userData && obj.userData.baseWidth && obj.userData.points) {
      let width = obj.userData.baseWidth;
      if (obj.userData.exportLineWidthFactor) width *= obj.userData.exportLineWidthFactor;
      obj.geometry.dispose();
      if (obj.userData.isMollweideBorder) {
        const R = obj.userData.baseRadius || 100;
        const segments = obj.userData.segments || 1024;
        const pts = [];
        let prev = null;
        const offsetR = R + width / 2;
        for (let i = 0; i <= segments; i++) {
          const theta = (i / segments) * 2 * Math.PI;
          const p = new THREE.Vector3(2 * offsetR * Math.cos(theta), offsetR * Math.sin(theta), 0);
          if (prev) {
            pts.push(prev, p);
          }
          prev = p;
        }
        obj.geometry = buildWideLineGeometry(pts, width);
      } else {
        obj.geometry = buildWideLineGeometry(obj.userData.points, width);
      }
      if (obj.userData.exportColor !== undefined && obj.material && obj.material.color) {
        obj.material.color.setHex(obj.userData.exportColor);
      }
      if (obj.userData.baseOpacity !== undefined && obj.material) {
        const opFactor = obj.userData.exportOpacityFactor || 1;
        obj.material.opacity = Math.min(1, obj.userData.baseOpacity * opFactor);
      }
    } else if (obj.userData && obj.userData.baseLineWidth !== undefined && obj.material && obj.material.linewidth !== undefined) {
      let lwFactor = scale;
      if (obj.userData.exportLineWidthFactor) lwFactor *= obj.userData.exportLineWidthFactor;
      obj.material.linewidth = obj.userData.baseLineWidth * lwFactor;
      if (obj.userData.baseOpacity !== undefined) {
        const opFactor = obj.userData.exportOpacityFactor || 1;
        obj.material.opacity = Math.min(1, obj.userData.baseOpacity * opFactor);
      }
    }
  });
}

function restoreMollweideScene(scale) {
  if (mollweideMap.points && mollweideMap.points.material.uniforms.cameraZoom) {
    mollweideMap.points.material.uniforms.cameraZoom.value /= scale;
  }
  mollweideMap.scene.traverse(obj => {
    if (obj.userData && obj.userData.baseWidth && obj.userData.points) {
      obj.geometry.dispose();
      obj.geometry = buildWideLineGeometry(obj.userData.points, obj.userData.baseWidth);
      if (obj.userData.baseColor !== undefined && obj.material && obj.material.color) {
        obj.material.color.setHex(obj.userData.baseColor);
      }
      if (obj.userData.baseOpacity !== undefined && obj.material) {
        obj.material.opacity = obj.userData.baseOpacity;
      }
    } else if (obj.userData && obj.userData.baseLineWidth !== undefined && obj.material && obj.material.linewidth !== undefined) {
      obj.material.linewidth = obj.userData.baseLineWidth;
      if (obj.userData.baseOpacity !== undefined) obj.material.opacity = obj.userData.baseOpacity;
    }
  });
}

function exportMollweideMap(format = 'png', rect = null) {
  const baseWidth = mollweideMap.renderer.domElement.width;
  const baseHeight = mollweideMap.renderer.domElement.height;
  const scale = Math.max(1, 7680 / baseWidth, 4320 / baseHeight);
  scaleMollweideSceneForExport(scale);
  const exportWidth = Math.round(baseWidth * scale);
  const exportHeight = Math.round(baseHeight * scale);
  const exportRenderer = new THREE.WebGLRenderer({ antialias: true });
  exportRenderer.setPixelRatio(1);
  let cropX = 0;
  let cropY = 0;
  let cropW = baseWidth;
  let cropH = baseHeight;
  if (rect) {
    const scaleX = baseWidth / mollweideMap.canvas.clientWidth;
    const scaleY = baseHeight / mollweideMap.canvas.clientHeight;
    cropX = Math.round(rect.x * scaleX);
    cropY = Math.round(rect.y * scaleY);
    cropW = Math.round(rect.width * scaleX);
    cropH = Math.round(rect.height * scaleY);
  }
  const exportCropW = Math.round(cropW * scale);
  const exportCropH = Math.round(cropH * scale);
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = exportCropW;
  finalCanvas.height = exportCropH;
  const ctx = finalCanvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  const maxSize = exportRenderer.capabilities.maxTextureSize;
  const tile = Math.min(Math.floor(maxSize / scale), 8192);
  for (let y = cropY; y < cropY + cropH; y += tile) {
    for (let x = cropX; x < cropX + cropW; x += tile) {
      const tileW = Math.min(tile, cropW - (x - cropX));
      const tileH = Math.min(tile, cropH - (y - cropY));
      const tileWScaled = Math.round(tileW * scale);
      const tileHScaled = Math.round(tileH * scale);
      exportRenderer.setSize(tileWScaled, tileHScaled, false);
      const cam = mollweideMap.camera.clone();
      const aspect = baseWidth / baseHeight;
      cam.left = (-mollweideMap.frustumSize * aspect) / 2;
      cam.right = (mollweideMap.frustumSize * aspect) / 2;
      cam.top = mollweideMap.frustumSize / 2;
      cam.bottom = -mollweideMap.frustumSize / 2;
      cam.updateProjectionMatrix();
      cam.setViewOffset(
        exportWidth,
        exportHeight,
        Math.round(x * scale),
        Math.round(y * scale),
        tileWScaled,
        tileHScaled
      );
      exportRenderer.render(mollweideMap.scene, cam);
      cam.clearViewOffset();
      ctx.drawImage(
        exportRenderer.domElement,
        Math.round((x - cropX) * scale),
        Math.round((y - cropY) * scale),
        tileWScaled,
        tileHScaled
      );
    }
  }
  restoreMollweideScene(scale);
  exportRenderer.dispose();
  if (format === 'pdf') {
    const imgData = finalCanvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
      orientation: exportCropW >= exportCropH ? 'landscape' : 'portrait',
      unit: 'px',
      format: [exportCropW, exportCropH]
    });
    pdf.addImage(imgData, 'PNG', 0, 0, exportCropW, exportCropH);
    pdf.save('mollweide_map.pdf');
  } else {
    finalCanvas.toBlob(b => {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(b);
      link.download = 'mollweide_map.png';
      link.click();
      URL.revokeObjectURL(link.href);
    }, 'image/png');
  }
}

function exitExportSelection() {
  exportSelectMode = false;
  if (exportOverlay) exportOverlay.style.display = 'none';
  if (exportRectElem) {
    exportRectElem.style.display = 'none';
    exportRectElem.style.width = '0px';
    exportRectElem.style.height = '0px';
  }
  if (exportPngBtn) exportPngBtn.style.display = 'none';
  if (exportPdfBtn) exportPdfBtn.style.display = 'none';
  const btn = document.getElementById('export-mollweide');
  if (btn) btn.classList.remove('active');
  exportCurrentRect = null;
  isSelecting = false;
}

function getCanvasPos(event) {
  const rect = mollweideMap.canvas.getBoundingClientRect();
  const x = Math.min(Math.max(event.clientX, rect.left), rect.right) - rect.left;
  const y = Math.min(Math.max(event.clientY, rect.top), rect.bottom) - rect.top;
  return { x, y, rect };
}

function onExportPointerDown(e) {
  if (!exportSelectMode) return;
  if (e.target !== exportOverlay) return;
  const pos = getCanvasPos(e);
  exportStart = { x: pos.x, y: pos.y };
  exportCurrentRect = { x: pos.x, y: pos.y, width: 0, height: 0 };
  exportRectElem.style.display = 'block';
  exportRectElem.style.left = `${pos.rect.left + pos.x}px`;
  exportRectElem.style.top = `${pos.rect.top + pos.y}px`;
  exportRectElem.style.width = '0px';
  exportRectElem.style.height = '0px';
  isSelecting = true;
}

function onExportPointerMove(e) {
  if (!isSelecting) return;
  const pos = getCanvasPos(e);
  const x = Math.min(exportStart.x, pos.x);
  const y = Math.min(exportStart.y, pos.y);
  const w = Math.abs(pos.x - exportStart.x);
  const h = Math.abs(pos.y - exportStart.y);
  exportCurrentRect = { x, y, width: w, height: h };
  exportRectElem.style.left = `${pos.rect.left + x}px`;
  exportRectElem.style.top = `${pos.rect.top + y}px`;
  exportRectElem.style.width = `${w}px`;
  exportRectElem.style.height = `${h}px`;
}

function onExportPointerUp(e) {
  if (!isSelecting) return;
  onExportPointerMove(e);
  isSelecting = false;
}

function setupExportControls() {
  const btn = document.getElementById('export-mollweide');
  exportPngBtn = document.getElementById('export-png');
  exportPdfBtn = document.getElementById('export-pdf');
  exportOverlay = document.getElementById('export-selection-overlay');
  exportRectElem = document.getElementById('export-selection-rect');
  if (!btn || !exportOverlay || !exportRectElem || !exportPngBtn || !exportPdfBtn) return;

  exportPngBtn.addEventListener('click', () => {
    if (exportCurrentRect) exportMollweideMap('png', exportCurrentRect);
    exitExportSelection();
  });
  exportPdfBtn.addEventListener('click', () => {
    if (exportCurrentRect) exportMollweideMap('pdf', exportCurrentRect);
    exitExportSelection();
  });

  exportOverlay.addEventListener('pointerdown', onExportPointerDown);
  exportOverlay.addEventListener('pointermove', onExportPointerMove);
  window.addEventListener('pointerup', onExportPointerUp);

  btn.addEventListener('click', () => {
    exportSelectMode = !exportSelectMode;
    btn.classList.toggle('active', exportSelectMode);
    if (exportSelectMode) {
      exportOverlay.style.display = 'block';
      exportPngBtn.style.display = 'inline-block';
      exportPdfBtn.style.display = 'inline-block';
      exportRectElem.style.display = 'none';
      exportCurrentRect = null;
    } else {
      exitExportSelection();
    }
  });
}

function downloadLabelEdits() {
  const edits = {
    starOffsets: Array.from(starLabelOffsets.entries()),
    starRotations: Array.from(starLabelRotations.entries()),
    starScales: Array.from(starLabelScales.entries()),
    constellationOffsets: Array.from(constellationLabelOffsets.entries()),
    galacticOffsets: Array.from(galacticLabelOffsets.entries())
  };
  const blob = new Blob([JSON.stringify(edits, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'label-edits.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

function applyLabelEdits(edits) {
  if (!edits) return;
  if (edits.starOffsets) {
    starLabelOffsets.clear();
    edits.starOffsets.forEach(([id, off]) => starLabelOffsets.set(id, off));
  }
  if (edits.starRotations) {
    starLabelRotations.clear();
    edits.starRotations.forEach(([id, rot]) => starLabelRotations.set(id, rot));
  }
  if (edits.starScales) {
    starLabelScales.clear();
    edits.starScales.forEach(([id, sc]) => starLabelScales.set(id, sc));
  }
  if (edits.constellationOffsets) {
    constellationLabelOffsets.clear();
    edits.constellationOffsets.forEach(([id, off]) => constellationLabelOffsets.set(id, off));
  }
  if (edits.galacticOffsets) {
    galacticLabelOffsets.clear();
    edits.galacticOffsets.forEach(([id, off]) => galacticLabelOffsets.set(id, off));
  }

  if (state.cachedStars) {
    state.cachedStars.forEach(star => {
      const id = getStarId(star);
      if (starLabelOffsets.has(id)) {
        const off = starLabelOffsets.get(id);
        star.mollLabelOffset = new THREE.Vector3(off.x, off.y, 0);
      } else {
        delete star.mollLabelOffset;
      }
      if (starLabelRotations.has(id)) {
        star.mollLabelRotation = starLabelRotations.get(id);
      } else {
        delete star.mollLabelRotation;
      }
      if (starLabelScales.has(id)) {
        const sc = starLabelScales.get(id);
        star.mollLabelScale = new THREE.Vector3(sc.x, sc.y, 1);
      } else {
        delete star.mollLabelScale;
      }
    });
  }
  buildAndApplyFilters();
  maybePersistPresets();
}

function setupEditIOControls() {
  const dlBtn = document.getElementById('download-edits');
  if (dlBtn) {
    dlBtn.addEventListener('click', downloadLabelEdits);
  }
  const upBtn = document.getElementById('upload-edits');
  const fileInput = document.getElementById('upload-edits-input');
  if (upBtn && fileInput) {
    upBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        applyLabelEdits(data);
      } catch {
        alert('Invalid edits file');
      }
      fileInput.value = '';
    });
  }
}

function getPointerPos(event) {
  const rect = mollweideMap.canvas.getBoundingClientRect();
  editPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  editPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  editRaycaster.setFromCamera(editPointer, mollweideMap.camera);
  const point = new THREE.Vector3();
  editRaycaster.ray.intersectPlane(editPlane, point);
  return point;
}

function updateEditOverlay() {
  if (!editOverlay) return;
  if (!selectedLabel) {
    editOverlay.style.display = 'none';
    return;
  }
  const rect = mollweideMap.canvas.getBoundingClientRect();
  const pos = selectedLabel.position.clone().project(mollweideMap.camera);
  const x = (pos.x * 0.5 + 0.5) * rect.width + rect.left;
  const y = (-pos.y * 0.5 + 0.5) * rect.height + rect.top;
  editOverlay.style.display = 'block';
  editOverlay.style.left = `${x}px`;
  editOverlay.style.top = `${y}px`;

  const center = selectedLabel.position.clone();
  const halfW = selectedLabel.scale.x / 2;
  const rightVec = new THREE.Vector3(1, 0, 0)
    .applyQuaternion(mollweideMap.camera.quaternion)
    .multiplyScalar(halfW);
  const leftWorld = center.clone().sub(rightVec);
  const rightWorld = center.clone().add(rightVec);
  const lp = leftWorld.clone().project(mollweideMap.camera);
  const rp = rightWorld.clone().project(mollweideMap.camera);
  const lx = (lp.x * 0.5 + 0.5) * rect.width + rect.left;
  const rx = (rp.x * 0.5 + 0.5) * rect.width + rect.left;
  const labelWidth = Math.abs(rx - lx);
  const iconSize = 36;
  const offset = labelWidth / 2 + iconSize / 2 + 10;
  rotateHandle.style.left = `-${offset}px`;
  scaleHandle.style.left = `${offset}px`;
}

function registerMollweideEditableLabels() {
  editableLabels = [];
  mollweideMap.labelManager.sprites.forEach((sprite, star) => {
    const id = getStarId(star);
    sprite.userData = sprite.userData || {};
    sprite.userData.editType = 'star';
    sprite.userData.editId = id;
    sprite.userData.lineObj = mollweideMap.labelManager.lines.get(star);
    sprite.userData.starRef = star;
    sprite.userData.anchorFunc = () => star.mollweidePosition.clone();
    editableLabels.push(sprite);
    if (starLabelOffsets.has(id)) {
      const off = starLabelOffsets.get(id);
      star.mollLabelOffset = new THREE.Vector3(off.x, off.y, 0);
      sprite.position.copy(star.mollweidePosition.clone().add(star.mollLabelOffset));
    }
    if (starLabelRotations.has(id)) {
      const rot = starLabelRotations.get(id);
      sprite.material.rotation = rot;
      star.mollLabelRotation = rot;
    }
    if (starLabelScales.has(id)) {
      const sc = starLabelScales.get(id);
      sprite.scale.set(sc.x, sc.y, 1);
      star.mollLabelScale = new THREE.Vector3(sc.x, sc.y, 1);
    }
  });
  state.constellationLabelsMoll.forEach(sprite => {
    if (!sprite.userData) return;
    sprite.userData.editType = 'constellation';
    sprite.userData.editId = sprite.userData.name;
    sprite.userData.anchorFunc = () => {
      const p = cachedRadToMollweide(sprite.userData.ra, sprite.userData.dec, 100, getMollweideLambda0());
      return new THREE.Vector3(p.x, p.y, 0);
    };
    editableLabels.push(sprite);
    const anchor = sprite.userData.anchorFunc();
    sprite.position.copy(anchor);
    if (constellationLabelOffsets.has(sprite.userData.name)) {
      const off = constellationLabelOffsets.get(sprite.userData.name);
      const offsetVec = new THREE.Vector3(off.x, off.y, 0);
      sprite.position.add(offsetVec);
      sprite.userData.offset = offsetVec.clone();
    }
    if (starLabelRotations.has(sprite.userData.name)) {
      const rot = starLabelRotations.get(sprite.userData.name);
      sprite.material.rotation = rot;
    }
    if (starLabelScales.has(sprite.userData.name)) {
      const sc = starLabelScales.get(sprite.userData.name);
      sprite.scale.set(sc.x, sc.y, 1);
    }
  });
  state.galacticDirectionLabelsMoll.forEach(sprite => {
    if (!sprite.userData) return;
    sprite.userData.editType = 'galactic';
    sprite.userData.editId = sprite.userData.name;
    sprite.userData.anchorFunc = () => {
      const p = cachedRadToMollweide(sprite.userData.ra, sprite.userData.dec, 100, getMollweideLambda0());
      return new THREE.Vector3(p.x, p.y, 0);
    };
    editableLabels.push(sprite);
    const gAnchor = sprite.userData.anchorFunc();
    sprite.position.copy(gAnchor);
    if (galacticLabelOffsets.has(sprite.userData.name)) {
      const off = galacticLabelOffsets.get(sprite.userData.name);
      const offsetVec = new THREE.Vector3(off.x, off.y, 0);
      sprite.position.add(offsetVec);
      sprite.userData.offset = offsetVec.clone();
    }
    if (starLabelRotations.has(sprite.userData.name)) {
      const rot = starLabelRotations.get(sprite.userData.name);
      sprite.material.rotation = rot;
    }
    if (starLabelScales.has(sprite.userData.name)) {
      const sc = starLabelScales.get(sprite.userData.name);
      sprite.scale.set(sc.x, sc.y, 1);
    }
  });
}

function getLineKey(obj) {
  const posAttr = obj.geometry && obj.geometry.getAttribute('position');
  if (!posAttr || posAttr.array.length < 6) return null;
  const arr = posAttr.array;
  return [arr[0], arr[1], arr[2], arr[3], arr[4], arr[5]].join(',');
}

function applyStoredLineEdits(root) {
  if (!root) return;
  root.traverse(obj => {
    const key = getLineKey(obj);
    if (key && hiddenLineKeys.has(key)) {
      obj.visible = false;
    }
    if (obj.type !== 'Line' && obj.type !== 'LineSegments') {
      return;
    }
    const posAttr = obj.geometry && obj.geometry.getAttribute('position');
    if (!posAttr) return;
    const array = posAttr.array;
    const alphaAttr = obj.geometry.getAttribute('alpha');
    let changed = false;
    for (let i = 0; i + 5 < array.length; i += 6) {
      const segKey = [
        array[i], array[i + 1], array[i + 2],
        array[i + 3], array[i + 4], array[i + 5]
      ].join(',');
      if (removedLineSegments.has(segKey)) {
        for (let j = 0; j < 6; j++) array[i + j] = NaN;
        if (alphaAttr) {
          const idx = (i / 3);
          alphaAttr.array[idx] = 0;
          alphaAttr.array[idx + 1] = 0;
          alphaAttr.needsUpdate = true;
        }
        changed = true;
      }
    }
    if (changed) {
      posAttr.needsUpdate = true;
      if (obj.userData && obj.userData.visibleMesh) {
        rebuildConstellationMeshFromSegments(obj);
      }
    }
  });
}

function registerMollweideEditableLines() {
  editableLines = [];
  if (mollweideMap.connectionGroup) {
    mollweideMap.connectionGroup.traverse(obj => {
      if (obj.isLine || obj.type === 'Line' || obj.type === 'LineSegments') {
        editableLines.push(obj);
      }
    });
  }
  state.constellationLinesMoll.forEach(l => editableLines.push(l));
  if (state.isolationOverlay && state.isolationOverlay.adjacentLines) {
    state.isolationOverlay.adjacentLines.forEach(o => editableLines.push(o.lineM));
  }
  editableLines.forEach(applyStoredLineEdits);
}

function onLinePointerDown(e) {
  if (!lineEditMode) return;
  getPointerPos(e);
  editRaycaster.setFromCamera(editPointer, mollweideMap.camera);
  const intersects = editRaycaster.intersectObjects(editableLines, false);
  if (intersects.length > 0) {
    let intersect = null;
    for (const intr of intersects) {
      const obj = intr.object;
      const idx = intr.index;
      const posAttr = obj.geometry && obj.geometry.getAttribute('position');
      if (posAttr && idx !== undefined) {
        const start = obj.type === 'LineSegments' ? idx - (idx % 2) : idx;
        const base = start * 3;
        if (base + 5 < posAttr.array.length) {
          let removed = true;
          for (let i = 0; i < 6; i++) {
            if (!Number.isNaN(posAttr.array[base + i])) {
              removed = false;
              break;
            }
          }
          if (!removed) {
            intersect = intr;
            break;
          }
        }
      } else {
        intersect = intr;
        break;
      }
    }
    if (!intersect) return;
    const obj = intersect.object;
    const idx = intersect.index;
    const posAttr = obj.geometry && obj.geometry.getAttribute('position');
    if (posAttr && idx !== undefined) {
      const start = obj.type === 'LineSegments' ? idx - (idx % 2) : idx;
      const base = start * 3;
      if (base + 5 < posAttr.array.length) {
        const prevPos = [
          posAttr.array[base], posAttr.array[base + 1], posAttr.array[base + 2],
          posAttr.array[base + 3], posAttr.array[base + 4], posAttr.array[base + 5]
        ];
        for (let i = 0; i < 6; i++) posAttr.array[base + i] = NaN;
        posAttr.needsUpdate = true;
        let prevAlpha = null;
        const alphaAttr = obj.geometry.getAttribute('alpha');
        if (alphaAttr) {
          prevAlpha = [alphaAttr.array[start], alphaAttr.array[start + 1]];
          alphaAttr.array[start] = 0;
          alphaAttr.array[start + 1] = 0;
          alphaAttr.needsUpdate = true;
        }
        removedLineSegments.add(prevPos.join(','));
        editHistory.push({
          type: 'removeSegment',
          object: obj,
          index: start,
          prevPos,
          prevAlpha
        });
        requestRender();
        e.preventDefault();
        maybePersistPresets();
        return;
      }
    }
    editHistory.push({ type: 'toggleVisible', object: obj, prevVisible: obj.visible });
    obj.visible = false;
    const key = getLineKey(obj);
    if (key) hiddenLineKeys.add(key);
    requestRender();
    e.preventDefault();
    maybePersistPresets();
  }
}

function onEditPointerDown(e) {
  if (!labelEditMode) return;
  const pos = getPointerPos(e);
  editRaycaster.setFromCamera(editPointer, mollweideMap.camera);
  const intersects = editRaycaster.intersectObjects(editableLabels, false);
  if (intersects.length > 0) {
    const label = intersects[0].object;
    if (selectedLabel !== label) {
      selectedLabel = label;
      updateEditOverlay();
    }
    initialLabelPos = selectedLabel.position.clone();
    dragOffset.copy(pos).sub(selectedLabel.position);
    selectedLabel.userData._origColor = selectedLabel.material.color.clone();
    if (selectedLabel.userData.lineObj) {
      selectedLabel.userData._origLineColor = selectedLabel.userData.lineObj.material.color.clone();
    }
    selectedLabel.material.color.offsetHSL(0, 0, 0.1);
    if (selectedLabel.userData.lineObj) {
      selectedLabel.userData.lineObj.material.color.offsetHSL(0, 0, 0.1);
    }
    mollweideMap.canvas.classList.add('dragging');
    isDragging = true;
    requestRender();
    e.preventDefault();
  } else {
    if (selectedLabel) {
      selectedLabel = null;
      updateEditOverlay();
      requestRender();
    }
  }
}

function onEditPointerMove(e) {
  if (!labelEditMode || !selectedLabel || !isDragging) return;
  const pos = getPointerPos(e);
  selectedLabel.position.copy(pos.clone().sub(dragOffset));
  if (selectedLabel.userData.editType === 'star' && selectedLabel.userData.lineObj) {
    const anchor = selectedLabel.userData.anchorFunc();
    selectedLabel.userData.lineObj.geometry.setFromPoints([anchor, selectedLabel.position]);
  }
  updateEditOverlay();
  requestRender();
  e.preventDefault();
}

function onEditPointerUp() {
  if (!labelEditMode || !selectedLabel) return;
  const anchor = selectedLabel.userData.anchorFunc();
  const offsetVec = selectedLabel.position.clone().sub(anchor);
  if (selectedLabel.userData.editType === 'star') {
    starLabelOffsets.set(selectedLabel.userData.editId, { x: offsetVec.x, y: offsetVec.y });
    if (selectedLabel.userData.starRef) {
      selectedLabel.userData.starRef.mollLabelOffset = offsetVec.clone();
    }
    if (selectedLabel.userData.lineObj) {
      selectedLabel.userData.lineObj.geometry.setFromPoints([anchor, selectedLabel.position]);
    }
  } else if (selectedLabel.userData.editType === 'constellation') {
    constellationLabelOffsets.set(selectedLabel.userData.editId, { x: offsetVec.x, y: offsetVec.y });
    selectedLabel.userData.offset = offsetVec.clone();
  } else if (selectedLabel.userData.editType === 'galactic') {
    galacticLabelOffsets.set(selectedLabel.userData.editId, { x: offsetVec.x, y: offsetVec.y });
    selectedLabel.userData.offset = offsetVec.clone();
  }
  if (selectedLabel.userData._origColor) {
    selectedLabel.material.color.copy(selectedLabel.userData._origColor);
  }
  if (selectedLabel.userData.lineObj && selectedLabel.userData._origLineColor) {
    selectedLabel.userData.lineObj.material.color.copy(selectedLabel.userData._origLineColor);
  }
  mollweideMap.canvas.classList.remove('dragging');
  if (initialLabelPos) {
    const prevOffset = initialLabelPos.clone().sub(anchor);
    editHistory.push({ type: 'moveLabel', label: selectedLabel, prevOffset });
  }
  isDragging = false;
  updateEditOverlay();
  requestRender();
  initialLabelPos = null;
  maybePersistPresets();
}

function setupLabelEditor() {
  const btn = document.getElementById('toggle-label-editor');
  if (!btn) return;
  btn.addEventListener('click', () => {
    labelEditMode = !labelEditMode;
    btn.classList.toggle('active', labelEditMode);
    if (labelEditMode) {
      lineEditMode = false;
      const lbtn = document.getElementById('toggle-line-editor');
      if (lbtn) lbtn.classList.remove('active');
    }
    mollweideMap.canvas.classList.toggle('edit-mode', labelEditMode || lineEditMode);
    if (labelEditMode) {
      registerMollweideEditableLabels();
    } else {
      selectedLabel = null;
      updateEditOverlay();
    }
    requestRender();
  });
  mollweideMap.canvas.addEventListener('pointerdown', onEditPointerDown);
  mollweideMap.canvas.addEventListener('pointermove', onEditPointerMove);
  window.addEventListener('pointerup', onEditPointerUp);
}

function setupLineEditor() {
  const btn = document.getElementById('toggle-line-editor');
  if (!btn) return;
  btn.addEventListener('click', () => {
    lineEditMode = !lineEditMode;
    btn.classList.toggle('active', lineEditMode);
    if (lineEditMode) {
      labelEditMode = false;
      const lbtn = document.getElementById('toggle-label-editor');
      if (lbtn) lbtn.classList.remove('active');
      registerMollweideEditableLines();
      selectedLabel = null;
      updateEditOverlay();
    }
    mollweideMap.canvas.classList.toggle('edit-mode', lineEditMode || labelEditMode);
    requestRender();
  });
  mollweideMap.canvas.addEventListener('pointerdown', onLinePointerDown);
}

function setupUndoButton() {
  const btn = document.getElementById('undo-edit');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const action = editHistory.pop();
    if (!action) return;
    if (action.type === 'toggleVisible') {
      action.object.visible = action.prevVisible;
    } else if (action.type === 'removeSegment') {
      const posAttr = action.object.geometry.getAttribute('position');
      const base = action.index * 3;
      action.prevPos.forEach((v, i) => {
        posAttr.array[base + i] = v;
      });
      posAttr.needsUpdate = true;
      if (action.prevAlpha) {
        const alphaAttr = action.object.geometry.getAttribute('alpha');
        if (alphaAttr) {
          alphaAttr.array[action.index] = action.prevAlpha[0];
          alphaAttr.array[action.index + 1] = action.prevAlpha[1];
          alphaAttr.needsUpdate = true;
        }
      }
    } else if (action.type === 'moveLabel') {
      const label = action.label;
      const anchor = label.userData.anchorFunc();
      const newPos = anchor.clone().add(action.prevOffset);
      label.position.copy(newPos);
      if (label.userData.editType === 'star') {
        starLabelOffsets.set(label.userData.editId, { x: action.prevOffset.x, y: action.prevOffset.y });
        if (label.userData.starRef) label.userData.starRef.mollLabelOffset = action.prevOffset.clone();
        if (label.userData.lineObj) label.userData.lineObj.geometry.setFromPoints([anchor, newPos]);
      } else if (label.userData.editType === 'constellation') {
        constellationLabelOffsets.set(label.userData.editId, { x: action.prevOffset.x, y: action.prevOffset.y });
        label.userData.offset = action.prevOffset.clone();
      } else if (label.userData.editType === 'galactic') {
        galacticLabelOffsets.set(label.userData.editId, { x: action.prevOffset.x, y: action.prevOffset.y });
        label.userData.offset = action.prevOffset.clone();
      }
      updateEditOverlay();
    } else if (action.type === 'rotateLabel') {
      const label = action.label;
      label.material.rotation = action.prevRotation;
      if (label.userData.starRef) label.userData.starRef.mollLabelRotation = action.prevRotation;
      starLabelRotations.set(label.userData.editId, action.prevRotation);
      updateEditOverlay();
    } else if (action.type === 'scaleLabel') {
      const label = action.label;
      label.scale.copy(action.prevScale);
      if (label.userData.starRef) label.userData.starRef.mollLabelScale = action.prevScale.clone();
      starLabelScales.set(label.userData.editId, { x: action.prevScale.x, y: action.prevScale.y });
      updateEditOverlay();
    }
    requestRender();
    maybePersistPresets();
  });
}

function setupEditOverlay() {
  const container = document.querySelector('.label-container');
  if (!container) return;
  editOverlay = document.createElement('div');
  editOverlay.id = 'label-edit-overlay';
  rotateHandle = document.createElement('div');
  rotateHandle.className = 'handle rotate-handle';
  rotateHandle.textContent = '⟳';
  scaleHandle = document.createElement('div');
  scaleHandle.className = 'handle scale-handle';
  scaleHandle.textContent = '⤡';
  editOverlay.appendChild(rotateHandle);
  editOverlay.appendChild(scaleHandle);
  container.appendChild(editOverlay);

  rotateHandle.addEventListener('pointerdown', e => {
    if (!selectedLabel) return;
    isRotating = true;
    const rect = editOverlay.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    rotateStartAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
    rotateInitialRotation = selectedLabel.material.rotation || 0;
    rotateCurrentRotation = rotateInitialRotation;
    document.addEventListener('pointermove', onRotateMove);
    document.addEventListener('pointerup', onRotateUp);
    e.stopPropagation();
    e.preventDefault();
  });

  scaleHandle.addEventListener('pointerdown', e => {
    if (!selectedLabel) return;
    isScaling = true;
    const rect = editOverlay.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    scaleStart = { dist: Math.hypot(dx, dy), sx: selectedLabel.scale.x, sy: selectedLabel.scale.y };
    document.addEventListener('pointermove', onScaleMove);
    document.addEventListener('pointerup', onScaleUp);
    e.stopPropagation();
    e.preventDefault();
  });
}

function onRotateMove(e) {
  if (!isRotating || !selectedLabel) return;
  const rect = editOverlay.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
  const delta = angleDiff(angle, rotateStartAngle);
  rotateCurrentRotation -= delta * ROTATE_SENSITIVITY;
  selectedLabel.material.rotation = rotateCurrentRotation;
  rotateStartAngle = angle;
  if (selectedLabel.userData.starRef) {
    selectedLabel.userData.starRef.mollLabelRotation = rotateCurrentRotation;
  }
  starLabelRotations.set(selectedLabel.userData.editId, rotateCurrentRotation);
  updateEditOverlay();
  requestRender();
}

function onRotateUp() {
  if (!isRotating) return;
  document.removeEventListener('pointermove', onRotateMove);
  document.removeEventListener('pointerup', onRotateUp);
  editHistory.push({ type: 'rotateLabel', label: selectedLabel, prevRotation: rotateInitialRotation });
  isRotating = false;
  maybePersistPresets();
}

function onScaleMove(e) {
  if (!isScaling || !selectedLabel) return;
  const rect = editOverlay.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = e.clientX - cx;
  const dy = e.clientY - cy;
  const dist = Math.hypot(dx, dy);
  const ratio = dist / scaleStart.dist;
  const factor = 1 + (ratio - 1) * 0.5;
  const newX = scaleStart.sx * factor;
  const newY = scaleStart.sy * factor;
  selectedLabel.scale.set(newX, newY, 1);
  if (selectedLabel.userData.starRef) selectedLabel.userData.starRef.mollLabelScale = new THREE.Vector3(newX, newY, 1);
  starLabelScales.set(selectedLabel.userData.editId, { x: newX, y: newY });
  updateEditOverlay();
  requestRender();
}

function onScaleUp() {
  if (!isScaling) return;
  document.removeEventListener('pointermove', onScaleMove);
  document.removeEventListener('pointerup', onScaleUp);
  editHistory.push({ type: 'scaleLabel', label: selectedLabel, prevScale: new THREE.Vector3(scaleStart.sx, scaleStart.sy, 1) });
  isScaling = false;
  maybePersistPresets();
}

async function main() {
  const loader = document.getElementById('loader');
  loader.classList.remove('hidden');
  try {
    state.cachedStars = await loadStarData();
    if (!state.cachedStars.length) throw new Error('No star data available');
    initFilterUI();
    await setupFilterUI(state.cachedStars);
    const form = document.getElementById('filters-form');
    if (form) {
      const presetsFs = document.getElementById('save-presets-fieldset');
      if (presetsFs) form.appendChild(presetsFs);
    }
    loadPresets({
      starLabelOffsets,
      starLabelRotations,
      starLabelScales,
      constellationLabelOffsets,
      galacticLabelOffsets,
      removedLineSegments,
      hiddenLineKeys
    });
    const debouncedApplyFilters = debounce(buildAndApplyFilters, 150);
    if (form) {
      form.addEventListener('change', () => {
        debouncedApplyFilters();
        maybePersistPresets();
      });
    }
    const clearBtn = document.getElementById('clear-saved-presets');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        clearSavedPresets();
        window.location.reload();
      });
    }
    trueCoordinatesMap = new MapManager({ canvasId: 'map3D', mapType: 'TrueCoordinates' });
    globeMap = new MapManager({ canvasId: 'sphereMap', mapType: 'Globe' });
    mollweideMap = new MapManager({ canvasId: 'mollweideMap', mapType: 'Mollweide' });
    mapManagers.push(trueCoordinatesMap, globeMap, mollweideMap);
    state.cachedStars.forEach(star => {
      star.spherePosition = projectStarGlobe(star);
      star.truePosition = getStarTruePosition(star);
      precalcMollweideData(star);
      updateMollweidePosition(star);
      const id = getStarId(star);
      if (starLabelOffsets.has(id)) {
        const off = starLabelOffsets.get(id);
        star.mollLabelOffset = new THREE.Vector3(off.x, off.y, 0);
      }
      if (starLabelRotations.has(id)) {
        star.mollLabelRotation = starLabelRotations.get(id);
      }
      if (starLabelScales.has(id)) {
        const sc = starLabelScales.get(id);
        star.mollLabelScale = new THREE.Vector3(sc.x, sc.y, 1);
      }
    });
    const globeGrid = createGlobeGrid(GLOBE_RADIUS, { color: 0x444444, opacity: 0.2, lineWidth: 1 });
    globeMap.scene.add(globeGrid);
    buildAndApplyFilters();
    initStarInteractions(appContext, trueCoordinatesMap);
    initStarInteractions(appContext, globeMap);
    initStarInteractions(appContext, mollweideMap);
    setupMapProjectionToggles();
    setupExportControls();
    setupLabelEditor();
    setupLineEditor();
    setupUndoButton();
    setupEditIOControls();
    setupEditOverlay();
    requestRender();
    loader.classList.add('hidden');
  } catch (err) {
    console.error('Error initializing starmap:', err);
    alert('Initialization failed. Check console for details.');
    loader.classList.add('hidden');
  }
}

window.addEventListener('DOMContentLoaded', main);
