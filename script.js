// script.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { applyFilters, setupFilterUI, generateStellarClassFilters } from './filters/index.js';
import { createConnectionLines, mergeConnectionLines, setConnectionLineParams, buildWideLineGeometry } from './filters/connectionsFilter.js';
import { createConstellationBoundariesForGlobe, createConstellationLabelsForGlobe, createConstellationBoundariesForMollweide, updateConstellationBoundariesForMollweide, createConstellationLabelsForMollweide } from './filters/constellationFilter.js';
import { createConstellationOverlayForGlobe, createConstellationOverlayForMollweide } from './filters/constellationOverlayFilter.js';
import { initIsolationFilter, updateIsolationFilter } from './filters/isolationFilter.js';
import { initDensityFilter, updateDensityFilter } from './filters/densityFilter.js';
import { applyGlobeSurfaceFilter } from './filters/globeSurfaceFilter.js';
import {
  updateCloudsOverlay,
  updateMollweideCloudSegments
} from './filters/cloudsFilter.js';
import { createCloudDensityOverlay, updateCloudDensityOverlay } from './filters/cloudDensityFilter.js';
import {
  createGalacticPlaneMesh,
  createEclipticPlaneMesh,
  createCelestialEquatorMesh,
  createGalacticPlaneGlobe,
  createEclipticPlaneGlobe,
  createCelestialEquatorGlobe,
  createGalacticPlaneMollweide,
  updateGalacticPlaneMollweide,
  createEclipticPlaneMollweide,
  updateEclipticPlaneMollweide,
  createCelestialEquatorMollweide,
  updateCelestialEquatorMollweide,
  createGalacticDirectionLabelsGlobe,
  createGalacticDirectionLabelsMollweide,
  updateGalacticDirectionLabelsMollweide,
  createGalacticDirectionLabelsTrue
} from './filters/planesFilter.js';
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

const PRESET_KEY = 'astrography-presets';

function maybeSavePresets() {
  const chk = document.getElementById('enable-save-presets');
  if (chk && chk.checked) {
    savePresets();
  }
}

function savePresets() {
  const form = document.getElementById('filters-form');
  if (!form) return;
  const data = {};
  form.querySelectorAll('input, select, textarea').forEach(el => {
    if (!el.id) return;
    if (el.type === 'checkbox' || el.type === 'radio') {
      data[el.id] = el.checked;
    } else {
      data[el.id] = el.value;
    }
  });
  const edits = {
    starOffsets: Array.from(starLabelOffsets.entries()),
    starRotations: Array.from(starLabelRotations.entries()),
    starScales: Array.from(starLabelScales.entries()),
    constellationOffsets: Array.from(constellationLabelOffsets.entries()),
    galacticOffsets: Array.from(galacticLabelOffsets.entries())
  };
  const lineEdits = {
    removedSegments: Array.from(removedLineSegments),
    hiddenLines: Array.from(hiddenLineKeys)
  };
  const obj = { remember: true, form: data, edits, lineEdits };
  localStorage.setItem(PRESET_KEY, JSON.stringify(obj));
}

function loadPresets() {
  const str = localStorage.getItem(PRESET_KEY);
  if (!str) return;
  let obj;
  try {
    obj = JSON.parse(str);
  } catch {
    return;
  }
  const form = document.getElementById('filters-form');
  if (obj.remember) {
    const chk = document.getElementById('enable-save-presets');
    if (chk) chk.checked = true;
  }
  if (form && obj.form) {
    const data = obj.form;
    for (const [id, val] of Object.entries(data)) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (el.type === 'checkbox' || el.type === 'radio') {
        el.checked = val;
        el.dispatchEvent(new Event('change'));
      } else {
        el.value = val;
        el.dispatchEvent(new Event('input'));
      }
    }
  }
  if (obj.edits) {
    starLabelOffsets.clear();
    obj.edits.starOffsets.forEach(([id, off]) => starLabelOffsets.set(id, off));
    starLabelRotations.clear();
    obj.edits.starRotations.forEach(([id, rot]) => starLabelRotations.set(id, rot));
    starLabelScales.clear();
    obj.edits.starScales.forEach(([id, sc]) => starLabelScales.set(id, sc));
    constellationLabelOffsets.clear();
    obj.edits.constellationOffsets.forEach(([id, off]) => constellationLabelOffsets.set(id, off));
    galacticLabelOffsets.clear();
    obj.edits.galacticOffsets.forEach(([id, off]) => galacticLabelOffsets.set(id, off));
  }
  if (obj.lineEdits) {
    removedLineSegments.clear();
    (obj.lineEdits.removedSegments || []).forEach(k => removedLineSegments.add(k));
    hiddenLineKeys.clear();
    (obj.lineEdits.hiddenLines || []).forEach(k => hiddenLineKeys.add(k));
  }
}

