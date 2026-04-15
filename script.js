// script.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { setupFilterUI } from './filters/index.js';
import { createConnectionLines, mergeConnectionLines } from './filters/connectionsFilter.js';
import { buildWideLineGeometry, disposeObject3D } from './utils/renderUtils.js';
import { rebuildConstellationMeshFromSegments } from './filters/constellationFilter.js';
import { ThreeDControls, TwoDControls } from './cameraControls.js';
import { LabelManager } from './labelManager.js';
import { cachedRadToSphere, cachedRadToMollweide, degToRad, setMollweideLambda0, getMollweideLambda0 } from './utils/geometryUtils.js';
import { minimalRADifference } from './utils/geometryUtils.js';
// UI initialization is now handled by setupFilterUI in filters/index.js
import { loadStarData } from './app/starData.js';
import { maybeSavePresets, savePresets, loadPresets, clearSavedPresets } from './app/presets.js';
import { getStarId as getSharedStarId, getStarTruePosition as getSharedStarTruePosition, getStarGlobePosition, getStarMollweidePosition, precalcMollweideData as precalcSharedMollweideData } from './shared/starUtils.js';
import { buildAndApplyFilters as runFilterPipeline, updateMollweideView as refreshMollweideMap } from './script/filterPipeline.js';
import { initStarInteractions } from './script/starInteractions.js';
import { setRenderRequester, requestRenderIfAvailable } from './shared/renderScheduler.js';
import { ExportManager } from './script/exportManager.js';
import { EditManager } from './script/editManager.js';

let cachedStars = null;
let currentFilteredStars = [];
let currentConnections = [];
let currentGlobeFilteredStars = [];
let currentGlobeConnections = [];
let currentMollweideFilteredStars = [];
let currentMollweideConnections = [];
let selectedStarData = null;
let selectedHighlightTrue = null;
let selectedHighlightGlobe = null;
let selectedHighlightMollweide = null;
let trueCoordinatesMap;
let globeMap;
let mollweideMap;
let constellationLinesGlobe = [];
let constellationLabelsGlobe = [];
let constellationOverlayGlobe = [];
let constellationLinesMoll = [];
let constellationLabelsMoll = [];
let constellationOverlayMoll = [];
let globeSurfaceSphere = null;
let isolationOverlay = null;
let densityOverlay = null;
let cloudDensityOverlays = [];
let galacticPlaneTrue = null;
let eclipticPlaneTrue = null;
let celestialEquatorTrue = null;
let galacticPlaneGlobe = null;
let eclipticPlaneGlobe = null;
let celestialEquatorGlobe = null;
let galacticPlaneMoll = null;
let eclipticPlaneMoll = null;
let celestialEquatorMoll = null;
let galacticDirectionLabelsTrue = [];
let galacticDirectionLabelsGlobe = [];
let galacticDirectionLabelsMoll = [];
let showConstellationBoundariesFlag = false;
let showConstellationNamesFlag = false;
let showConstellationOverlayFlag = false;
let enableIsolationFilterFlag = false;
let enableDensityFilterFlag = false;
let showCloudsFlag = false;
let showCloudDensityFlag = false;
let showGalacticPlaneFlag = false;
let showEclipticPlaneFlag = false;
let showCelestialEquatorFlag = false;

