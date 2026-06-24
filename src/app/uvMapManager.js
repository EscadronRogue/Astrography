import * as THREE from '../vendor/three.js';
import { LabelManager } from '../features/labels/labelManager.js';
import { clearObject3DChildren, disposeObject3D } from '../render/engine/renderUtils.js';
import { requestRenderIfAvailable } from '../shared/renderScheduler.js';
import { getStarEquirectangularPosition } from '../shared/uvUtils.js';
import {
  loadConstellationBoundaries,
  getConstellationBoundaries,
  loadConstellationCenters,
  loadConstellationFullNames
} from '../features/constellations/constellationDataService.js';
import { getViewpointStarId } from '../shared/viewpoint.js';
import { configureRendererForCanvas } from '../shared/canvasSizing.js';
import { addWebGLContextLossHandlers, assertWebGLAvailable } from '../shared/webglSupport.js';
import { logWarn } from '../shared/logger.js';
import {
  buildFeatureLayerSignature,
  buildLabelLayerSignature,
  buildStarLayerSignature,
  buildStarTopologySignature
} from './uvLayerSignatures.js';
import { endPerformanceMeasure, startPerformanceMeasure } from '../shared/performanceMetrics.js';
import { clamp01 } from './uvCanvasLayers.js';
import { createUvSurface } from './uvSurfaceFactory.js';
import {
  getAtlasHeight,
  getAtlasWidth
} from './uvAtlasConfig.js';
import { createUvAtlasStore } from './uvAtlasStore.js';
import { UvAtlasLayerRenderer } from './uvAtlasLayerRenderer.js';

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
  constructor({ canvasId, mapType, state, atlasStore = null }) {
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
    this.globeSourceScene = null;
    this.updateToken = 0;

    this.atlasStore = (atlasStore || createUvAtlasStore({
      maxTextureSize: this.renderer.capabilities?.maxTextureSize
    })).acquire();
    this.atlasCanvas = this.atlasStore.atlasCanvas;
    this.atlasCtx = this.atlasStore.atlasCtx;
    this.atlasTexture = this.atlasStore.atlasTexture;
    this.baseLayer = this.atlasStore.baseLayer;
    this.featureLayer = this.atlasStore.featureLayer;
    this.starLayer = this.atlasStore.starLayer;
    this.labelLayer = this.atlasStore.labelLayer;
    this.layerSignatures = this.atlasStore.layerSignatures;
    this.atlasRenderer = new UvAtlasLayerRenderer(this);
    this.interactionSignature = '';
    if (!this.atlasStore.isBaseLayerReady) {
      this.redrawBaseLayer();
      this.atlasStore.isBaseLayerReady = true;
    }

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

  setGlobeSourceScene(scene) {
    this.globeSourceScene = scene;
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
    this.atlasRenderer.drawGraticule(ctx);
  }

  redrawFeatureLayer(connections) {
    const ctx = this.featureLayer.ctx;
    ctx.clearRect(0, 0, getAtlasWidth(), getAtlasHeight());
    this.atlasRenderer.drawConstellationOverlay(ctx);
    this.atlasRenderer.drawDensityOverlay(ctx);
    this.atlasRenderer.drawIsolationOverlay(ctx);
    this.atlasRenderer.drawCloudDensityOverlay(ctx);
    this.atlasRenderer.drawCloudsOverlay(ctx);
    this.atlasRenderer.drawPlanes(ctx);
    if (this.state.showConstellationBoundariesFlag && Array.isArray(this.boundaryData)) {
      this.atlasRenderer.drawConstellationBoundaries(ctx, this.boundaryData);
    }
    this.atlasRenderer.drawConnections(ctx, connections || []);
  }

  redrawStarLayer(stars) {
    const ctx = this.starLayer.ctx;
    ctx.clearRect(0, 0, getAtlasWidth(), getAtlasHeight());
    this.atlasRenderer.drawStars(ctx, stars || []);
  }

  redrawLabelLayer(stars) {
    const ctx = this.labelLayer.ctx;
    ctx.clearRect(0, 0, getAtlasWidth(), getAtlasHeight());
    this.atlasRenderer.drawConstellationNames(ctx);
    this.atlasRenderer.drawStarLabels(ctx, stars || []);
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
    const timer = startPerformanceMeasure('uv.updateMap', {
      mapType: this.mapType,
      stars: stars?.length || 0,
      connections: connectionObjs?.length || 0
    });
    const token = ++this.updateToken;
    this.setFilterOptions(filterOptions);
    this.lastStars = stars;
    this.lastConnections = connectionObjs;
    await Promise.all([this.ensureBoundaryData(), this.ensureConstellationMeta()]);
    if (token !== this.updateToken) {
      endPerformanceMeasure(timer, { mapType: this.mapType, stale: true });
      return;
    }
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

    const interactionDirty = this.interactionSignature !== interactionSignature;
    if (interactionDirty) {
      this.updateInteractionGeometry(safeStars);
      this.interactionSignature = interactionSignature;
    }
    requestRenderIfAvailable(this);
    endPerformanceMeasure(timer, { mapType: this.mapType, atlasDirty, interactionDirty });
  }

  drawAtlas(stars, connectionObjs, filterOptions = this.filterOptions) {
    const timer = startPerformanceMeasure('uv.drawAtlas', {
      mapType: this.mapType,
      stars: stars?.length || 0,
      connections: connectionObjs?.length || 0
    });
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
    this.interactionSignature = buildStarTopologySignature(safeStars, signatureContext);
    endPerformanceMeasure(timer, { mapType: this.mapType });
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

    this.atlasStore?.release?.();
    this.atlasStore = null;
    this.atlasTexture = null;

    this.scene.children.slice().forEach(child => {
      this.scene.remove(child);
      disposeObject3D(child);
    });

    this.renderer.dispose();
  }
}