function captureStellarClassState() {
  const state = {};
  const container = document.getElementById('stellar-class-container');
  if (!container) return state;
  container.querySelectorAll('input').forEach(el => {
    state[el.id] = el.type === 'checkbox' || el.type === 'radio' ? el.checked : el.value;
  });
  return state;
}

function restoreStellarClassState(state) {
  const container = document.getElementById('stellar-class-container');
  if (!container) return;
  Object.entries(state).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.type === 'checkbox' || el.type === 'radio') {
      el.checked = val;
    } else {
      el.value = val;
    }
    el.dispatchEvent(new Event('input'));
  });
}

function angleDiff(a, b) {
  let diff = a - b;
  diff = ((diff + Math.PI) % (Math.PI * 2)) - Math.PI;
  return diff;
}

function getStarId(star) {
  return (
    star.Common_name_of_the_star ||
    star.Common_name_of_the_star_system ||
    star.HD ||
    `${star.RA_in_degrees}_${star.DEC_in_degrees}`
  );
}

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

function createMollweideBorder(R = 100, thickness = 1.5, segments = 1024) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * 2 * Math.PI;
    points.push(new THREE.Vector3(2 * R * Math.cos(theta), R * Math.sin(theta), 0));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color: 0xaaaaaa,
    linewidth: thickness,
    depthTest: false,
    depthWrite: false
  });
  const line = new THREE.LineLoop(geometry, material);
  line.renderOrder = 1001;
  line.userData = { baseLineWidth: thickness };
  return line;
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

  const prevState = captureStellarClassState();
  generateStellarClassFilters(filters.filteredStars);
  restoreStellarClassState(prevState);

  const {
    filteredStars,
    connections,
    globeFilteredStars,
    globeConnections,
    mollweideFilteredStars,
    mollweideConnections,
    showConstellationBoundaries,
    showConstellationNames,
    showConstellationOverlay,
    globeOpaqueSurface,
    enableConnections,
    enableIsolationFilter,
    enableDensityFilter,
    isolation,
    isolationTolerance,
    density,
    densityTolerance,
    enableIsolationLabeling,
    enableDensityLabeling,
    minDistance,
    maxDistance,
    isolationGridSize,
    densityGridSize,
    densityLineWidth,
    densityFade,
    showClouds,
    showCloudDensity,
    cloudDensityRadius,
    cloudDensityOpacity,
    cloudOpacity,
    starOpacity,
    starNameOpacity,
    connectionOpacity,
    connectionWidth,
    connectionFade,
    constellationLineOpacity,
    constellationNameOpacity,
    planeOpacity,
    showGalacticPlane,
    showEclipticPlane,
    showCelestialEquator,
    isolationOverlay: returnedIsolationOverlay,
    densityOverlay: returnedDensityOverlay
  } = filters;

  showConstellationBoundariesFlag = showConstellationBoundaries;
  showConstellationNamesFlag = showConstellationNames;
  showConstellationOverlayFlag = showConstellationOverlay;
  enableIsolationFilterFlag = enableIsolationFilter;
  enableDensityFilterFlag = enableDensityFilter;
  showCloudsFlag = showClouds;
  showCloudDensityFlag = showCloudDensity;
  showGalacticPlaneFlag = showGalacticPlane;
  showEclipticPlaneFlag = showEclipticPlane;
  showCelestialEquatorFlag = showCelestialEquator;

  // store overlay references for external refresh calls
  isolationOverlay = returnedIsolationOverlay;
  densityOverlay = returnedDensityOverlay;

  currentFilteredStars = filteredStars;
  currentConnections = connections;
  currentGlobeFilteredStars = globeFilteredStars;
  currentGlobeConnections = globeConnections;
  currentMollweideFilteredStars = mollweideFilteredStars;
  currentMollweideConnections = mollweideConnections;

  currentGlobeFilteredStars.forEach(star => {
    star.spherePosition = projectStarGlobe(star);
  });
  currentFilteredStars.forEach(star => {
    star.truePosition = getStarTruePosition(star);
  });
  currentMollweideFilteredStars.forEach(star => {
    precalcMollweideData(star);
    updateMollweidePosition(star);
  });

  trueCoordinatesMap.setStarOpacity(starOpacity / 100);
  globeMap.setStarOpacity(starOpacity / 100);
  mollweideMap.setStarOpacity(starOpacity / 100);
  trueCoordinatesMap.setLabelOpacity(starNameOpacity / 100);
  globeMap.setLabelOpacity(starNameOpacity / 100);
  mollweideMap.setLabelOpacity(starNameOpacity / 100);
  trueCoordinatesMap.setConnectionOpacity(connectionOpacity / 100);
  globeMap.setConnectionOpacity(connectionOpacity / 100);
  mollweideMap.setConnectionOpacity(connectionOpacity / 100);
  setConnectionLineParams(connectionWidth, connectionFade);

  trueCoordinatesMap.connectionOpacity = connectionOpacity / 100;
  globeMap.connectionOpacity = connectionOpacity / 100;
  mollweideMap.connectionOpacity = connectionOpacity / 100;

  trueCoordinatesMap.updateMap(currentFilteredStars, currentConnections);
  trueCoordinatesMap.labelManager.refreshLabels(currentFilteredStars);
  globeMap.updateMap(currentGlobeFilteredStars, currentGlobeConnections);
  globeMap.labelManager.refreshLabels(currentGlobeFilteredStars);
  mollweideMap.addStars(currentMollweideFilteredStars);
  mollweideMap.updateStarPositions(currentMollweideFilteredStars);
  mollweideMap.updateConnections(
    currentMollweideFilteredStars,
    currentMollweideConnections,
    mollweideMap.connectionOpacity
  );
  mollweideMap.labelManager.refreshLabels(currentMollweideFilteredStars);
  registerMollweideEditableLabels();

  removeConstellationObjectsFromGlobe();
  removeConstellationOverlayObjectsFromGlobe();

  if (showConstellationBoundaries) {
    constellationLinesGlobe = createConstellationBoundariesForGlobe(constellationLineOpacity / 100);
    constellationLinesGlobe.forEach(ln => globeMap.scene.add(ln));
    constellationLinesMoll = createConstellationBoundariesForMollweide(constellationLineOpacity / 100);
    constellationLinesMoll.forEach(ln => { mollweideMap.scene.add(ln); applyStoredLineEdits(ln); });
  }
  if (showConstellationNames) {
    constellationLabelsGlobe = createConstellationLabelsForGlobe(constellationNameOpacity / 100);
    constellationLabelsGlobe.forEach(lbl => globeMap.scene.add(lbl));
    constellationLabelsMoll = createConstellationLabelsForMollweide(constellationNameOpacity / 100);
    constellationLabelsMoll.forEach(lbl => mollweideMap.scene.add(lbl));
    registerMollweideEditableLabels();
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
    await updateCloudsOverlay(cachedStars, trueCoordinatesMap.scene, 'TrueCoordinates', cloudDataFiles, cloudOpacity / 100);
    await updateCloudsOverlay(cachedStars, globeMap.scene, 'Globe', cloudDataFiles, cloudOpacity / 100);
    await updateCloudsOverlay(cachedStars, mollweideMap.scene, 'Mollweide', cloudDataFiles, cloudOpacity / 100);
  } else {
    await updateCloudsOverlay(cachedStars, trueCoordinatesMap.scene, 'TrueCoordinates', [], cloudOpacity / 100);
    await updateCloudsOverlay(cachedStars, globeMap.scene, 'Globe', [], cloudOpacity / 100);
    await updateCloudsOverlay(cachedStars, mollweideMap.scene, 'Mollweide', [], cloudOpacity / 100);
  }

  // --- Dust Cloud Density Overlay ---
  if (showCloudDensityFlag) {
    const form = document.getElementById('filters-form');
    const files = new FormData(form).getAll('dust-density-clouds');
    cloudDensityOverlays.forEach(ov => {
      ov.cubesData.forEach(c => {
        trueCoordinatesMap.scene.remove(c.tcMesh);
        globeMap.scene.remove(c.globeMesh);
        mollweideMap.scene.remove(c.mollweideMesh);
      });
      mollweideMap.scene.remove(ov.textureMesh);
    });
    cloudDensityOverlays = [];
    for (const f of files) {
      const ov = await createCloudDensityOverlay(minDistance, maxDistance, 2, f, cachedStars);
      updateCloudDensityOverlay(
        ov,
        trueCoordinatesMap.scene,
        globeMap.scene,
        mollweideMap.scene,
        cloudDensityRadius,
        cloudDensityOpacity / 100
      );
      cloudDensityOverlays.push(ov);
      mollweideMap.scene.add(ov.textureMesh);
    }
  } else {
    cloudDensityOverlays.forEach(ov => {
      ov.cubesData.forEach(c => {
        trueCoordinatesMap.scene.remove(c.tcMesh);
        globeMap.scene.remove(c.globeMesh);
        mollweideMap.scene.remove(c.mollweideMesh);
      });
      mollweideMap.scene.remove(ov.textureMesh);
    });
    cloudDensityOverlays = [];
  }

  applyPlanes(showGalacticPlane, showEclipticPlane, showCelestialEquator, planeOpacity / 100);

  applyGlobeSurface(globeOpaqueSurface);
  if (window.requestRender) window.requestRender();
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

