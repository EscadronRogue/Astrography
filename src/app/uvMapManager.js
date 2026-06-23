import * as THREE from '../vendor/three.js';
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
import { getViewpointStarId } from '../shared/viewpoint.js';
import { GLOBE_RADIUS } from '../shared/constants.js';
import { configureRendererForCanvas } from '../shared/canvasSizing.js';
import { addWebGLContextLossHandlers, assertWebGLAvailable } from '../shared/webglSupport.js';
import { logWarn } from '../shared/logger.js';
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
import { createUvSurface } from './uvSurfaceFactory.js';
import { drawUvPlanes } from './uvPlaneDrawing.js';
import { drawUvCloudsOverlay } from './uvCloudOverlayDrawing.js';
import {
  getAverageOverlayAlpha,
  getOverlayCellAlpha,
  getOverlayCellAtlasPoint,
  getOverlayCellColor,
  getOverlayCellRaDec,
  getScaledOverlayRadius
} from './uvOverlayCells.js';
import { getStarDisplayOpacity } from '../features/filters/logic/displayMetrics.js';
import {
  configureRuntimeAtlasDimensions,
  getAtlasHeight,
  getAtlasWidth
} from './uvAtlasConfig.js';

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
    assertWebGLAvailable();
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
    this.updateToken = 0;

    const atlasDimensions = configureRuntimeAtlasDimensions({
      maxTextureSize: this.renderer.capabilities?.maxTextureSize
    });
    this.atlasCanvas = document.createElement('canvas');
    this.atlasCanvas.width = atlasDimensions.width;
    this.atlasCanvas.height = atlasDimensions.height;
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

    const surface = createUvSurface({
      mapType,
      initialAspect,
      atlasTexture: this.atlasTexture,
      rendererElement: this.renderer.domElement,
      requestRender: () => requestRenderIfAvailable(this)
    });
    this.frustumSize = surface.frustumSize;
    this.camera = surface.camera;
    this.controls = surface.controls;
    this.surfaceMesh = surface.surfaceMesh;
    surface.sceneObjects.forEach(object => this.scene.add(object));

    this.scene.add(this.camera);
    this.boundResize = () => this.onResize();
    window.addEventListener('resize', this.boundResize, false);
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

  setLegacySourceScene(scene) {
    this.sourceGlobeScene = scene;
  }

  async ensureConstellationMeta() {
    if (this.constellationMetaPromise) return this.constellationMetaPromise;
    this.constellationMetaPromise = Promise.all([
      loadConstellationCenters(),
      loadConstellationFullNames()
    ]).catch(err => {
      logWarn('UV constellation metadata loading failed:', err);
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
          logWarn('UV boundary loading failed:', err);
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
    const atlasWidth = getAtlasWidth();
    const atlasHeight = getAtlasHeight();
    ctx.clearRect(0, 0, atlasWidth, atlasHeight);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, atlasWidth, atlasHeight);
    this.drawGraticule(ctx);
  }

  redrawFeatureLayer(connections) {
    const ctx = this.featureLayer.ctx;
    ctx.clearRect(0, 0, getAtlasWidth(), getAtlasHeight());
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
    ctx.clearRect(0, 0, getAtlasWidth(), getAtlasHeight());
    this.drawStars(ctx, stars || []);
  }

  redrawLabelLayer(stars) {
    const ctx = this.labelLayer.ctx;
    ctx.clearRect(0, 0, getAtlasWidth(), getAtlasHeight());
    this.drawConstellationNames(ctx);
    this.drawStarLabels(ctx, stars || []);
  }

  composeAtlas() {
    const ctx = this.atlasCtx;
    ctx.clearRect(0, 0, getAtlasWidth(), getAtlasHeight());
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
    const token = ++this.updateToken;
    this.setFilterOptions(filterOptions);
    this.lastStars = stars;
    this.lastConnections = connectionObjs;
    await Promise.all([this.ensureBoundaryData(), this.ensureConstellationMeta()]);
    if (token !== this.updateToken) return;
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
    const atlasWidth = getAtlasWidth();
    const atlasHeight = getAtlasHeight();
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 12; i++) {
      const x = (i / 12) * atlasWidth;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, atlasHeight);
      ctx.stroke();
    }
    for (let i = 0; i <= 6; i++) {
      const y = (i / 6) * atlasHeight;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(atlasWidth, y);
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
          const atlasWidth = getAtlasWidth();
          const atlasHeight = getAtlasHeight();
          const px = midUv.u * atlasWidth;
          const py = midUv.v * atlasHeight;
          [-atlasWidth, 0, atlasWidth].forEach(shiftX => {
            const drawX = px + shiftX;
            if (drawX < -60 || drawX > atlasWidth + 60) return;
            ctx.strokeText(distText, drawX, py);
            ctx.fillText(distText, drawX, py);
          });
          ctx.restore();
        }
      }
    });
  }

  drawStars(ctx, stars) {
    const atlasWidth = getAtlasWidth();
    const atlasHeight = getAtlasHeight();
    stars.forEach(star => {
      if (!star.displayVisible) return;
      const { ra, dec } = getStarCoordinates(star);
      const { u, v } = raDecToUV(ra, dec);
      const x = u * atlasWidth;
      const y = v * atlasHeight;
      const radius = THREE.MathUtils.clamp((star.displaySize || 1) * 1.6, 1.2, 10);
      ctx.save();
      ctx.fillStyle = rgbaFromHex(star.displayColor || '#ffffff', getStarDisplayOpacity(star, this.starOpacity));
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
        const atlasWidth = getAtlasWidth();
        const atlasHeight = getAtlasHeight();
        return {
          x: ((starPos.x / EQUIRECT_WIDTH) + 0.5) * atlasWidth,
          y: (0.5 - (starPos.y / EQUIRECT_HEIGHT)) * atlasHeight,
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

        const atlasWidth = getAtlasWidth();
        [-atlasWidth, 0, atlasWidth].forEach(shiftX => {
          const drawX = placement.drawX + shiftX;
          if (drawX + placement.bounds.width < -24 || drawX > atlasWidth + 24) return;
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
    const atlasWidth = getAtlasWidth();
    const atlasHeight = getAtlasHeight();
    ctx.save();
    applyCanvasConstellationLabelStyle(ctx, opacity);
    const fontSize = Math.round(THREE.MathUtils.clamp(atlasWidth / 240, 18, 34));
    ctx.font = `300 ${fontSize}px "Cormorant Garamond", "Times New Roman", serif`;
    centers.forEach(center => {
      const { u, v } = raDecToUV(center.ra, center.dec);
      const x = u * atlasWidth;
      const y = v * atlasHeight;
      const name = fullNames[center.name] || center.name;
      [-atlasWidth, 0, atlasWidth].forEach(shiftX => {
        const drawX = x + shiftX;
        if (drawX < -180 || drawX > atlasWidth + 180) return;
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
      const alpha = getOverlayCellAlpha(cell, { meshKey: 'tcMesh', fallbackOpacity: 0.15 });
      const radius = getScaledOverlayRadius(cell, overlay, { minRadius: 4, radiusFactor: 0.6 });
      const grd = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
      grd.addColorStop(0, rgbaFromHex(color, alpha));
      grd.addColorStop(0.7, rgbaFromHex(color, alpha * 0.3));
      grd.addColorStop(1, rgbaFromHex(color, 0));
      ctx.fillStyle = grd;
      drawWrappedCircle(ctx, point.x, point.y, radius);
    });
    ctx.filter = 'none';

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
        const alpha = getOverlayCellAlpha(cell, { meshKey: 'globeMesh', fallbackOpacity: 0.2 });
        // Use native UV from globe position
        const point = getOverlayCellAtlasPoint(cell, { raDecToUV, spherePositionToUv });
        if (!point) return;
        const radius = getScaledOverlayRadius(cell, overlay, {
          minRadius: 6,
          radiusFactor: Math.max(0.4, this.getFilterNumber('cloudDensityRadius', 5) / 8)
        });
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
    drawUvCloudsOverlay(ctx, {
      sourceScene: this.sourceGlobeScene,
      showClouds: this.state.showCloudsFlag,
      cloudOpacity: this.getFilterNumber('cloudOpacity', 1)
    });
  }

  drawPlanes(ctx) {
    drawUvPlanes(ctx, this.state, this.getFilterNumber('planeOpacity', 0.5));
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
    this.webglContextDisposer?.();

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
