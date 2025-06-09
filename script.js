// script.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { applyFilters, setupFilterUI } from './filters/index.js';
import { createConnectionLines, mergeConnectionLines, createMollweideConnectionSegments, updateMollweideConnectionSegments } from './filters/connectionsFilter.js';
import { createConstellationBoundariesForGlobe, createConstellationLabelsForGlobe, createConstellationBoundariesForMollweide, updateConstellationBoundariesForMollweide, createConstellationLabelsForMollweide } from './filters/constellationFilter.js';
import { createConstellationOverlayForGlobe, createConstellationOverlayForMollweide } from './filters/constellationOverlayFilter.js';
import { initIsolationFilter, updateIsolationFilter } from './filters/isolationFilter.js';
import { initDensityFilter, updateDensityFilter } from './filters/densityFilter.js';
import { applyGlobeSurfaceFilter } from './filters/globeSurfaceFilter.js';
import { updateCloudsOverlay } from './filters/cloudsFilter.js'; // Correct import
import { ThreeDControls, TwoDControls } from './cameraControls.js';
import { LabelManager } from './labelManager.js';
import { showTooltip, hideTooltip } from './tooltips.js';
import { cachedRadToSphere, cachedRadToMollweide, degToRad, setMollweideLambda0, getMollweideLambda0 } from './utils/geometryUtils.js';
import { minimalRADifference } from './utils.js';

let cachedStars = null;
let currentFilteredStars = [];
let currentConnections = [];
let currentGlobeFilteredStars = [];
let currentGlobeConnections = [];
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
let showConstellationBoundariesFlag = false;
let showConstellationNamesFlag = false;
let showConstellationOverlayFlag = false;
let enableIsolationFilterFlag = false;
let enableDensityFilterFlag = false;
let showCloudsFlag = false;

function getStarTruePosition(star) {
  const R = star.distance !== undefined ? star.distance : star.Distance_from_the_Sun;
  let ra, dec;
  if (star.RA_in_radian !== undefined && star.DEC_in_radian !== undefined) {
    ra = star.RA_in_radian;
    dec = star.DEC_in_radian;
  } else if (star.RA_in_degrees !== undefined && star.DEC_in_degrees !== undefined) {
    ra = degToRad(star.RA_in_degrees);
    dec = degToRad(star.DEC_in_degrees);
  } else {
    ra = 0;
    dec = 0;
  }
  return cachedRadToSphere(ra, dec, R);
}

function projectStarGlobe(star) {
  const R = 100;
  let ra, dec;
  if (star.RA_in_radian !== undefined && star.DEC_in_radian !== undefined) {
    ra = star.RA_in_radian;
    dec = star.DEC_in_radian;
  } else if (star.RA_in_degrees !== undefined && star.DEC_in_degrees !== undefined) {
    ra = degToRad(star.RA_in_degrees);
    dec = degToRad(star.DEC_in_degrees);
  } else {
    ra = 0;
    dec = 0;
  }
  return cachedRadToSphere(ra, dec, R);
}

function projectStarMollweide(star) {
  const R = 100;
  let ra, dec;
  if (star.RA_in_radian !== undefined && star.DEC_in_radian !== undefined) {
    ra = star.RA_in_radian;
    dec = star.DEC_in_radian;
  } else if (star.RA_in_degrees !== undefined && star.DEC_in_degrees !== undefined) {
    ra = degToRad(star.RA_in_degrees);
    dec = degToRad(star.DEC_in_degrees);
  } else {
    ra = 0;
    dec = 0;
  }
  return cachedRadToMollweide(ra, dec, R);
}

function precalcMollweideData(star) {
  const R = 100;
  let ra, dec;
  if (star.RA_in_radian !== undefined && star.DEC_in_radian !== undefined) {
    ra = star.RA_in_radian;
    dec = star.DEC_in_radian;
  } else if (star.RA_in_degrees !== undefined && star.DEC_in_degrees !== undefined) {
    ra = degToRad(star.RA_in_degrees);
    dec = degToRad(star.DEC_in_degrees);
  } else {
    ra = 0;
    dec = 0;
  }
  star.raRad = ra;
  star.decRad = dec;
  let theta = dec;
  for (let i = 0; i < 10; i++) {
    const delta = (2 * theta + Math.sin(2 * theta) - Math.PI * Math.sin(dec)) /
      (2 + 2 * Math.cos(2 * theta));
    theta -= delta;
    if (Math.abs(delta) < 1e-10) break;
  }
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  star.mollXFactor = (2 * R / Math.PI) * cosT;
  star.mollY = R * sinT;
}

