import * as THREE from '../vendor/three.js';
import { ThreeDControls, TwoDControls } from '../render/interactions/cameraControls.js';
import { LabelManager } from '../features/labels/labelManager.js';
import { clearObject3DChildren, disposeObject3D } from '../render/engine/renderUtils.js';
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
import {
  loadConstellationBoundaries,
  getConstellationBoundaries,
  loadConstellationCenters,
  loadConstellationFullNames,
  getConstellationFullNames
} from '../features/constellations/constellationDataService.js';
import { getConstellationLabelAnchors } from '../features/constellations/constellationLabelPlacement.js';
import { applyCanvasConstellationLabelStyle, constellationLineCss } from '../features/constellations/constellationStyle.js';
import { computeConstellationColorMapping } from '../features/constellations/constellationOverlayMeshes.js';
import { galacticToEquatorial, eclipticToEquatorial } from '../features/planes/planeDefinitions.js';
import { getViewpointStarId } from '../shared/viewpoint.js';
import { GLOBE_RADIUS, ATLAS_WIDTH, ATLAS_HEIGHT } from '../shared/constants.js';
import { configureRendererForCanvas } from '../shared/canvasSizing.js';
import {
  drawWrappedCircle,
  strokeUvSegment,
  splitWrappedSegment,
  fillProjectedMesh,
  fillWrappedTriangle
} from './uvAtlasDrawing.js';
import { getLabelPriority, computeUvLabelPlacement, LabelSpatialIndex } from './uvLabelPlacement.js';
import {
  buildFeatureLayerSignature,
  buildLabelLayerSignature,
  buildStarLayerSignature,
  buildStarTopologySignature
} from './uvLayerSignatures.js';
import { clamp01, createLayerCanvas, rgbaFromHex } from './uvCanvasLayers.js';
import {
  getAverageOverlayAlpha,
  getOverlayCellAlpha,
  getOverlayCellAtlasPoint,
  getOverlayCellColor,
  getOverlayCellRaDec,
  getScaledOverlayRadius
} from './uvOverlayCells.js';

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

