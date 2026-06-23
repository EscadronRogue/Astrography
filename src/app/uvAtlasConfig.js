import { ATLAS_HEIGHT, ATLAS_WIDTH } from '../shared/constants.js';

export const CONSTRAINED_ATLAS_WIDTH = 2048;
export const CONSTRAINED_ATLAS_HEIGHT = 1024;

const DEFAULT_DIMENSIONS = Object.freeze({
  width: ATLAS_WIDTH,
  height: ATLAS_HEIGHT
});

let activeDimensions = { ...DEFAULT_DIMENSIONS };

function hasTouchInput() {
  return Number(globalThis.navigator?.maxTouchPoints ?? 0) > 0;
}

function hasSmallViewport() {
  const width = Number(globalThis.window?.innerWidth ?? 0);
  return width > 0 && width <= 900;
}

function reportsMobileUserAgent() {
  return Boolean(globalThis.navigator?.userAgentData?.mobile);
}

function hasConstrainedMemory() {
  const deviceMemory = Number(globalThis.navigator?.deviceMemory);
  return Number.isFinite(deviceMemory) && deviceMemory > 0 && deviceMemory <= 4;
}

function hasConstrainedConcurrency() {
  const cores = Number(globalThis.navigator?.hardwareConcurrency);
  return Number.isFinite(cores) && cores > 0 && cores <= 4;
}

export function isConstrainedAtlasRuntime() {
  return (
    reportsMobileUserAgent() ||
    (hasTouchInput() && hasSmallViewport()) ||
    hasConstrainedMemory() ||
    (hasSmallViewport() && hasConstrainedConcurrency())
  );
}

function normalizeTextureLimit(maxTextureSize) {
  const parsed = Number(maxTextureSize);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : ATLAS_WIDTH;
}

function floorPowerOfTwo(value) {
  return 2 ** Math.floor(Math.log2(Math.max(1, value)));
}

export function selectRuntimeAtlasDimensions(options = {}) {
  const constrained = options.constrained ?? isConstrainedAtlasRuntime();
  const targetWidth = constrained ? CONSTRAINED_ATLAS_WIDTH : ATLAS_WIDTH;
  const textureLimit = normalizeTextureLimit(options.maxTextureSize);
  const width = Math.max(512, floorPowerOfTwo(Math.min(targetWidth, textureLimit)));
  return {
    width,
    height: Math.max(256, Math.round(width / 2))
  };
}

export function configureRuntimeAtlasDimensions(options = {}) {
  activeDimensions = selectRuntimeAtlasDimensions(options);
  return getAtlasDimensions();
}

export function resetRuntimeAtlasDimensions() {
  activeDimensions = { ...DEFAULT_DIMENSIONS };
}

export function getAtlasDimensions() {
  return { ...activeDimensions };
}

export function getAtlasWidth() {
  return activeDimensions.width;
}

export function getAtlasHeight() {
  return activeDimensions.height;
}