function updateMollweidePosition(star) {
  const lambda = minimalRADifference(star.raRad - getMollweideLambda0());
  if (!star.mollweidePosition) star.mollweidePosition = new THREE.Vector3();
  star.mollweidePosition.set(star.mollXFactor * lambda, star.mollY, 0);
  star.mollweidePosition.ra = star.raRad;
  star.mollweidePosition.dec = star.decRad;
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

function createMollweideBorder(R = 100) {
  const points = [];
  for (let i = 0; i <= 64; i++) {
    const theta = (i / 64) * 2 * Math.PI;
    const x = 2 * R * Math.cos(theta);
    const y = R * Math.sin(theta);
    points.push(new THREE.Vector3(x, y, 0));
  }
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({ color: 0xaaaaaa });
  return new THREE.LineLoop(geom, mat);
}

async function loadStarData() {
  const manifestUrl = 'data/manifest.json';
  try {
    const manifestResp = await fetch(manifestUrl);
    if (!manifestResp.ok) {
      console.warn(`Manifest file not found: ${manifestUrl}`);
      return [];
    }
    const fileNames = await manifestResp.json();
    const dataPromises = fileNames.map(name =>
      fetch(`data/${name}`).then(resp => {
        if (!resp.ok) {
          console.warn(`File not found: data/${name}`);
          return [];
        }
        return resp.json();
      })
    );
    const filesData = await Promise.all(dataPromises);
    const combinedData = filesData.flat();
    return combinedData;
  } catch (e) {
    console.warn("Error loading star data:", e);
    return [];
  }
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

async function buildAndApplyFilters() {
  if (!cachedStars) return;
  const filters = applyFilters(cachedStars);
  const {
    filteredStars,
    connections,
    globeFilteredStars,
    globeConnections,
    showConstellationBoundaries,
    showConstellationNames,
    showConstellationOverlay,
    globeOpaqueSurface,
    enableConnections,
    enableIsolationFilter,
    enableDensityFilter,
    isolation,
    isolationTolerance,
    densityThresholdStars,
    enableIsolationLabeling,
    enableDensityLabeling,
    minDistance,
    maxDistance,
    isolationGridSize,
    densityGridSize,
    showClouds,
    isolationOverlay: returnedIsolationOverlay,
    densityOverlay: returnedDensityOverlay
  } = filters;

  showConstellationBoundariesFlag = showConstellationBoundaries;
  showConstellationNamesFlag = showConstellationNames;
  showConstellationOverlayFlag = showConstellationOverlay;
  enableIsolationFilterFlag = enableIsolationFilter;
  enableDensityFilterFlag = enableDensityFilter;
  showCloudsFlag = showClouds;

  // store overlay references for external refresh calls
  isolationOverlay = returnedIsolationOverlay;
  densityOverlay = returnedDensityOverlay;

  currentFilteredStars = filteredStars;
  currentConnections = connections;
  currentGlobeFilteredStars = globeFilteredStars;
  currentGlobeConnections = globeConnections;

  currentGlobeFilteredStars.forEach(star => {
    star.spherePosition = projectStarGlobe(star);
  });
  currentFilteredStars.forEach(star => {
    star.truePosition = getStarTruePosition(star);
    precalcMollweideData(star);
    updateMollweidePosition(star);
  });

  trueCoordinatesMap.updateMap(currentFilteredStars, currentConnections);
  trueCoordinatesMap.labelManager.refreshLabels(currentFilteredStars);
  globeMap.updateMap(currentGlobeFilteredStars, currentGlobeConnections);
  globeMap.labelManager.refreshLabels(currentGlobeFilteredStars);
  mollweideMap.addStars(currentFilteredStars);
  mollweideMap.updateStarPositions(currentFilteredStars);
  mollweideMap.updateConnections(currentFilteredStars, currentConnections);
  mollweideMap.labelManager.refreshLabels(currentFilteredStars);

  removeConstellationObjectsFromGlobe();
  removeConstellationOverlayObjectsFromGlobe();

  if (showConstellationBoundaries) {
    constellationLinesGlobe = createConstellationBoundariesForGlobe();
    constellationLinesGlobe.forEach(ln => globeMap.scene.add(ln));
    constellationLinesMoll = createConstellationBoundariesForMollweide();
    constellationLinesMoll.forEach(ln => mollweideMap.scene.add(ln));
  }
  if (showConstellationNames) {
    constellationLabelsGlobe = createConstellationLabelsForGlobe();
    constellationLabelsGlobe.forEach(lbl => globeMap.scene.add(lbl));
    constellationLabelsMoll = createConstellationLabelsForMollweide();
    constellationLabelsMoll.forEach(lbl => mollweideMap.scene.add(lbl));
  }
  if (showConstellationOverlay) {
    const constellationOverlay = createConstellationOverlayForGlobe();
    constellationOverlay.forEach(mesh => {
      window.globeMap.scene.add(mesh);
    });
    constellationOverlayMoll = createConstellationOverlayForMollweide();
    constellationOverlayMoll.forEach(mesh => {
      mollweideMap.scene.add(mesh);
    });
  }

  // --- Dust Clouds Overlay ---
  if (showClouds) {
    const form = document.getElementById('filters-form');
    // Get the file paths from the checked dust cloud checkboxes.
    const cloudDataFiles = new FormData(form).getAll('dust-clouds');
    // Use the complete star list (cachedStars) so that the clouds overlay ignores the distance filter.
    updateCloudsOverlay(cachedStars, trueCoordinatesMap.scene, 'TrueCoordinates', cloudDataFiles);
    updateCloudsOverlay(cachedStars, globeMap.scene, 'Globe', cloudDataFiles);
    updateCloudsOverlay(cachedStars, mollweideMap.scene, 'Mollweide', cloudDataFiles);
  }

  applyGlobeSurface(globeOpaqueSurface);
}

function removeConstellationObjectsFromGlobe() {
  if (constellationLinesGlobe && constellationLinesGlobe.length > 0) {
    constellationLinesGlobe.forEach(l => globeMap.scene.remove(l));
  }
  constellationLinesGlobe = [];
  if (constellationLabelsGlobe && constellationLabelsGlobe.length > 0) {
    constellationLabelsGlobe.forEach(lbl => globeMap.scene.remove(lbl));
  }
  constellationLabelsGlobe = [];
  if (constellationLinesMoll && constellationLinesMoll.length > 0) {
    constellationLinesMoll.forEach(l => mollweideMap.scene.remove(l));
  }
  constellationLinesMoll = [];
  if (constellationLabelsMoll && constellationLabelsMoll.length > 0) {
    constellationLabelsMoll.forEach(lbl => mollweideMap.scene.remove(lbl));
  }
  constellationLabelsMoll = [];
}

function removeConstellationOverlayObjectsFromGlobe() {
  if (constellationOverlayGlobe && constellationOverlayGlobe.length > 0) {
    constellationOverlayGlobe.forEach(mesh => globeMap.scene.remove(mesh));
  }
  constellationOverlayGlobe = [];
  if (constellationOverlayMoll && constellationOverlayMoll.length > 0) {
    constellationOverlayMoll.forEach(mesh => mollweideMap.scene.remove(mesh));
  }
  constellationOverlayMoll = [];
}

function applyGlobeSurface(isOpaque) {
  if (globeSurfaceSphere) {
    globeMap.scene.remove(globeSurfaceSphere);
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
    globeMap.scene.add(globeSurfaceSphere);
  }
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
      const border = createMollweideBorder(100);
      this.scene.add(border);
    } else {
      this.controls = new ThreeDControls(this.camera, this.renderer.domElement);
    }
    this.labelManager = new LabelManager(mapType, this.scene);
    this.starGroup = new THREE.Group();
    this.scene.add(this.starGroup);
    this.debouncedResize = debounce(() => this.onResize(), 200);
    window.addEventListener('resize', this.debouncedResize, false);
    this.animate();
  }

  addStars(stars) {
    const count = stars.length;
    if (!this.instancedMesh || this.instancedMesh.count !== count) {
      while (this.starGroup.children.length > 0) {
        const child = this.starGroup.children[0];
        this.starGroup.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      }
      if (count === 0) return;
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
        opacity: 1.0,
        vertexColors: true
      });
      this.instancedMesh = new THREE.InstancedMesh(baseGeometry, material, count);
      this.instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
      this.starGroup.add(this.instancedMesh);
    }
    this.updateStarPositions(stars);
  }

  updateStarPositions(stars) {
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
      const baseScale = this.mapType === 'Mollweide' ? 0.4 : 0.2;
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
    this.starObjects = stars;
  }

  updateConnections(stars, connectionObjs) {
    if (this.connectionGroup) {
      this.scene.remove(this.connectionGroup);
      this.connectionGroup = null;
    }
    if (!connectionObjs || connectionObjs.length === 0) return;
    this.connectionGroup = new THREE.Group();
    if (this.mapType === 'Globe') {
      const linesArray = createConnectionLines(stars, connectionObjs, 'Globe');
      linesArray.forEach(line => this.connectionGroup.add(line));
    } else if (this.mapType === 'Mollweide') {
      const merged = createMollweideConnectionSegments(connectionObjs);
      this.connectionGroup.add(merged);
    } else {
      const merged = mergeConnectionLines(connectionObjs, this.mapType);
      this.connectionGroup.add(merged);
    }
    this.scene.add(this.connectionGroup);
  }

  updateConnectionPositions(stars, connectionObjs) {
    if (!this.connectionGroup) return;
    if (this.mapType === 'Mollweide') {
      const segs = this.connectionGroup.children[0];
      if (segs) updateMollweideConnectionSegments(segs);
    } else {
      this.updateConnections(stars, connectionObjs);
    }
  }

  updateMap(stars, connectionObjs) {
    this.addStars(stars);
    this.updateConnections(stars, connectionObjs);
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
    this.renderer.setSize(w, h);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.renderer.render(this.scene, this.camera);
  }
}