function applyPlanes(showGal, showEcl, showEq, opacity = 0.5) {
  if (showGal) {
    if (!galacticPlaneTrue) {
      galacticPlaneTrue = createGalacticPlaneMesh(200, opacity);
      trueCoordinatesMap.scene.add(galacticPlaneTrue);
    }
    if (!galacticPlaneGlobe) {
      galacticPlaneGlobe = createGalacticPlaneGlobe(100, undefined, opacity);
      globeMap.scene.add(galacticPlaneGlobe);
    }
    if (!galacticPlaneMoll) {
      galacticPlaneMoll = createGalacticPlaneMollweide(undefined, opacity);
      mollweideMap.scene.add(galacticPlaneMoll);
    } else {
      updateGalacticPlaneMollweide(galacticPlaneMoll);
      galacticPlaneMoll.material.opacity = opacity;
    }
    galacticPlaneTrue.material.opacity = opacity;
    galacticPlaneGlobe.material.opacity = opacity;
    if (galacticDirectionLabelsTrue.length === 0) {
      galacticDirectionLabelsTrue = createGalacticDirectionLabelsTrue( undefined, opacity);
      galacticDirectionLabelsTrue.forEach(lbl => trueCoordinatesMap.scene.add(lbl));
    }
    if (galacticDirectionLabelsGlobe.length === 0) {
      galacticDirectionLabelsGlobe = createGalacticDirectionLabelsGlobe(undefined, opacity);
      galacticDirectionLabelsGlobe.forEach(lbl => globeMap.scene.add(lbl));
    }
    if (galacticDirectionLabelsMoll.length === 0) {
      galacticDirectionLabelsMoll = createGalacticDirectionLabelsMollweide(undefined, opacity);
      galacticDirectionLabelsMoll.forEach(lbl => mollweideMap.scene.add(lbl));
    } else {
      updateGalacticDirectionLabelsMollweide(galacticDirectionLabelsMoll);
      galacticDirectionLabelsMoll.forEach(lbl => { lbl.material.opacity = opacity; });
    }
  } else {
    if (galacticPlaneTrue) { trueCoordinatesMap.scene.remove(galacticPlaneTrue); galacticPlaneTrue.geometry.dispose(); galacticPlaneTrue.material.dispose(); galacticPlaneTrue = null; }
    if (galacticPlaneGlobe) { globeMap.scene.remove(galacticPlaneGlobe); galacticPlaneGlobe.geometry.dispose(); galacticPlaneGlobe.material.dispose(); galacticPlaneGlobe = null; }
    if (galacticPlaneMoll) { mollweideMap.scene.remove(galacticPlaneMoll); galacticPlaneMoll.geometry.dispose(); galacticPlaneMoll.material.dispose(); galacticPlaneMoll = null; }
    galacticDirectionLabelsTrue.forEach(lbl => trueCoordinatesMap.scene.remove(lbl));
    galacticDirectionLabelsTrue = [];
    galacticDirectionLabelsGlobe.forEach(lbl => globeMap.scene.remove(lbl));
    galacticDirectionLabelsGlobe = [];
    galacticDirectionLabelsMoll.forEach(lbl => mollweideMap.scene.remove(lbl));
    galacticDirectionLabelsMoll = [];
  }

  if (showEcl) {
    if (!eclipticPlaneTrue) {
      eclipticPlaneTrue = createEclipticPlaneMesh(200, opacity);
      trueCoordinatesMap.scene.add(eclipticPlaneTrue);
    }
    if (!eclipticPlaneGlobe) {
      eclipticPlaneGlobe = createEclipticPlaneGlobe(100, undefined, opacity);
      globeMap.scene.add(eclipticPlaneGlobe);
    }
    if (!eclipticPlaneMoll) {
      eclipticPlaneMoll = createEclipticPlaneMollweide(undefined, opacity);
      mollweideMap.scene.add(eclipticPlaneMoll);
    } else {
      updateEclipticPlaneMollweide(eclipticPlaneMoll);
      eclipticPlaneMoll.material.opacity = opacity;
    }
    eclipticPlaneTrue.material.opacity = opacity;
    eclipticPlaneGlobe.material.opacity = opacity;
  } else {
    if (eclipticPlaneTrue) { trueCoordinatesMap.scene.remove(eclipticPlaneTrue); eclipticPlaneTrue.geometry.dispose(); eclipticPlaneTrue.material.dispose(); eclipticPlaneTrue = null; }
    if (eclipticPlaneGlobe) { globeMap.scene.remove(eclipticPlaneGlobe); eclipticPlaneGlobe.geometry.dispose(); eclipticPlaneGlobe.material.dispose(); eclipticPlaneGlobe = null; }
    if (eclipticPlaneMoll) { mollweideMap.scene.remove(eclipticPlaneMoll); eclipticPlaneMoll.geometry.dispose(); eclipticPlaneMoll.material.dispose(); eclipticPlaneMoll = null; }
  }

  if (showEq) {
    if (!celestialEquatorTrue) {
      celestialEquatorTrue = createCelestialEquatorMesh(200, opacity);
      trueCoordinatesMap.scene.add(celestialEquatorTrue);
    }
    if (!celestialEquatorGlobe) {
      celestialEquatorGlobe = createCelestialEquatorGlobe(100, undefined, opacity);
      globeMap.scene.add(celestialEquatorGlobe);
    }
    if (!celestialEquatorMoll) {
      celestialEquatorMoll = createCelestialEquatorMollweide(undefined, opacity);
      mollweideMap.scene.add(celestialEquatorMoll);
    } else {
      updateCelestialEquatorMollweide(celestialEquatorMoll);
      celestialEquatorMoll.material.opacity = opacity;
    }
    celestialEquatorTrue.material.opacity = opacity;
    celestialEquatorGlobe.material.opacity = opacity;
  } else {
    if (celestialEquatorTrue) { trueCoordinatesMap.scene.remove(celestialEquatorTrue); celestialEquatorTrue.geometry.dispose(); celestialEquatorTrue.material.dispose(); celestialEquatorTrue = null; }
    if (celestialEquatorGlobe) { globeMap.scene.remove(celestialEquatorGlobe); celestialEquatorGlobe.geometry.dispose(); celestialEquatorGlobe.material.dispose(); celestialEquatorGlobe = null; }
    if (celestialEquatorMoll) { mollweideMap.scene.remove(celestialEquatorMoll); celestialEquatorMoll.geometry.dispose(); celestialEquatorMoll.material.dispose(); celestialEquatorMoll = null; }
  }
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

function createStarTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
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
    if (window.requestRender) window.requestRender();
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
    if (window.requestRender) window.requestRender();
  }

  updateConnectionPositions(stars, connectionObjs) {
    if (!this.connectionGroup) return;
    this.updateConnections(stars, connectionObjs, this.connectionOpacity);
    if (window.requestRender) window.requestRender();
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
    if (window.requestRender) window.requestRender();
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
window.requestRender = requestRender;

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
      maybeSavePresets();
    });
    update();
  }

  handle('map-true', trueContainer, trueCoordinatesMap);
  handle('map-globe', globeContainer, globeMap);
  handle('map-mollweide', mollContainer, mollweideMap);
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
      if (intersect.object instanceof THREE.Points) {
        index = intersect.index;
      } else if (intersect.object instanceof THREE.InstancedMesh) {
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
      if (intersect.object instanceof THREE.Points) {
        index = intersect.index;
      } else if (intersect.object instanceof THREE.InstancedMesh) {
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
  if (window.requestRender) window.requestRender();
}

async function updateMollweideView() {
  if (!currentMollweideFilteredStars || currentMollweideFilteredStars.length === 0) return;
  currentMollweideFilteredStars.forEach(star => {
    updateMollweidePosition(star);
  });

  mollweideMap.addStars(currentMollweideFilteredStars);
  mollweideMap.updateStarPositions(currentMollweideFilteredStars);
  mollweideMap.updateConnectionPositions(currentMollweideFilteredStars, currentMollweideConnections);
  mollweideMap.labelManager.refreshLabels(currentMollweideFilteredStars);
  registerMollweideEditableLabels();

  if (showConstellationBoundariesFlag) {
    if (constellationLinesMoll.length === 0) {
      constellationLinesMoll = createConstellationBoundariesForMollweide();
      constellationLinesMoll.forEach(l => { mollweideMap.scene.add(l); applyStoredLineEdits(l); });
    } else {
      constellationLinesMoll.forEach(l => updateConstellationBoundariesForMollweide(l));
    }
  }
  if (showConstellationNamesFlag) {
    constellationLabelsMoll.forEach(lbl => mollweideMap.scene.remove(lbl));
    constellationLabelsMoll = createConstellationLabelsForMollweide();
    constellationLabelsMoll.forEach(lbl => mollweideMap.scene.add(lbl));
    registerMollweideEditableLabels();
  }
  if (showConstellationOverlayFlag) {
    constellationOverlayMoll.forEach(mesh => mollweideMap.scene.remove(mesh));
    constellationOverlayMoll = createConstellationOverlayForMollweide();
    constellationOverlayMoll.forEach(mesh => mollweideMap.scene.add(mesh));
  }
  if (showCloudsFlag && mollweideMap.scene.userData.cloudOverlays) {
    mollweideMap.scene.userData.cloudOverlays.forEach(line => {
      if (line.userData && line.userData.isMollweideCloud) {
        updateMollweideCloudSegments(line);
      }
    });
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
  if (showGalacticPlaneFlag && galacticPlaneMoll) {
    updateGalacticPlaneMollweide(galacticPlaneMoll);
    if (galacticDirectionLabelsMoll.length > 0) {
      updateGalacticDirectionLabelsMollweide(galacticDirectionLabelsMoll);
    }
  }
  if (showEclipticPlaneFlag && eclipticPlaneMoll) {
    updateEclipticPlaneMollweide(eclipticPlaneMoll);
  }
  if (showCelestialEquatorFlag && celestialEquatorMoll) {
    updateCelestialEquatorMollweide(celestialEquatorMoll);
  }
  if (window.requestRender) window.requestRender();
}
window.updateMollweideView = updateMollweideView;

function scaleMollweideSceneForExport(scale) {
  if (mollweideMap.points && mollweideMap.points.material.uniforms.cameraZoom) {
    mollweideMap.points.material.uniforms.cameraZoom.value *= scale;
  }
  mollweideMap.scene.traverse(obj => {
    if (obj.userData && obj.userData.baseWidth && obj.userData.points) {
      obj.geometry.dispose();
      obj.geometry = buildWideLineGeometry(obj.userData.points, obj.userData.baseWidth / scale);
    } else if (obj.userData && obj.userData.baseDashSize !== undefined && obj.material && obj.material.dashSize !== undefined) {
      obj.material.dashSize = obj.userData.baseDashSize / scale;
      if (obj.userData.baseGapSize !== undefined && obj.material.gapSize !== undefined) {
        obj.material.gapSize = obj.userData.baseGapSize / scale;
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
    } else if (obj.userData && obj.userData.baseDashSize !== undefined && obj.material && obj.material.dashSize !== undefined) {
      obj.material.dashSize = obj.userData.baseDashSize;
      if (obj.userData.baseGapSize !== undefined && obj.material.gapSize !== undefined) {
        obj.material.gapSize = obj.userData.baseGapSize;
      }
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

  if (cachedStars) {
    cachedStars.forEach(star => {
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
  maybeSavePresets();
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
  constellationLabelsMoll.forEach(sprite => {
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
  galacticDirectionLabelsMoll.forEach(sprite => {
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
    if (changed) posAttr.needsUpdate = true;
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
  constellationLinesMoll.forEach(l => editableLines.push(l));
  if (isolationOverlay && isolationOverlay.adjacentLines) {
    isolationOverlay.adjacentLines.forEach(o => editableLines.push(o.lineM));
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
        maybeSavePresets();
        return;
      }
    }
    editHistory.push({ type: 'toggleVisible', object: obj, prevVisible: obj.visible });
    obj.visible = false;
    const key = getLineKey(obj);
    if (key) hiddenLineKeys.add(key);
    requestRender();
    e.preventDefault();
    maybeSavePresets();
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
  maybeSavePresets();
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
    maybeSavePresets();
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
  maybeSavePresets();
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
  maybeSavePresets();
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
    loadPresets();
    const debouncedApplyFilters = debounce(buildAndApplyFilters, 150);
    if (form) {
      form.addEventListener('change', () => {
        debouncedApplyFilters();
        maybeSavePresets();
      });
    }
    const clearBtn = document.getElementById('clear-saved-presets');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        localStorage.removeItem(PRESET_KEY);
        window.location.reload();
      });
    }
    trueCoordinatesMap = new MapManager({ canvasId: 'map3D', mapType: 'TrueCoordinates' });
    globeMap = new MapManager({ canvasId: 'sphereMap', mapType: 'Globe' });
    mollweideMap = new MapManager({ canvasId: 'mollweideMap', mapType: 'Mollweide' });
    mapManagers.push(trueCoordinatesMap, globeMap, mollweideMap);
    window.trueCoordinatesMap = trueCoordinatesMap;
    window.globeMap = globeMap;
    window.mollweideMap = mollweideMap;
    cachedStars.forEach(star => {
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
    const globeGrid = createGlobeGrid(100, { color: 0x444444, opacity: 0.2, lineWidth: 1 });
    globeMap.scene.add(globeGrid);
    buildAndApplyFilters();
    initStarInteractions(trueCoordinatesMap);
    initStarInteractions(globeMap);
    initStarInteractions(mollweideMap);
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

window.onload = main;