const state = {
  cachedStars: () => cachedStars,
  currentFilteredStars: () => currentFilteredStars,
  currentConnections: () => currentConnections,
  currentGlobeFilteredStars: () => currentGlobeFilteredStars,
  currentGlobeConnections: () => currentGlobeConnections,
  currentMollweideFilteredStars: () => currentMollweideFilteredStars,
  currentMollweideConnections: () => currentMollweideConnections,
  selectedStarData: () => selectedStarData,
  selectedHighlightTrue: () => selectedHighlightTrue,
  selectedHighlightGlobe: () => selectedHighlightGlobe,
  selectedHighlightMollweide: () => selectedHighlightMollweide,
  constellationLinesGlobe: () => constellationLinesGlobe,
  constellationLabelsGlobe: () => constellationLabelsGlobe,
  constellationOverlayGlobe: () => constellationOverlayGlobe,
  constellationLinesMoll: () => constellationLinesMoll,
  constellationLabelsMoll: () => constellationLabelsMoll,
  constellationOverlayMoll: () => constellationOverlayMoll,
  globeSurfaceSphere: () => globeSurfaceSphere,
  isolationOverlay: () => isolationOverlay,
  densityOverlay: () => densityOverlay,
  cloudDensityOverlays: () => cloudDensityOverlays,
  galacticPlaneTrue: () => galacticPlaneTrue,
  eclipticPlaneTrue: () => eclipticPlaneTrue,
  celestialEquatorTrue: () => celestialEquatorTrue,
  galacticPlaneGlobe: () => galacticPlaneGlobe,
  eclipticPlaneGlobe: () => eclipticPlaneGlobe,
  celestialEquatorGlobe: () => celestialEquatorGlobe,
  galacticPlaneMoll: () => galacticPlaneMoll,
  eclipticPlaneMoll: () => eclipticPlaneMoll,
  celestialEquatorMoll: () => celestialEquatorMoll,
  galacticDirectionLabelsTrue: () => galacticDirectionLabelsTrue,
  galacticDirectionLabelsGlobe: () => galacticDirectionLabelsGlobe,
  galacticDirectionLabelsMoll: () => galacticDirectionLabelsMoll,
  showConstellationBoundariesFlag: () => showConstellationBoundariesFlag,
  showConstellationNamesFlag: () => showConstellationNamesFlag,
  showConstellationOverlayFlag: () => showConstellationOverlayFlag,
  enableIsolationFilterFlag: () => enableIsolationFilterFlag,
  enableDensityFilterFlag: () => enableDensityFilterFlag,
  showCloudsFlag: () => showCloudsFlag,
  showCloudDensityFlag: () => showCloudDensityFlag,
  showGalacticPlaneFlag: () => showGalacticPlaneFlag,
  showEclipticPlaneFlag: () => showEclipticPlaneFlag,
  showCelestialEquatorFlag: () => showCelestialEquatorFlag
};

let editManager = null;
let exportManager = null;

const appContext = {
  state,
  getMaps: () => ({ trueCoordinatesMap, globeMap, mollweideMap }),
  getStarTruePosition: getSharedStarTruePosition,
  projectStarGlobe: getStarGlobePosition,
  projectStarMollweide: getStarMollweidePosition,
  precalcMollweideData: precalcSharedMollweideData,
  updateMollweidePosition,
  applyGlobeSurface,
  requestRender: () => requestRender(),
  editManager: editManager
};

async function buildAndApplyFilters() {
  return runFilterPipeline(appContext);
}

async function updateMollweideView() {
  return refreshMollweideMap(appContext);
}

function persistPresets() {
  if (editManager) {
    const state = editManager.getState();
    savePresets({
      starLabelOffsets: state.starLabelOffsets,
      starLabelRotations: state.starLabelRotations,
      starLabelScales: state.starLabelScales,
      constellationLabelOffsets: state.constellationLabelOffsets,
      galacticLabelOffsets: state.galacticLabelOffsets,
      removedLineSegments: state.removedLineSegments,
      hiddenLineKeys: state.hiddenLineKeys
    });
  }
}

function maybePersistPresets() {
  maybeSavePresets(persistPresets);
}

function angleDiff(a, b) {
  let diff = a - b;
  diff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
  return diff;
}

function updateMollweidePosition(star) {
  const lambda = minimalRADifference(star.raRad - getMollweideLambda0());
  if (!star.mollweidePosition) star.mollweidePosition = new THREE.Vector3();
  star.mollweidePosition.set(star.mollXFactor * lambda, star.mollY, 0);
}