function initStarInteractions(map) {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  map.canvas.addEventListener('mousemove', (event) => {
    if (selectedStarData) return;
    const rect = map.canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, map.camera);
    const intersects = raycaster.intersectObjects(map.starGroup.children, true);
    if (intersects.length > 0) {
      const intersect = intersects[0];
      let index;
      if (intersect.object instanceof THREE.InstancedMesh) {
        index = intersect.instanceId;
      } else {
        index = map.starGroup.children.indexOf(intersect.object);
      }
      if (index !== undefined && map.starObjects[index]) {
        showTooltip(event.clientX, event.clientY, map.starObjects[index]);
      }
    } else {
      hideTooltip();
    }
  });

  map.canvas.addEventListener('click', (event) => {
    const tooltip = document.getElementById('tooltip');
    if (tooltip) {
      const tRect = tooltip.getBoundingClientRect();
      if (event.clientX >= tRect.left && event.clientX <= tRect.right &&
          event.clientY >= tRect.top && event.clientY <= tRect.bottom) {
        return;
      }
    }
    const rect = map.canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, map.camera);
    const intersects = raycaster.intersectObjects(map.starGroup.children, true);
    let clickedStar = null;
    if (intersects.length > 0) {
      const intersect = intersects[0];
      let index;
      if (intersect.object instanceof THREE.InstancedMesh) {
        index = intersect.instanceId;
      } else {
        index = map.starGroup.children.indexOf(intersect.object);
      }
      if (index !== undefined && map.starObjects[index]) {
        clickedStar = map.starObjects[index];
      }
    }
    if (clickedStar) {
      selectedStarData = clickedStar;
      showTooltip(event.clientX, event.clientY, clickedStar);
      updateSelectedStarHighlight();
    } else {
      selectedStarData = null;
      updateSelectedStarHighlight();
      hideTooltip();
    }
  });
}

