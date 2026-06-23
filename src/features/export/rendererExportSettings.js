import * as THREE from '../../vendor/three.js';
import { parseCssColorToRgba } from '../../shared/cssColorParsing.js';

const FALLBACK_BACKGROUND = new THREE.Color(0x070a12);

function parseCssColor(value) {
  const parsed = parseCssColorToRgba(value);
  if (!parsed || parsed.a <= 0) return null;
  return new THREE.Color(parsed.r / 255, parsed.g / 255, parsed.b / 255);
}

function getVisibleCanvasBackground(canvas) {
  let element = canvas;
  while (element) {
    const color = parseCssColor(window.getComputedStyle(element).backgroundColor);
    if (color) return color;
    element = element.parentElement;
  }
  return FALLBACK_BACKGROUND.clone();
}

export function configureExportRenderer(renderer, sourceRenderer) {
  const clearColor = new THREE.Color();
  const clearAlpha = typeof sourceRenderer.getClearAlpha === 'function'
    ? sourceRenderer.getClearAlpha()
    : 1;

  if (typeof sourceRenderer.getClearColor === 'function') {
    sourceRenderer.getClearColor(clearColor);
  } else {
    clearColor.copy(FALLBACK_BACKGROUND);
  }

  renderer.setClearColor(
    clearAlpha > 0 ? clearColor : getVisibleCanvasBackground(sourceRenderer.domElement),
    1
  );

  if ('outputEncoding' in renderer && 'outputEncoding' in sourceRenderer) {
    renderer.outputEncoding = sourceRenderer.outputEncoding;
  }
  if ('outputColorSpace' in renderer && 'outputColorSpace' in sourceRenderer) {
    renderer.outputColorSpace = sourceRenderer.outputColorSpace;
  }
  if ('toneMapping' in renderer && 'toneMapping' in sourceRenderer) {
    renderer.toneMapping = sourceRenderer.toneMapping;
  }
  if ('toneMappingExposure' in renderer && 'toneMappingExposure' in sourceRenderer) {
    renderer.toneMappingExposure = sourceRenderer.toneMappingExposure;
  }
}
