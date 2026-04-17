import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { ThreeDControls, TwoDControls } from '../render/interactions/cameraControls.js';
import { LabelManager } from '../features/labels/labelManager.js';
import { requestRenderIfAvailable } from '../shared/renderScheduler.js';
import { getStarCoordinates } from '../shared/starUtils.js';
import {
  EQUIRECT_WIDTH,
  EQUIRECT_HEIGHT,
  raDecToUV,
  getStarEquirectangularPosition,
  spherePositionToUv,
  normalizeRightAscension,
  splitWrappedUvSegment,
  sampleGreatCircleUvFromVectors,
  sampleGreatCircleUvFromRaDec
} from '../shared/uvUtils.js';
import { loadConstellationCenters, loadConstellationFullNames, getConstellationFullNames } from '../features/constellations/constellationDataService.js';
import { getConstellationLabelAnchors } from '../features/constellations/constellationLabelPlacement.js';
import { applyCanvasConstellationLabelStyle, constellationLineCss } from '../features/constellations/constellationStyle.js';
import { computeConstellationColorMapping } from '../features/constellations/constellationOverlayMeshes.js';
import { galacticToEquatorial, eclipticToEquatorial } from '../features/planes/planeDefinitions.js';
import { hashString, mixHash } from '../shared/hashUtils.js';
import { GLOBE_RADIUS, ATLAS_WIDTH, ATLAS_HEIGHT } from '../shared/constants.js';
import {
  drawWrappedCircle,
  strokeUvSegment,
  splitWrappedSegment,
  fillProjectedMesh,
  fillWrappedTriangle
} from './uvAtlasDrawing.js';
import { getLabelPriority, computeUvLabelPlacement, LabelSpatialIndex } from './uvLabelPlacement.js';

const PLANE_WIDTH = EQUIRECT_WIDTH;
const PLANE_HEIGHT = EQUIRECT_HEIGHT;
const TAU = Math.PI * 2;

function createHiddenPointsMaterial() {
  return new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.35,
    transparent: true,
    opacity: 0,
    depthWrite: false
  });
}