function updateSelectedStarHighlight() {
  if (selectedHighlightTrue) {
    trueCoordinatesMap.scene.remove(selectedHighlightTrue);
    selectedHighlightTrue = null;
  }
  if (selectedHighlightGlobe) {
    globeMap.scene.remove(selectedHighlightGlobe);
    selectedHighlightGlobe = null;
  }
  if (selectedHighlightMollweide) {
    mollweideMap.scene.remove(selectedHighlightMollweide);
    selectedHighlightMollweide = null;
  }
  if (!selectedStarData) return;
  let posTrue = selectedStarData.truePosition ? selectedStarData.truePosition : new THREE.Vector3(selectedStarData.x_coordinate, selectedStarData.y_coordinate, selectedStarData.z_coordinate);
  let radius = (selectedStarData.displaySize || 2) * 0.2 * 1.2;
  const highlightGeom = new THREE.SphereGeometry(radius, 16, 16);
  const highlightMat = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
  selectedHighlightTrue = new THREE.Mesh(highlightGeom, highlightMat);
  selectedHighlightTrue.position.copy(posTrue);
  trueCoordinatesMap.scene.add(selectedHighlightTrue);

  let posGlobe = selectedStarData.spherePosition ? selectedStarData.spherePosition : projectStarGlobe(selectedStarData);
  let radiusGlobe = (selectedStarData.displaySize || 2) * 0.2 * 1.2;
  const highlightGeomGlobe = new THREE.SphereGeometry(radiusGlobe, 16, 16);
  const highlightMatGlobe = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
  selectedHighlightGlobe = new THREE.Mesh(highlightGeomGlobe, highlightMatGlobe);
  selectedHighlightGlobe.position.copy(posGlobe);
  globeMap.scene.add(selectedHighlightGlobe);

  let posMoll = selectedStarData.mollweidePosition ? selectedStarData.mollweidePosition : projectStarMollweide(selectedStarData);
  let radiusMoll = (selectedStarData.displaySize || 2) * 0.4 * 1.2;
  const highlightGeomMoll = new THREE.SphereGeometry(radiusMoll, 16, 16);
  const highlightMatMoll = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
  selectedHighlightMollweide = new THREE.Mesh(highlightGeomMoll, highlightMatMoll);
  selectedHighlightMollweide.position.copy(posMoll);
  mollweideMap.scene.add(selectedHighlightMollweide);
}

