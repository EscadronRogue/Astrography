import * as THREE from '../vendor/three.js';
import { configureRuntimeAtlasDimensions, getAtlasDimensions } from './uvAtlasConfig.js';
import { createLayerCanvas } from './uvCanvasLayers.js';

function createAtlasCanvas(documentRef) {
  const canvas = documentRef?.createElement?.('canvas');
  if (!canvas) {
    throw new Error('Canvas document is unavailable');
  }

  const { width, height } = getAtlasDimensions();
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext?.('2d');
  if (!ctx) {
    throw new Error('2D canvas context unavailable');
  }

  return { canvas, ctx };
}

export function createUvAtlasStore(options = {}) {
  configureRuntimeAtlasDimensions({
    maxTextureSize: options.maxTextureSize
  });

  const documentRef = options.documentRef || globalThis.document;
  const atlas = createAtlasCanvas(documentRef);
  const texture = new THREE.CanvasTexture(atlas.canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  return {
    atlasCanvas: atlas.canvas,
    atlasCtx: atlas.ctx,
    atlasTexture: texture,
    baseLayer: createLayerCanvas(documentRef),
    featureLayer: createLayerCanvas(documentRef),
    starLayer: createLayerCanvas(documentRef),
    labelLayer: createLayerCanvas(documentRef),
    layerSignatures: {
      features: '',
      stars: '',
      labels: ''
    },
    isBaseLayerReady: false,
    references: 0,
    acquire() {
      this.references += 1;
      return this;
    },
    release() {
      this.references = Math.max(0, this.references - 1);
      if (this.references > 0) return false;
      this.atlasTexture.dispose();
      return true;
    }
  };
}