export class UVMapManager {
  constructor({ canvasId, mapType, state }) {
    this.canvas = document.getElementById(canvasId);
    this.mapType = mapType;
    this.state = state;
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    const initialSize = configureRendererForCanvas(this.renderer, this.canvas);
    const initialAspect = initialSize.width / initialSize.height;
    this.starOpacity = 1;
    this.connectionOpacity = 0.5;
    this.labelOpacity = 1;
    this.starObjects = [];
    this.renderDirty = true;
    this.starGroup = new THREE.Group();
    this.scene.add(this.starGroup);
    this.labelManager = new LabelManager(mapType, this.scene);
    this.labelManager.setLabelOpacity(this.labelOpacity);
    this.filterOptions = {};
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
      this.frustumSize = 130;
      this.camera = new THREE.OrthographicCamera(
        (-this.frustumSize * initialAspect) / 2,
        (this.frustumSize * initialAspect) / 2,
        this.frustumSize / 2,
        -this.frustumSize / 2,
        -1000,
        1000
      );
      this.camera.position.set(0, 0, 10);
      this.controls = new TwoDControls(this.camera, this.renderer.domElement, {
        requestRender: () => requestRenderIfAvailable(this),
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
      this.camera = new THREE.PerspectiveCamera(60, initialAspect, 0.1, 10000);
      this.camera.position.set(0, 0, 220);
      this.controls = new ThreeDControls(this.camera, this.renderer.domElement, {
        requestRender: () => requestRenderIfAvailable(this),
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
    this.boundResize = () => this.onResize();
    window.addEventListener('resize', this.boundResize, false);
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
        .then(() => {
          this.boundaryData = getConstellationBoundaries();
          return this.boundaryData;
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
    this.starOpacity = clamp01(opacity);
    this.redrawLastState();
  }

  setConnectionOpacity(opacity) {
    this.connectionOpacity = clamp01(opacity);
    this.redrawLastState();
  }

  setLabelOpacity(opacity) {
    this.labelOpacity = clamp01(opacity);
    this.labelManager.setLabelOpacity(this.labelOpacity);
    this.redrawLastState();
  }

  setFilterOptions(options = {}) {
    this.filterOptions = options || {};
  }

  getFilterNumber(name, fallback) {
    const value = this.filterOptions?.[name];
    return Number.isFinite(value) ? value : fallback;
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

  getLayerSignatureContext() {
    return {
      state: this.state,
      filterOptions: this.filterOptions,
      starOpacity: this.starOpacity,
      labelOpacity: this.labelOpacity,
      connectionOpacity: this.connectionOpacity,
      viewpointStarId: getViewpointStarId() || 'sol'
    };
  }

  redrawLastState() {
    if (this.lastStars && this.lastConnections) {
      this.updateMap(this.lastStars, this.lastConnections);
    }
  }

  async updateMap(stars, connectionObjs, filterOptions = this.filterOptions) {
    this.setFilterOptions(filterOptions);
    this.lastStars = stars;
    this.lastConnections = connectionObjs;
    await Promise.all([this.ensureBoundaryData(), this.ensureConstellationMeta()]);
    const safeStars = stars || [];
    const safeConnections = connectionObjs || [];
    const signatureContext = this.getLayerSignatureContext();
    const featureSignature = buildFeatureLayerSignature(safeConnections, signatureContext);
    const starSignature = buildStarLayerSignature(safeStars, signatureContext);
    const labelSignature = buildLabelLayerSignature(safeStars, signatureContext);
    const interactionSignature = buildStarTopologySignature(safeStars, signatureContext);

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
    requestRenderIfAvailable(this);
  }

  drawAtlas(stars, connectionObjs, filterOptions = this.filterOptions) {
    this.setFilterOptions(filterOptions);
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
    const signatureContext = this.getLayerSignatureContext();
    this.layerSignatures.features = buildFeatureLayerSignature(safeConnections, signatureContext);
    this.layerSignatures.stars = buildStarLayerSignature(safeStars, signatureContext);
    this.layerSignatures.labels = buildLabelLayerSignature(safeStars, signatureContext);
    this.layerSignatures.interaction = buildStarTopologySignature(safeStars, signatureContext);
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
    const lineWidth = Math.max(1, this.getFilterNumber('connectionWidth', 5) * 0.45);
    const labelSize = this.getFilterNumber('connectionLabelSize', 1);
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
    const opacity = clamp01(this.getFilterNumber('constellationNameOpacity', 0.8));
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
    const opacity = clamp01(this.getFilterNumber('constellationLineOpacity', 0.4));
    const lineWidth = Math.max(0.1, this.getFilterNumber('constellationLineWidth', 1));
    if (opacity <= 0.001) return;
    ctx.save();
    ctx.strokeStyle = constellationLineCss(opacity);
    ctx.lineWidth = lineWidth;
    boundaries.forEach(boundary => {
      if (!boundary) return;
      const start = raDecToUV(normalizeRightAscension(boundary.ra1), boundary.dec1);
      const end = raDecToUV(normalizeRightAscension(boundary.ra2), boundary.dec2);
      splitWrappedUvSegment(start, end).forEach(([segmentStart, segmentEnd]) => {
        strokeUvSegment(ctx, segmentStart, segmentEnd);
      });
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
    const opacityFactor = clamp01(this.getFilterNumber('densityOpacity', 1));
    if (opacityFactor <= 0.001) return;

    // Smooth heatmap pass (inspired by Mollweide heatmap canvas approach)
    ctx.save();
    ctx.filter = 'blur(6px)';
    (overlay.cubesData || []).forEach(cell => {
      if (!cell?.active) return;
      const point = getOverlayCellAtlasPoint(cell, { raDecToUV, spherePositionToUv });
      if (!point) return;
      const color = getOverlayCellColor(cell, 'tcMesh', '#ff8844');
      const alpha = getOverlayCellAlpha(cell, { meshKey: 'tcMesh', fallbackOpacity: 0.15, opacityFactor });
      const radius = getScaledOverlayRadius(cell, overlay, { minRadius: 4, radiusFactor: 0.6 });
      const grd = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
      grd.addColorStop(0, rgbaFromHex(color, alpha));
      grd.addColorStop(0.7, rgbaFromHex(color, alpha * 0.3));
      grd.addColorStop(1, rgbaFromHex(color, 0));
      ctx.fillStyle = grd;
      drawWrappedCircle(ctx, point.x, point.y, radius);
    });
    ctx.filter = 'none';

    // Draw adjacent lines between active cells
    (overlay.adjacentLines || []).forEach(({ cell1, cell2 }) => {
      if (!cell1?.active || !cell2?.active) return;
      const c1 = cell1.tcMesh?.material?.color;
      const c2 = cell2.tcMesh?.material?.color;
      const avgColor = c1 ? `#${c1.clone().lerp(c2 || c1, 0.5).getHexString()}` : '#ff8844';
      const avgAlpha = getAverageOverlayAlpha(cell1, cell2, { meshKey: 'tcMesh', opacityFactor });
      ctx.strokeStyle = rgbaFromHex(avgColor, avgAlpha);
      ctx.lineWidth = 1.5;
      const raDec1 = getOverlayCellRaDec(cell1);
      const raDec2 = getOverlayCellRaDec(cell2);
      if (raDec1 && raDec2) {
        const segments = sampleGreatCircleUvFromRaDec(
          raDec1.ra, raDec1.dec,
          raDec2.ra, raDec2.dec,
          GLOBE_RADIUS, 12
        );
        for (let j = 0; j < segments.length - 1; j++) {
          splitWrappedUvSegment(segments[j], segments[j + 1]).forEach(([s, e]) => strokeUvSegment(ctx, s, e));
        }
      } else {
        const uv1 = getOverlayCellAtlasPoint(cell1, { raDecToUV, spherePositionToUv });
        const uv2 = getOverlayCellAtlasPoint(cell2, { raDecToUV, spherePositionToUv });
        if (uv1 && uv2) splitWrappedSegment(uv1, uv2).forEach(([s, e]) => strokeUvSegment(ctx, s, e));
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
      const c1 = cell1.tcMesh?.material?.color;
      const c2 = cell2.tcMesh?.material?.color;
      const avgColor = c1 ? `#${c1.clone().lerp(c2 || c1, 0.5).getHexString()}` : '#4f97ff';
      const avgAlpha = getAverageOverlayAlpha(cell1, cell2, { meshKey: 'tcMesh' });
      ctx.strokeStyle = rgbaFromHex(avgColor, avgAlpha * 0.6);
      ctx.lineWidth = 1.2;
      const raDec1 = getOverlayCellRaDec(cell1);
      const raDec2 = getOverlayCellRaDec(cell2);
      if (raDec1 && raDec2) {
        const segments = sampleGreatCircleUvFromRaDec(
          raDec1.ra, raDec1.dec,
          raDec2.ra, raDec2.dec,
          GLOBE_RADIUS, 12
        );
        for (let j = 0; j < segments.length - 1; j++) {
          splitWrappedUvSegment(segments[j], segments[j + 1]).forEach(([s, e]) => strokeUvSegment(ctx, s, e));
        }
      } else {
        const uv1 = getOverlayCellAtlasPoint(cell1, { raDecToUV, spherePositionToUv });
        const uv2 = getOverlayCellAtlasPoint(cell2, { raDecToUV, spherePositionToUv });
        if (uv1 && uv2) splitWrappedSegment(uv1, uv2).forEach(([s, e]) => strokeUvSegment(ctx, s, e));
      }
    });

    // Draw cell indicators
    (overlay.cubesData || []).forEach(cell => {
      if (!cell?.active) return;
      const point = getOverlayCellAtlasPoint(cell, { raDecToUV, spherePositionToUv });
      if (!point) return;
      const color = getOverlayCellColor(cell, 'tcMesh', '#4f97ff');
      const alpha = getOverlayCellAlpha(cell, { meshKey: 'tcMesh', fallbackOpacity: 0.35 });
      const radius = getScaledOverlayRadius(cell, overlay, { minRadius: 3, radiusFactor: 0.5 });
      ctx.fillStyle = rgbaFromHex(color, alpha);
      drawWrappedCircle(ctx, point.x, point.y, radius);
    });
    ctx.restore();
  }

  drawCloudDensityOverlay(ctx) {
    if (!this.state.showCloudDensityFlag || !Array.isArray(this.state.cloudDensityOverlays)) return;
    const cdOpacity = clamp01(this.getFilterNumber('cloudDensityOpacity', 1));
    if (cdOpacity <= 0.001) return;
    ctx.save();
    ctx.filter = 'blur(4px)';
    this.state.cloudDensityOverlays.forEach(overlay => {
      (overlay?.cubesData || []).forEach(cell => {
        if (!cell?.active || !cell?.globeMesh) return;
        const color = getOverlayCellColor(cell, 'globeMesh', '#ff6600');
        const alpha = getOverlayCellAlpha(cell, { meshKey: 'globeMesh', fallbackOpacity: 0.2, opacityFactor: cdOpacity });
        // Use native UV from globe position
        const point = getOverlayCellAtlasPoint(cell, { raDecToUV, spherePositionToUv });
        if (!point) return;
        const radius = Math.max(6, 18);
        const grd = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
        grd.addColorStop(0, rgbaFromHex(color, alpha));
        grd.addColorStop(0.6, rgbaFromHex(color, alpha * 0.4));
        grd.addColorStop(1, rgbaFromHex(color, 0));
        ctx.fillStyle = grd;
        drawWrappedCircle(ctx, point.x, point.y, radius);
      });
    });
    ctx.filter = 'none';
    ctx.restore();
  }

  drawCloudsOverlay(ctx) {
    const overlays = this.sourceGlobeScene?.userData?.cloudOverlays;
    if (!this.state.showCloudsFlag || !Array.isArray(overlays)) return;
    const cloudOpacity = clamp01(this.getFilterNumber('cloudOpacity', 1));
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
      const _a = new THREE.Vector3();
      const _b = new THREE.Vector3();
      for (let i = 0; i <= pos.count - 2; i += 2) {
        _a.fromBufferAttribute(pos, i);
        _b.fromBufferAttribute(pos, i + 1);
        splitWrappedSegment(spherePositionToUv(_a, 100), spherePositionToUv(_b, 100)).forEach(([s, e]) => strokeUvSegment(ctx, s, e));
      }
      ctx.restore();
    });
  }

  drawPlanes(ctx) {
    const planeOpacity = clamp01(this.getFilterNumber('planeOpacity', 0.5));
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
    clearObject3DChildren(this.starGroup);
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
    requestRenderIfAvailable(this);
  }

  render() {
    if (!this.canvas.isConnected) return;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (this.boundResize) {
      window.removeEventListener('resize', this.boundResize, false);
    }
    this.starInteractionDisposer?.();
    this.controls?.dispose?.();
    this.labelManager?.removeAllLabels?.();

    if (this.atlasTexture) {
      this.atlasTexture.dispose();
      this.atlasTexture = null;
    }

    this.scene.children.slice().forEach(child => {
      this.scene.remove(child);
      disposeObject3D(child);
    });

    this.renderer.dispose();
  }
}