function updateMollweideView() {
  if (!currentFilteredStars || currentFilteredStars.length === 0) return;
  currentFilteredStars.forEach(star => {
    updateMollweidePosition(star);
  });

  mollweideMap.addStars(currentFilteredStars);
  mollweideMap.updateStarPositions(currentFilteredStars);
  mollweideMap.updateConnectionPositions(currentFilteredStars, currentConnections);
  mollweideMap.labelManager.refreshLabels(currentFilteredStars);

  if (showConstellationBoundariesFlag) {
    if (constellationLinesMoll.length === 0) {
      constellationLinesMoll = createConstellationBoundariesForMollweide();
      constellationLinesMoll.forEach(l => mollweideMap.scene.add(l));
    } else {
      constellationLinesMoll.forEach(l => updateConstellationBoundariesForMollweide(l));
    }
  }
  if (showConstellationNamesFlag) {
    constellationLabelsMoll.forEach(lbl => mollweideMap.scene.remove(lbl));
    constellationLabelsMoll = createConstellationLabelsForMollweide();
    constellationLabelsMoll.forEach(lbl => mollweideMap.scene.add(lbl));
  }
  if (showConstellationOverlayFlag) {
    constellationOverlayMoll.forEach(mesh => mollweideMap.scene.remove(mesh));
    constellationOverlayMoll = createConstellationOverlayForMollweide();
    constellationOverlayMoll.forEach(mesh => mollweideMap.scene.add(mesh));
  }
  if (showCloudsFlag) {
    const form = document.getElementById('filters-form');
    const cloudFiles = new FormData(form).getAll('dust-clouds');
    updateCloudsOverlay(cachedStars, mollweideMap.scene, 'Mollweide', cloudFiles);
  }
  if (enableIsolationFilterFlag && isolationOverlay) {
    if (typeof isolationOverlay.refreshMollweide === 'function') {
      isolationOverlay.refreshMollweide();
    }
  }
  if (enableDensityFilterFlag && densityOverlay) {
    if (typeof densityOverlay.refreshMollweide === 'function') {
      densityOverlay.refreshMollweide();
    }
  }
}
window.updateMollweideView = updateMollweideView;

async function main() {
  const loader = document.getElementById('loader');
  loader.classList.remove('hidden');
  try {
    cachedStars = await loadStarData();
    if (!cachedStars.length) throw new Error('No star data available');
    await setupFilterUI(cachedStars);
    const debouncedApplyFilters = debounce(buildAndApplyFilters, 150);
    const form = document.getElementById('filters-form');
    if (form) {
      form.addEventListener('change', debouncedApplyFilters);
    }
    trueCoordinatesMap = new MapManager({ canvasId: 'map3D', mapType: 'TrueCoordinates' });
    globeMap = new MapManager({ canvasId: 'sphereMap', mapType: 'Globe' });
    mollweideMap = new MapManager({ canvasId: 'mollweideMap', mapType: 'Mollweide' });
    window.trueCoordinatesMap = trueCoordinatesMap;
    window.globeMap = globeMap;
    window.mollweideMap = mollweideMap;
    cachedStars.forEach(star => {
      star.spherePosition = projectStarGlobe(star);
      star.truePosition = getStarTruePosition(star);
      precalcMollweideData(star);
      updateMollweidePosition(star);
    });
    const globeGrid = createGlobeGrid(100, { color: 0x444444, opacity: 0.2, lineWidth: 1 });
    globeMap.scene.add(globeGrid);
    buildAndApplyFilters();
    initStarInteractions(trueCoordinatesMap);
    initStarInteractions(globeMap);
    initStarInteractions(mollweideMap);
    loader.classList.add('hidden');
  } catch (err) {
    console.error('Error initializing starmap:', err);
    alert('Initialization failed. Check console for details.');
    loader.classList.add('hidden');
  }
}

window.onload = main;