function rgbaFromHex(hex, alpha = 1) {
  const color = new THREE.Color(hex || '#ffffff');
  return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${alpha})`;
}

function readNumberInput(id, fallback) {
  const el = document.getElementById(id);
  if (!el) return fallback;
  const parsed = Number.parseFloat(el.value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function hashNumber(value, precision = 1000) {
  return Number.isFinite(value) ? Math.round(value * precision) : 0;
}

function getStarRenderKey(star) {
  return star?.starId || star?.Source_id || star?.HIP_number || `${star?.Common_name_of_the_star || 'star'}|${star?.RA_in_degrees}|${star?.DEC_in_degrees}`;
}

function getConnectionRenderKey(connection) {
  return connection?.pairKey || `${getStarRenderKey(connection?.starA)}|${getStarRenderKey(connection?.starB)}`;
}

function createLayerCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_WIDTH;
  canvas.height = ATLAS_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('2D canvas context unavailable');
  }
  return { canvas, ctx };
}

async function loadConstellationBoundaries() {
  const response = await fetch('./constellation_boundaries.json');
  if (!response.ok) throw new Error('Failed to load constellation boundary data');
  return response.json();
}

export class UVMapManager {
  constructor({ canvasId, mapType, state }) {
    this.canvas = document.getElementById(canvasId);
    this.mapType = mapType;
    this.state = state;
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.starOpacity = 1;
    this.connectionOpacity = 0.5;
    this.labelOpacity = 1;
    this.starObjects = [];
    this.starGroup = new THREE.Group();
    this.scene.add(this.starGroup);
    this.labelManager = new LabelManager(mapType, this.scene);
    this.labelManager.setLabelOpacity(this.labelOpacity);
    this.boundariesPromise = null;
    this.boundaryData = null;
    this.constellationMetaPromise = null;
    this.sourceGlobeScene = null;

    this.atlasCanvas = document.createElement('canvas');
    this.atlasCanvas.width = ATLAS_WIDTH;
    this.atlasCanvas.height = ATLAS_HEIGHT;
    this.atlasCtx = this.atlasCanvas.getContext('2d');
    this.atlasTexture = new THREE.CanvasTexture(this.atlasCanvas);
    this.atlasTexture.wrapS = THREE.RepeatWrapping;
    this.atlasTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.atlasTexture.minFilter = THREE.LinearFilter;
    this.atlasTexture.magFilter = THREE.LinearFilter;
    this.atlasTexture.generateMipmaps = true;
    this.atlasTexture.needsUpdate = true;
    this.baseLayer = createLayerCanvas();
    this.featureLayer = createLayerCanvas();
    this.starLayer = createLayerCanvas();
    this.labelLayer = createLayerCanvas();
    this.layerSignatures = {
      features: '',
      stars: '',
      labels: '',
      interaction: ''
    };
    this.redrawBaseLayer();

    if (mapType === 'Equirectangular') {
      const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
      this.frustumSize = 130;
      this.camera = new THREE.OrthographicCamera(
        (-this.frustumSize * aspect) / 2,
        (this.frustumSize * aspect) / 2,
        this.frustumSize / 2,
        -this.frustumSize / 2,
        -1000,
        1000
      );
      this.camera.position.set(0, 0, 10);
      this.controls = new TwoDControls(this.camera, this.renderer.domElement, {
        panSpeed: 0.3,
        minZoom: 0.5,
        maxZoom: 12
      });
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(PLANE_WIDTH, PLANE_HEIGHT),
        new THREE.MeshBasicMaterial({ map: this.atlasTexture, transparent: true })
      );
      plane.renderOrder = 0;
      this.surfaceMesh = plane;
      this.scene.add(plane);
    } else {
      this.camera = new THREE.PerspectiveCamera(60, this.canvas.clientWidth / this.canvas.clientHeight, 0.1, 10000);
      this.camera.position.set(0, 0, 220);
      this.controls = new ThreeDControls(this.camera, this.renderer.domElement, {
        minDistance: 120,
        maxDistance: 700,
        target: new THREE.Vector3(0, 0, 0)
      });
      this.scene.add(new THREE.AmbientLight(0xffffff, 0.85));
      const pointLight = new THREE.PointLight(0xffffff, 0.6);
      pointLight.position.set(160, 140, 220);
      this.scene.add(pointLight);
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(GLOBE_RADIUS, 96, 64),
        new THREE.MeshBasicMaterial({ map: this.atlasTexture, side: THREE.FrontSide })
      );
      sphere.renderOrder = 0;
      this.surfaceMesh = sphere;
      this.scene.add(sphere);
    }

    this.scene.add(this.camera);
    window.addEventListener('resize', () => this.onResize(), false);
  }

  setLegacySourceScene(scene) {
    this.sourceGlobeScene = scene;
  }

  async ensureConstellationMeta() {
    if (this.constellationMetaPromise) return this.constellationMetaPromise;
    this.constellationMetaPromise = Promise.all([
      loadConstellationCenters(),
      loadConstellationFullNames()
    ]).catch(err => {
      console.warn('UV constellation metadata loading failed:', err);
    });
    return this.constellationMetaPromise;
  }

  ensureBoundaryData() {
    if (this.boundaryData) return Promise.resolve(this.boundaryData);
    if (!this.boundariesPromise) {
      this.boundariesPromise = loadConstellationBoundaries()
        .then(data => {
          this.boundaryData = data;
          return data;
        })
        .catch(err => {
          console.warn('UV boundary loading failed:', err);
          this.boundaryData = [];
          return this.boundaryData;
        });
    }
    return this.boundariesPromise;
  }

  setStarOpacity(opacity) {
    this.starOpacity = opacity;
    this.redrawLastState();
  }

  setConnectionOpacity(opacity) {
    this.connectionOpacity = opacity;
    this.redrawLastState();
  }

  setLabelOpacity(opacity) {
    this.labelOpacity = opacity;
    this.labelManager.setLabelOpacity(opacity);
    this.redrawLastState();
  }

  redrawBaseLayer() {
    const ctx = this.baseLayer.ctx;
    ctx.clearRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);
    this.drawGraticule(ctx);
  }

  redrawFeatureLayer(connections) {
    const ctx = this.featureLayer.ctx;
    ctx.clearRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);
    this.drawConstellationOverlay(ctx);
    this.drawDensityOverlay(ctx);
    this.drawIsolationOverlay(ctx);
    this.drawCloudDensityOverlay(ctx);
    this.drawCloudsOverlay(ctx);
    this.drawPlanes(ctx);
    if (this.state.showConstellationBoundariesFlag && Array.isArray(this.boundaryData)) {
      this.drawConstellationBoundaries(ctx, this.boundaryData);
    }
    this.drawConnections(ctx, connections || []);
  }

  redrawStarLayer(stars) {
    const ctx = this.starLayer.ctx;
    ctx.clearRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);
    this.drawStars(ctx, stars || []);
  }

  redrawLabelLayer(stars) {
    const ctx = this.labelLayer.ctx;
    ctx.clearRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);
    this.drawConstellationNames(ctx);
    this.drawStarLabels(ctx, stars || []);
  }

  composeAtlas() {
    const ctx = this.atlasCtx;
    ctx.clearRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);
    ctx.drawImage(this.baseLayer.canvas, 0, 0);
    ctx.drawImage(this.featureLayer.canvas, 0, 0);
    ctx.drawImage(this.starLayer.canvas, 0, 0);
    ctx.drawImage(this.labelLayer.canvas, 0, 0);
    this.atlasTexture.needsUpdate = true;
  }

  getSelectedFormValues(name) {
    const form = document.getElementById('filters-form');
    if (!form) return '';
    return new FormData(form).getAll(name).join('|');
  }

  buildStarTopologySignature(stars) {
    let hash = 2166136261;
    (stars || []).forEach(star => {
      hash = mixHash(hash, hashString(getStarRenderKey(star)));
    });
    return `${stars?.length || 0}:${hash}`;
  }

  buildStarLayerSignature(stars) {
    let hash = mixHash(2166136261, hashNumber(this.starOpacity));
    (stars || []).forEach(star => {
      hash = mixHash(hash, hashString(getStarRenderKey(star)));
      hash = mixHash(hash, hashString(star.displayColor || '#ffffff'));
      hash = mixHash(hash, hashNumber(star.displaySize ?? 1, 100));
    });
    return `${stars?.length || 0}:${hash}`;
  }

  buildLabelLayerSignature(stars) {
    let hash = mixHash(2166136261, hashNumber(this.labelOpacity));
    hash = mixHash(hash, this.state.showConstellationNamesFlag ? 1 : 0);
    hash = mixHash(hash, hashNumber(readNumberInput('constellation-name-opacity-slider', 80), 10));
    (stars || []).forEach(star => {
      hash = mixHash(hash, hashString(getStarRenderKey(star)));
      hash = mixHash(hash, hashString(star.displayName || ''));
      hash = mixHash(hash, hashNumber(star.displayLabelSize ?? star.displaySize ?? 1, 100));
    });
    return `${stars?.length || 0}:${hash}`;
  }

  buildFeatureLayerSignature(connections) {
    let hash = 2166136261;
    hash = mixHash(hash, this.state.showConstellationOverlayFlag ? 1 : 0);
    hash = mixHash(hash, this.state.showConstellationBoundariesFlag ? 1 : 0);
    hash = mixHash(hash, this.state.enableDensityFilterFlag ? 1 : 0);
    hash = mixHash(hash, this.state.enableIsolationFilterFlag ? 1 : 0);
    hash = mixHash(hash, this.state.showCloudsFlag ? 1 : 0);
    hash = mixHash(hash, this.state.showCloudDensityFlag ? 1 : 0);
    hash = mixHash(hash, this.state.showGalacticPlaneFlag ? 1 : 0);
    hash = mixHash(hash, this.state.showEclipticPlaneFlag ? 1 : 0);
    hash = mixHash(hash, this.state.showCelestialEquatorFlag ? 1 : 0);
    hash = mixHash(hash, hashNumber(this.connectionOpacity));
    hash = mixHash(hash, hashNumber(readNumberInput('connection-width-slider', 5), 10));
    hash = mixHash(hash, hashNumber(readNumberInput('connection-label-size-slider', 1), 10));
    hash = mixHash(hash, hashNumber(readNumberInput('min-distance-slider', 0), 10));
    hash = mixHash(hash, hashNumber(readNumberInput('max-distance-slider', 20), 10));
    hash = mixHash(hash, hashNumber(readNumberInput('density-slider', 10), 10));
    hash = mixHash(hash, hashNumber(readNumberInput('density-tolerance-slider', 0), 10));
    hash = mixHash(hash, hashNumber(readNumberInput('density-bottom-slider', 10), 10));
    hash = mixHash(hash, hashNumber(readNumberInput('density-top-slider', 10), 10));
    hash = mixHash(hash, hashNumber(readNumberInput('isolation-slider', 5), 10));
    hash = mixHash(hash, hashNumber(readNumberInput('isolation-tolerance-slider', 0), 10));
    hash = mixHash(hash, hashNumber(readNumberInput('plane-opacity-slider', 50), 10));
    hash = mixHash(hash, hashNumber(readNumberInput('constellation-line-opacity-slider', 40), 10));
    hash = mixHash(hash, hashNumber(readNumberInput('constellation-line-width-slider', 1), 10));
    hash = mixHash(hash, hashNumber(readNumberInput('cloud-opacity-slider', 100), 10));
    hash = mixHash(hash, hashNumber(readNumberInput('cloud-density-radius-slider', 5), 10));
    hash = mixHash(hash, hashNumber(readNumberInput('cloud-density-opacity-slider', 100), 10));
    hash = mixHash(hash, hashNumber(this.state.densityOverlay?.revision ?? 0, 1));
    hash = mixHash(hash, hashNumber(this.state.isolationOverlay?.revision ?? 0, 1));
    hash = mixHash(hash, hashString(this.getSelectedFormValues('dust-clouds')));
    hash = mixHash(hash, hashString(this.getSelectedFormValues('dust-density-clouds')));
    (connections || []).forEach(connection => {
      hash = mixHash(hash, hashString(getConnectionRenderKey(connection)));
      hash = mixHash(hash, hashString(connection.starA?.displayColor || ''));
      hash = mixHash(hash, hashString(connection.starB?.displayColor || ''));
    });
    return `${connections?.length || 0}:${hash}`;
  }

  redrawLastState() {
    if (this.lastStars && this.lastConnections) {
      this.updateMap(this.lastStars, this.lastConnections);
    }
  }

  async updateMap(stars, connectionObjs) {
    this.lastStars = stars;
    this.lastConnections = connectionObjs;
    await Promise.all([this.ensureBoundaryData(), this.ensureConstellationMeta()]);
    const safeStars = stars || [];
    const safeConnections = connectionObjs || [];
    const featureSignature = this.buildFeatureLayerSignature(safeConnections);
    const starSignature = this.buildStarLayerSignature(safeStars);
    const labelSignature = this.buildLabelLayerSignature(safeStars);
    const interactionSignature = this.buildStarTopologySignature(safeStars);

    let atlasDirty = false;
    if (this.layerSignatures.features !== featureSignature) {
      this.redrawFeatureLayer(safeConnections);
      this.layerSignatures.features = featureSignature;
      atlasDirty = true;
    }
    if (this.layerSignatures.stars !== starSignature) {
      this.redrawStarLayer(safeStars);
      this.layerSignatures.stars = starSignature;
      atlasDirty = true;
    }
    if (this.layerSignatures.labels !== labelSignature) {
      this.redrawLabelLayer(safeStars);
      this.layerSignatures.labels = labelSignature;
      atlasDirty = true;
    }
    if (atlasDirty) {
      this.composeAtlas();
    }

    if (this.layerSignatures.interaction !== interactionSignature) {
      this.updateInteractionGeometry(safeStars);
      this.layerSignatures.interaction = interactionSignature;
    }
    requestRenderIfAvailable();
  }

  drawAtlas(stars, connectionObjs) {
    const safeStars = stars || [];
    const safeConnections = connectionObjs || [];
    this.lastStars = safeStars;
    this.lastConnections = safeConnections;
    this.redrawBaseLayer();
    this.redrawFeatureLayer(safeConnections);
    this.redrawStarLayer(safeStars);
    this.redrawLabelLayer(safeStars);
    this.composeAtlas();
    this.updateInteractionGeometry(safeStars);
    this.layerSignatures.features = this.buildFeatureLayerSignature(safeConnections);
    this.layerSignatures.stars = this.buildStarLayerSignature(safeStars);
    this.layerSignatures.labels = this.buildLabelLayerSignature(safeStars);
    this.layerSignatures.interaction = this.buildStarTopologySignature(safeStars);
  }

  drawGraticule(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 12; i++) {
      const x = (i / 12) * ATLAS_WIDTH;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ATLAS_HEIGHT);
      ctx.stroke();
    }
    for (let i = 0; i <= 6; i++) {
      const y = (i / 6) * ATLAS_HEIGHT;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(ATLAS_WIDTH, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawConnections(ctx, connections) {
    const opacity = clamp01(this.connectionOpacity);
    const lineWidth = Math.max(1, readNumberInput('connection-width-slider', 5) * 0.45);
    const labelSize = readNumberInput('connection-label-size-slider', 1);
    connections.forEach(connection => {
      if (!connection?.starA || !connection?.starB) return;
      const startVec = connection.starA.spherePosition;
      const endVec = connection.starB.spherePosition;
      const uvPoints = (startVec && endVec)
        ? sampleGreatCircleUvFromVectors(startVec, endVec, 100, 24)
        : sampleGreatCircleUvFromRaDec(
            getStarCoordinates(connection.starA).ra,
            getStarCoordinates(connection.starA).dec,
            getStarCoordinates(connection.starB).ra,
            getStarCoordinates(connection.starB).dec,
            100,
            24
          );
      if (uvPoints.length < 2) return;
      ctx.save();
      ctx.strokeStyle = rgbaFromHex(connection.starA.displayColor || '#8fb5ff', opacity * 0.7);
      ctx.lineWidth = lineWidth;
      for (let i = 0; i < uvPoints.length - 1; i++) {
        splitWrappedUvSegment(uvPoints[i], uvPoints[i + 1]).forEach(([s, e]) => strokeUvSegment(ctx, s, e));
      }
      ctx.restore();

      // Distance label at midpoint
      if (connection.distance != null && opacity > 0.05 && labelSize > 0.01) {
        const midIdx = Math.floor(uvPoints.length / 2);
        const midUv = uvPoints[midIdx];
        if (midUv) {
          const distText = `${connection.distance < 10 ? connection.distance.toFixed(1) : connection.distance.toFixed(0)} ly`;
          const fontSize = Math.round(THREE.MathUtils.clamp(10 * labelSize, 6, 24));
          const labelColor = rgbaFromHex(
            connection.starA.displayColor || '#8fb5ff',
            opacity * 0.85
          );
          ctx.save();
          ctx.font = `${fontSize}px Oswald`;
          ctx.fillStyle = labelColor;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeStyle = `rgba(0,0,0,${opacity * 0.7})`;
          ctx.lineWidth = 2;
          const px = midUv.u * ATLAS_WIDTH;
          const py = midUv.v * ATLAS_HEIGHT;
          [-ATLAS_WIDTH, 0, ATLAS_WIDTH].forEach(shiftX => {
            const drawX = px + shiftX;
            if (drawX < -60 || drawX > ATLAS_WIDTH + 60) return;
            ctx.strokeText(distText, drawX, py);
            ctx.fillText(distText, drawX, py);
          });
          ctx.restore();
        }
      }
    });
  }

  drawStars(ctx, stars) {
    const opacity = clamp01(this.starOpacity);
    stars.forEach(star => {
      if (!star.displayVisible) return;
      const { ra, dec } = getStarCoordinates(star);
      const { u, v } = raDecToUV(ra, dec);
      const x = u * ATLAS_WIDTH;
      const y = v * ATLAS_HEIGHT;
      const radius = THREE.MathUtils.clamp((star.displaySize || 1) * 1.6, 1.2, 10);
      ctx.save();
      ctx.fillStyle = rgbaFromHex(star.displayColor || '#ffffff', opacity);
      drawWrappedCircle(ctx, x, y, radius);
      ctx.restore();
    });
  }

  drawStarLabels(ctx, stars) {
    const opacity = clamp01(this.labelOpacity);
    if (opacity <= 0.001) return;

    const visibleLabeledStars = (stars || []).filter(star => star.displayVisible && star.displayName);
    if (!visibleLabeledStars.length) return;

    const visibleStarAnchors = (stars || [])
      .filter(star => star.displayVisible)
      .map(star => {
        const starPos = getStarEquirectangularPosition(star);
        return {
          x: ((starPos.x / EQUIRECT_WIDTH) + 0.5) * ATLAS_WIDTH,
          y: (0.5 - (starPos.y / EQUIRECT_HEIGHT)) * ATLAS_HEIGHT,
          star
        };
      });

    const placedBoxes = [];
    const spatialIndex = new LabelSpatialIndex();
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    visibleLabeledStars
      .slice()
      .sort((a, b) => getLabelPriority(b) - getLabelPriority(a))
      .forEach(star => {
        const placement = computeUvLabelPlacement(ctx, star, visibleStarAnchors, placedBoxes, spatialIndex);
        if (!placement) return;

        const textColor = rgbaFromHex(star.displayColor || '#ffffff', opacity);
        const lineColor = rgbaFromHex(star.displayColor || '#ffffff', opacity * 0.2);
        ctx.font = `${placement.fontSize}px Oswald`;
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1.35;

        strokeUvSegment(
          ctx,
          placement.connector.startUv,
          placement.connector.endUv
        );

        [-ATLAS_WIDTH, 0, ATLAS_WIDTH].forEach(shiftX => {
          const drawX = placement.drawX + shiftX;
          if (drawX + placement.bounds.width < -24 || drawX > ATLAS_WIDTH + 24) return;
          ctx.fillStyle = textColor;
          ctx.strokeStyle = `rgba(0,0,0,${opacity * 0.85})`;
          ctx.lineWidth = 3;
          ctx.strokeText(star.displayName, drawX, placement.drawY);
          ctx.fillText(star.displayName, drawX, placement.drawY);
        });

        const box = {
          x: placement.bounds.x,
          y: placement.bounds.y,
          width: placement.bounds.width,
          height: placement.bounds.height,
          starX: placement.starPx.x,
          starY: placement.starPx.y
        };
        placedBoxes.push(box);
        spatialIndex.insert(box);
      });
    ctx.restore();
  }


  drawConstellationNames(ctx) {
    if (!this.state.showConstellationNamesFlag) return;
    const opacity = clamp01(readNumberInput('constellation-name-opacity-slider', 80) / 100);
    if (opacity <= 0.001) return;
    const centers = getConstellationLabelAnchors();
    const fullNames = getConstellationFullNames();
    ctx.save();
    applyCanvasConstellationLabelStyle(ctx, opacity);
    const fontSize = Math.round(THREE.MathUtils.clamp(ATLAS_WIDTH / 240, 18, 34));
    ctx.font = `300 ${fontSize}px "Cormorant Garamond", "Times New Roman", serif`;
    centers.forEach(center => {
      const { u, v } = raDecToUV(center.ra, center.dec);
      const x = u * ATLAS_WIDTH;
      const y = v * ATLAS_HEIGHT;
      const name = fullNames[center.name] || center.name;
      [-ATLAS_WIDTH, 0, ATLAS_WIDTH].forEach(shiftX => {
        const drawX = x + shiftX;
        if (drawX < -180 || drawX > ATLAS_WIDTH + 180) return;
        ctx.strokeText(name, drawX, y);
        ctx.fillText(name, drawX, y);
      });
    });
    ctx.restore();
  }

  drawConstellationBoundaries(ctx, boundaries) {
    const opacity = clamp01(readNumberInput('constellation-line-opacity-slider', 40) / 100);
    const lineWidth = Math.max(0.1, readNumberInput('constellation-line-width-slider', 1));
    if (opacity <= 0.001) return;
    ctx.save();
    ctx.strokeStyle = constellationLineCss(opacity);
    ctx.lineWidth = lineWidth;
    boundaries.forEach(boundary => {
      const points = Array.isArray(boundary?.raDecPolygon) ? boundary.raDecPolygon : [];
      if (points.length < 2) return;
      const closedPoints = points.map(point => ({
        ra: THREE.MathUtils.degToRad(point.ra),
        dec: THREE.MathUtils.degToRad(point.dec)
      }));
      for (let i = 0; i < closedPoints.length; i++) {
        const current = closedPoints[i];
        const next = closedPoints[(i + 1) % closedPoints.length];
        const uvPoints = sampleGreatCircleUvFromRaDec(current.ra, current.dec, next.ra, next.dec, 100, 12);
        for (let j = 0; j < uvPoints.length - 1; j++) {
          splitWrappedUvSegment(uvPoints[j], uvPoints[j + 1]).forEach(([s, e]) => strokeUvSegment(ctx, s, e));
        }
      }
    });
    ctx.restore();
  }

  drawConstellationOverlay(ctx) {
    if (!this.state.showConstellationOverlayFlag || !Array.isArray(this.state.constellationOverlayGlobe)) return;
    this.state.constellationOverlayGlobe.forEach(mesh => {
      const color = mesh?.material?.color ? `#${mesh.material.color.getHexString()}` : '#7aa2ff';
      const alpha = clamp01(mesh?.material?.opacity ?? 0.15);
      fillProjectedMesh(ctx, mesh, rgbaFromHex(color, alpha));
    });
  }

  drawDensityOverlay(ctx) {
    if (!this.state.enableDensityFilterFlag || !this.state.densityOverlay) return;
    const overlay = this.state.densityOverlay;
    const opacityFactor = clamp01(readNumberInput('density-opacity-slider', 100) / 100);
    if (opacityFactor <= 0.001) return;

    // Smooth heatmap pass (inspired by Mollweide heatmap canvas approach)
    ctx.save();
    ctx.filter = 'blur(6px)';
    (overlay.cubesData || []).forEach(cell => {
      if (!cell?.active) return;
      const uv = (cell.raRad != null && cell.decRad != null)
        ? raDecToUV(cell.raRad, cell.decRad)
        : spherePositionToUv(cell.globeMesh.position, 100);
      const x = uv.u * ATLAS_WIDTH;
      const y = uv.v * ATLAS_HEIGHT;
      const color = cell.tcMesh?.material?.color ? `#${cell.tcMesh.material.color.getHexString()}` : '#ff8844';
      const cellAlpha = cell.tcMesh?.material?.opacity ?? 0.15;
      const alpha = clamp01(cellAlpha * opacityFactor);
      const distRatio = cell.tcPos ? Math.min(1, cell.tcPos.length() / (overlay.maxDistance || 20)) : 0.5;
      const scale = THREE.MathUtils.lerp(12, 1, distRatio);
      const radius = Math.max(4, overlay.gridSize * scale * 0.6);
      const grd = ctx.createRadialGradient(x, y, 0, x, y, radius);
      grd.addColorStop(0, rgbaFromHex(color, alpha));
      grd.addColorStop(0.7, rgbaFromHex(color, alpha * 0.3));
      grd.addColorStop(1, rgbaFromHex(color, 0));
      ctx.fillStyle = grd;
      drawWrappedCircle(ctx, x, y, radius);
    });
    ctx.filter = 'none';

    // Draw adjacent lines between active cells
    (overlay.adjacentLines || []).forEach(({ cell1, cell2 }) => {
      if (!cell1?.active || !cell2?.active) return;
      const uv1 = (cell1.raRad != null) ? raDecToUV(cell1.raRad, cell1.decRad) : spherePositionToUv(cell1.globeMesh.position, 100);
      const uv2 = (cell2.raRad != null) ? raDecToUV(cell2.raRad, cell2.decRad) : spherePositionToUv(cell2.globeMesh.position, 100);
      const c1 = cell1.tcMesh?.material?.color;
      const c2 = cell2.tcMesh?.material?.color;
      const avgColor = c1 ? `#${c1.clone().lerp(c2 || c1, 0.5).getHexString()}` : '#ff8844';
      const avgAlpha = clamp01(((cell1.tcMesh?.material?.opacity ?? 0) + (cell2.tcMesh?.material?.opacity ?? 0)) / 2 * opacityFactor);
      ctx.strokeStyle = rgbaFromHex(avgColor, avgAlpha);
      ctx.lineWidth = 1.5;
      const segments = sampleGreatCircleUvFromRaDec(
        cell1.raRad ?? 0, cell1.decRad ?? 0,
        cell2.raRad ?? 0, cell2.decRad ?? 0,
        100, 12
      );
      for (let j = 0; j < segments.length - 1; j++) {
        splitWrappedUvSegment(segments[j], segments[j + 1]).forEach(([s, e]) => strokeUvSegment(ctx, s, e));
      }
    });
    ctx.restore();
  }

  drawIsolationOverlay(ctx) {
    if (!this.state.enableIsolationFilterFlag || !this.state.isolationOverlay) return;
    const overlay = this.state.isolationOverlay;

    // Draw adjacent lines between active cells first (behind cell dots)
    ctx.save();
    (overlay.adjacentLines || []).forEach(({ line, cell1, cell2 }) => {
      if (!cell1?.active || !cell2?.active) return;
      const uv1 = (cell1.raRad != null) ? raDecToUV(cell1.raRad, cell1.decRad) : spherePositionToUv(cell1.globeMesh.position, 100);
      const uv2 = (cell2.raRad != null) ? raDecToUV(cell2.raRad, cell2.decRad) : spherePositionToUv(cell2.globeMesh.position, 100);
      const c1 = cell1.tcMesh?.material?.color;
      const c2 = cell2.tcMesh?.material?.color;
      const avgColor = c1 ? `#${c1.clone().lerp(c2 || c1, 0.5).getHexString()}` : '#4f97ff';
      const avgAlpha = clamp01(((cell1.tcMesh?.material?.opacity ?? 0) + (cell2.tcMesh?.material?.opacity ?? 0)) / 2);
      ctx.strokeStyle = rgbaFromHex(avgColor, avgAlpha * 0.6);
      ctx.lineWidth = 1.2;
      const segments = sampleGreatCircleUvFromRaDec(
        cell1.raRad ?? 0, cell1.decRad ?? 0,
        cell2.raRad ?? 0, cell2.decRad ?? 0,
        100, 12
      );
      for (let j = 0; j < segments.length - 1; j++) {
        splitWrappedUvSegment(segments[j], segments[j + 1]).forEach(([s, e]) => strokeUvSegment(ctx, s, e));
      }
    });

    // Draw cell indicators
    (overlay.cubesData || []).forEach(cell => {
      if (!cell?.active) return;
      const uv = (cell.raRad != null && cell.decRad != null)
        ? raDecToUV(cell.raRad, cell.decRad)
        : spherePositionToUv(cell.globeMesh.position, 100);
      const x = uv.u * ATLAS_WIDTH;
      const y = uv.v * ATLAS_HEIGHT;
      const color = cell.tcMesh?.material?.color ? `#${cell.tcMesh.material.color.getHexString()}` : '#4f97ff';
      const alpha = clamp01(cell.tcMesh?.material?.opacity ?? 0.35);
      const distRatio = cell.tcPos ? Math.min(1, cell.tcPos.length() / (overlay.maxDistance || 20)) : 0.5;
      const scale = THREE.MathUtils.lerp(12, 1, distRatio);
      const radius = Math.max(3, overlay.gridSize * scale * 0.5);
      ctx.fillStyle = rgbaFromHex(color, alpha);
      drawWrappedCircle(ctx, x, y, radius);
    });
    ctx.restore();
  }

  drawCloudDensityOverlay(ctx) {
    if (!this.state.showCloudDensityFlag || !Array.isArray(this.state.cloudDensityOverlays)) return;
    const cdOpacity = clamp01(readNumberInput('cloud-density-opacity-slider', 100) / 100);
    if (cdOpacity <= 0.001) return;
    ctx.save();
    ctx.filter = 'blur(4px)';
    this.state.cloudDensityOverlays.forEach(overlay => {
      (overlay?.cubesData || []).forEach(cell => {
        if (!cell?.globeMesh) return;
        const color = cell.globeMesh.material?.color ? `#${cell.globeMesh.material.color.getHexString()}` : '#ff6600';
        const alpha = clamp01((cell.globeMesh.material?.opacity ?? 0.2) * cdOpacity);
        // Use native UV from globe position
        const uv = spherePositionToUv(cell.globeMesh.position, 100);
        const x = uv.u * ATLAS_WIDTH;
        const y = uv.v * ATLAS_HEIGHT;
        const radius = Math.max(6, 18);
        const grd = ctx.createRadialGradient(x, y, 0, x, y, radius);
        grd.addColorStop(0, rgbaFromHex(color, alpha));
        grd.addColorStop(0.6, rgbaFromHex(color, alpha * 0.4));
        grd.addColorStop(1, rgbaFromHex(color, 0));
        ctx.fillStyle = grd;
        drawWrappedCircle(ctx, x, y, radius);
      });
    });
    ctx.filter = 'none';
    ctx.restore();
  }

  drawCloudsOverlay(ctx) {
    const overlays = this.sourceGlobeScene?.userData?.cloudOverlays;
    if (!this.state.showCloudsFlag || !Array.isArray(overlays)) return;
    const cloudOpacity = clamp01(readNumberInput('cloud-opacity-slider', 100) / 100);
    if (cloudOpacity <= 0.001) return;
    overlays.forEach(lineSegments => {
      const geometry = lineSegments?.geometry;
      const pos = geometry?.getAttribute?.('position');
      if (!pos) return;
      const color = lineSegments.material?.color ? `#${lineSegments.material.color.getHexString()}` : '#ff6600';
      const baseAlpha = lineSegments.material?.opacity ?? 0.8;
      const alpha = clamp01(baseAlpha * cloudOpacity);
      ctx.save();
      ctx.strokeStyle = rgbaFromHex(color, alpha);
      ctx.lineWidth = 1.6;
      for (let i = 0; i <= pos.count - 2; i += 2) {
        const a = new THREE.Vector3().fromBufferAttribute(pos, i);
        const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
        splitWrappedSegment(spherePositionToUv(a, 100), spherePositionToUv(b, 100)).forEach(([s, e]) => strokeUvSegment(ctx, s, e));
      }
      ctx.restore();
    });
  }

  drawPlanes(ctx) {
    const planeOpacity = clamp01(readNumberInput('plane-opacity-slider', 50) / 100);
    if (planeOpacity <= 0.001) return;
    if (this.state.showGalacticPlaneFlag) {
      this.drawEquatorialCurve(ctx, angle => galacticToEquatorial(angle, 0), '#7effb2', planeOpacity);
    }
    if (this.state.showEclipticPlaneFlag) {
      this.drawEquatorialCurve(ctx, angle => eclipticToEquatorial(angle, 0), '#ffcb6b', planeOpacity);
    }
    if (this.state.showCelestialEquatorFlag) {
      this.drawEquatorialCurve(ctx, angle => ({ ra: normalizeRightAscension(angle), dec: 0 }), '#8fb5ff', planeOpacity);
    }
  }

  drawEquatorialCurve(ctx, curveFn, color, opacity) {
    ctx.save();
    ctx.strokeStyle = rgbaFromHex(color, opacity * 0.95);
    ctx.lineWidth = 2.25;
    const samples = 256;
    let prev = null;
    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * TAU;
      const current = raDecToUV(curveFn(t).ra, curveFn(t).dec);
      if (prev) {
        splitWrappedSegment(prev, current).forEach(([s, e]) => strokeUvSegment(ctx, s, e));
      }
      prev = current;
    }
    ctx.restore();
  }


  updateInteractionGeometry(stars) {
    while (this.starGroup.children.length) {
      const child = this.starGroup.children[0];
      this.starGroup.remove(child);
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }
    if (!stars?.length) {
      this.starObjects = [];
      return;
    }
    const positions = new Float32Array(stars.length * 3);
    stars.forEach((star, index) => {
      let pos;
      if (this.mapType === 'Equirectangular') {
        pos = getStarEquirectangularPosition(star);
      } else {
        pos = star.spherePosition || new THREE.Vector3();
      }
      positions[index * 3] = pos.x;
      positions[index * 3 + 1] = pos.y;
      positions[index * 3 + 2] = pos.z;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, createHiddenPointsMaterial());
    this.starGroup.add(points);
    this.starObjects = stars;
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
    this.renderer.setSize(width, height);
    requestRenderIfAvailable();
  }

  render() {
    if (!this.canvas.isConnected) return;
    this.renderer.render(this.scene, this.camera);
  }
}