function createGlobeGrid(R = 100, options = {}) {
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

function createMollweideMask(R = 100, segments = 1024) {
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
  if (globeSurfaceSphere) {
    globeMap.scene.remove(globeSurfaceSphere);
    globeSurfaceSphere.geometry?.dispose?.();
    globeSurfaceSphere.material?.dispose?.();
    globeSurfaceSphere = null;
  }
  if (isOpaque) {
    const geom = new THREE.SphereGeometry(99, 32, 32);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      side: THREE.FrontSide,
      depthWrite: true,
      depthTest: true,
      transparent: false
    });
    globeSurfaceSphere = new THREE.Mesh(geom, mat);
    globeSurfaceSphere.renderOrder = 0;
    globeSurfaceSphere.frustumCulled = false;
    globeMap.scene.add(globeSurfaceSphere);
  }
}

function createStarTexture() {
  const size = 64;
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
          if (enableIsolationFilterFlag && isolationOverlay &&
              typeof isolationOverlay.refreshMollweide === 'function') {
            isolationOverlay.refreshMollweide();
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
      if (editManager) editManager.updateEditOverlay();
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






async function main() {
  const loader = document.getElementById('loader');
  loader.classList.remove('hidden');
  try {
    cachedStars = await loadStarData();
    if (!cachedStars.length) throw new Error('No star data available');
    await setupFilterUI(cachedStars);
    const form = document.getElementById('filters-form');
    if (form) {
      const presetsFs = document.getElementById('save-presets-fieldset');
      if (presetsFs) form.appendChild(presetsFs);
    }
    trueCoordinatesMap = new MapManager({ canvasId: 'map3D', mapType: 'TrueCoordinates' });
    globeMap = new MapManager({ canvasId: 'sphereMap', mapType: 'Globe' });
    mollweideMap = new MapManager({ canvasId: 'mollweideMap', mapType: 'Mollweide' });
    mapManagers.push(trueCoordinatesMap, globeMap, mollweideMap);

    // Initialize EditManager
    editManager = new EditManager(
      mollweideMap,
      cachedStars,
      constellationLabelsMoll,
      galacticDirectionLabelsMoll,
      getSharedStarId,
      buildAndApplyFilters,
      maybePersistPresets,
      requestRender
    );

    // Load presets with edit manager's state
    const editState = editManager.getState();
    loadPresets({
      starLabelOffsets: editState.starLabelOffsets,
      starLabelRotations: editState.starLabelRotations,
      starLabelScales: editState.starLabelScales,
      constellationLabelOffsets: editState.constellationLabelOffsets,
      galacticLabelOffsets: editState.galacticLabelOffsets,
      removedLineSegments: editState.removedLineSegments,
      hiddenLineKeys: editState.hiddenLineKeys
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

    cachedStars.forEach(star => {
      star.spherePosition = getStarGlobePosition(star);
      star.truePosition = getSharedStarTruePosition(star);
      precalcSharedMollweideData(star);
      updateMollweidePosition(star);
      const id = getSharedStarId(star);
      if (editManager.starLabelOffsets.has(id)) {
        const off = editManager.starLabelOffsets.get(id);
        star.mollLabelOffset = new THREE.Vector3(off.x, off.y, 0);
      }
      if (editManager.starLabelRotations.has(id)) {
        star.mollLabelRotation = editManager.starLabelRotations.get(id);
      }
      if (editManager.starLabelScales.has(id)) {
        const sc = editManager.starLabelScales.get(id);
        star.mollLabelScale = new THREE.Vector3(sc.x, sc.y, 1);
      }
    });

    const globeGrid = createGlobeGrid(100, { color: 0x444444, opacity: 0.2, lineWidth: 1 });
    globeMap.scene.add(globeGrid);
    buildAndApplyFilters();
    initStarInteractions(appContext, trueCoordinatesMap);
    initStarInteractions(appContext, globeMap);
    initStarInteractions(appContext, mollweideMap);

    // Setup managers
    setupMapProjectionToggles();
    exportManager = new ExportManager(mollweideMap);
    exportManager.setup();
    editManager.setConstellationLinesMoll(constellationLinesMoll);
    editManager.setIsolationOverlay(isolationOverlay);
    editManager.setupAll();
    appContext.editManager = editManager;

    requestRender();
    loader.classList.add('hidden');
  } catch (err) {
    console.error('Error initializing starmap:', err);
    alert('Initialization failed. Check console for details.');
    loader.classList.add('hidden');
  }
}

window.addEventListener('DOMContentLoaded', main);
