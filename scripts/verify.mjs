import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateManifestFiles,
  validateStarBatch,
  validateCloudData,
  validateConstellationCenters,
  validateConstellationFullNames,
  validateStellarClassData
} from '../src/data/dataValidation.js';
import { applyDistanceFilter } from '../src/features/filters/logic/distanceFilter.js';
import { applyStarsShownFilter } from '../src/features/filters/logic/starsShownFilter.js';
import { computeDisplayStats, needsDisplayStats } from '../src/features/filters/logic/starDisplayStats.js';
import { computeAdaptiveGridSize, readFilterState } from '../src/features/filters/state/filterStateReader.js';
import { getAngularProjectionStars, getFilterProjectionStarId, isDefaultProjectionViewpointStar } from '../src/features/filters/state/filterProjectionStars.js';
import { normalizeCloudStarName } from '../src/features/clouds/cloudNameUtils.js';
import {
  buildConnectionBoundsSignature,
  buildConnectionVisualSignature,
  getConnectionDistanceBounds,
  getConnectionPairKey,
  haveSameKeys,
  resetConnectionDistanceBoundsCache
} from '../src/features/connections/connectionRenderState.js';
import { buildPrintableSTLKitFiles } from '../src/features/export/stlKitExporter.js';
import { getMollweideCropPixels, getMollweideSvgViewBox, getSceneSnapshotSize } from '../src/features/export/exportSizing.js';
import { EDIT_SCHEMA, EDIT_SCHEMA_VERSION, createEditExportPayload, normalizeLabelEdits } from '../src/features/editing/editSchema.js';
import {
  buildFeatureLayerSignature,
  buildLabelLayerSignature,
  buildStarLayerSignature,
  buildStarTopologySignature,
  getDustCloudSignature
} from '../src/app/uvLayerSignatures.js';
import { clamp01 as clampUvAlpha, createLayerCanvas as createUvLayerCanvas, rgbaFromHex as uvRgbaFromHex } from '../src/app/uvCanvasLayers.js';
import {
  getAverageOverlayAlpha,
  getOverlayCellAlpha,
  getOverlayCellAtlasPoint,
  getOverlayCellColor,
  getOverlayCellOpacity,
  getOverlayCellRaDec,
  getOverlayCellUv,
  getOverlayDistanceRatio,
  getScaledOverlayRadius
} from '../src/app/uvOverlayCells.js';
import { getProjectionContainer } from '../src/app/projectionVisibility.js';
import { getElementByIdWithin } from '../src/shared/formUtils.js';
import { readTextFile } from '../src/shared/fileUtils.js';
import { readStorageItem, removeStorageItem, writeStorageItem } from '../src/shared/storageUtils.js';
import { createEventListenerRegistry } from '../src/shared/eventListenerRegistry.js';
import { configureRendererForCanvas, getCanvasDisplaySize, getClampedDevicePixelRatio } from '../src/shared/canvasSizing.js';
import { cancelScheduledAnimationFrame, scheduleAfterPaint, scheduleAnimationFrame } from '../src/shared/renderScheduler.js';
import { createMeasuredTextCanvas, parseFontPixelSize } from '../src/shared/textCanvas.js';
import {
  clamp01 as clampShared01,
  hexToRgb255,
  hexToRgbaString,
  hexToUnitRgb,
  interpolateColorNumber,
  interpolateHexColor,
  normalizeHexColor,
  rgbToHex,
  writeUnitRgb
} from '../src/shared/colorParsing.js';
import { parseCssColorToRgba } from '../src/shared/cssColorParsing.js';
import { VECTOR_GLYPHS, getGlyphLineMetrics, layoutDigits } from '../src/features/export/stlTextGlyphs.js';
import { FEATURE_CANDIDATES, findFeatureDirection } from '../src/features/export/stlFeatureDirections.js';
import {
  buildFeatureBasis,
  orientStarForPrint,
  placeTrianglesOnBuildPlate,
  rotatePointIntoBasis
} from '../src/features/export/stlPrintOrientation.js';
import {
  FACET_BOX_HALF_DEPTH_FACTOR,
  FACET_BOX_HALF_EXTENT_FACTOR,
  FACET_DEPTH_FACTOR,
  getFacetBoxHalfDepth,
  getFacetBoxHalfExtent,
  getFacetDepth,
  getFacetDiameter,
  getFacetPlaneOffset,
  makePointOnFacet
} from '../src/features/export/stlFacetGeometry.js';
import {
  buildSegmentLabelBasis,
  computeTubeLabelLayout,
  getTubeFlatLayout,
  getTubeLabelMaxHeight,
  getTubeLabelMaxWidth
} from '../src/features/export/stlTubeLabelLayout.js';
import {
  vecAdd,
  vecCross,
  vecDistance,
  vecDot,
  vecLength,
  vecNormalise,
  vecScale,
  vecSub
} from '../src/features/export/stlVectorMath.js';
import {
  buildKitManifest,
  buildSystemRankMap,
  getSystemName,
  sanitizeSTLFilename
} from '../src/features/export/stlKitMetadata.js';
import {
  HOLE_CLUSTER_CLEARANCE,
  HOLE_RADIUS,
  HOLE_TOLERANCE,
  TUBE_INSERTION_DEPTH,
  Y_JUNCTION_OUTSIDE,
  buildEndpointMap,
  buildForcedMergeMap,
  buildSystemSocketPlan,
  buildSystemSocketPlans,
  buildTubeComponents,
  clusterHoleEndpoints,
  getClusterMergedDirection,
  getForcedMergeSignature,
  mergeConnectionGroups,
  toWorldPoint
} from '../src/features/export/stlSocketPlanning.js';
import {
  createSTLKitWorkerPayload,
  getSTLKitTransferableBuffers,
  serializeConnectionsForWorker,
  serializeStarForWorker,
  serializeStarsForWorker
} from '../src/features/export/stlKitWorkerPayload.js';
import { canvasToPngDataUrl, downloadBlob, removeElement } from '../src/features/export/downloadUtils.js';
import { formatUserError } from '../src/shared/userNotifications.js';
import { ATLAS_HEIGHT, ATLAS_WIDTH } from '../src/shared/constants.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const failures = [];

function walk(dir, predicate, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (entry === '.git' || entry === 'node_modules') continue;
      walk(path, predicate, out);
    } else if (predicate(path)) {
      out.push(path);
    }
  }
  return out;
}

function addFailure(message) {
  failures.push(message);
}

function assert(condition, message) {
  if (!condition) addFailure(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    addFailure(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertArrayEqual(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    addFailure(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function checkJavaScriptSyntax(files) {
  for (const file of files) {
    try {
      execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
    } catch (error) {
      addFailure(`JS syntax failed: ${file}\n${error.stderr?.toString() || error.message}`);
    }
  }
}

function resolveRelativeImport(fromFile, specifier) {
  const base = resolve(dirname(fromFile), specifier);
  const candidates = extname(base)
    ? [base]
    : [`${base}.js`, `${base}.mjs`, join(base, 'index.js')];
  return candidates.find(candidate => existsSync(candidate));
}

function getRelativeImportSpecifiers(file) {
  const importPattern = /(?:import|export)\s+(?:[^'"]+\s+from\s+)?['"]([^'"]+)['"]/g;
  const moduleUrlPattern = /new\s+URL\(\s*['"]([^'"]+\.js)['"]\s*,\s*import\.meta\.url\s*\)/g;
  const text = readFileSync(file, 'utf8');
  return [
    ...Array.from(text.matchAll(importPattern)),
    ...Array.from(text.matchAll(moduleUrlPattern))
  ]
    .map(match => match[1])
    .filter(specifier => specifier.startsWith('.'));
}

function checkRelativeImports(files) {
  for (const file of files) {
    for (const specifier of getRelativeImportSpecifiers(file)) {
      if (!resolveRelativeImport(file, specifier)) {
        addFailure(`Missing relative import from ${file}: ${specifier}`);
      }
    }
  }
}

function checkCentralizedThreeImport(files) {
  const cdnSpecifier = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
  const allowedFile = join(root, 'src', 'vendor', 'three.js');
  for (const file of files) {
    if (file === allowedFile) continue;
    const text = readFileSync(file, 'utf8');
    if (text.includes(cdnSpecifier)) {
      addFailure(`Direct Three.js CDN import outside vendor shim: ${file}`);
    }
  }
}

function checkCssBraces(files) {
  for (const file of files) {
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    let depth = 0;
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === '{') depth += 1;
      if (text[index] === '}') depth -= 1;
      if (depth < 0) {
        addFailure(`CSS has an extra closing brace: ${file}`);
        break;
      }
    }
    if (depth !== 0) {
      addFailure(`CSS has unbalanced braces: ${file}`);
    }
  }
}

function checkRequiredHtmlControls() {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  [
    'export-mollweide',
    'export-png',
    'export-pdf',
    'export-svg',
    'export-stl',
    'export-stl-kit',
    'export-true-png',
    'export-true-pdf',
    'export-uv-png',
    'export-uv-pdf',
    'export-globe-png',
    'export-globe-pdf',
    'export-legacy-globe-png',
    'export-legacy-globe-pdf'
  ]
    .forEach(id => {
      if (!html.includes(`id="${id}"`)) {
        addFailure(`Missing required export control id: ${id}`);
      }
    });
}

function checkExportRendererConfiguration() {
  const helper = join(root, 'src', 'features', 'export', 'rendererExportSettings.js');
  const cssColorHelper = join(root, 'src', 'shared', 'cssColorParsing.js');
  const helperText = readFileSync(helper, 'utf8');
  const cssColorText = readFileSync(cssColorHelper, 'utf8');
  ['getClearColor', 'getClearAlpha', 'outputEncoding', 'outputColorSpace', 'toneMapping'].forEach(token => {
    if (!helperText.includes(token)) {
      addFailure(`Export renderer settings helper is missing ${token}: ${helper}`);
    }
  });
  if (!helperText.includes("from '../../shared/cssColorParsing.js'") || !helperText.includes('parseCssColorToRgba(value)')) {
    addFailure(`Export renderer background parsing should use shared CSS color parser: ${helper}`);
  }
  if (helperText.includes("value.match(/[\\d.]+/g)") || helperText.includes('/^#[0-9a-f]{3,8}$/i')) {
    addFailure(`Export renderer settings should not keep ad hoc CSS color parsing: ${helper}`);
  }
  ['parseCssColorToRgba', 'parseRgbFunction', 'parseColorFunction', 'parseHexColor'].forEach(token => {
    if (!cssColorText.includes(token)) {
      addFailure(`Shared CSS color parser is missing ${token}: ${cssColorHelper}`);
    }
  });
  if (cssColorText.includes("from '../vendor/three.js'") || cssColorText.includes('new THREE.Color')) {
    addFailure(`Shared CSS color parser must stay dependency-light and verifier-importable: ${cssColorHelper}`);
  }

  [
    join(root, 'src', 'features', 'export', 'exportManager.js'),
    join(root, 'src', 'features', 'export', 'sceneSnapshotExporter.js')
  ].forEach(file => {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('configureExportRenderer')) {
      addFailure(`Export renderer is not configured from the source renderer: ${file}`);
    }
  });
}

function checkExportSizingSafety() {
  const sizing = join(root, 'src', 'features', 'export', 'exportSizing.js');
  const sizingText = readFileSync(sizing, 'utf8');
  [
    'getSceneSnapshotSize',
    'getMollweideCropPixels',
    'getMollweideSvgViewBox',
    'getCanvasDisplaySize',
    'Map canvas has no exportable size.',
    'DEFAULT_MOLLWEIDE_VIEW_BOX',
    'cropRight',
    'cropBottom'
  ].forEach(token => {
    if (!sizingText.includes(token)) {
      addFailure(`Export sizing helper should own safe snapshot/crop/viewBox math (${token}): ${sizing}`);
    }
  });

  const exportManager = join(root, 'src', 'features', 'export', 'exportManager.js');
  const exportText = readFileSync(exportManager, 'utf8');
  [
    "from './exportSizing.js'",
    'getMollweideCropPixels',
    'getMollweideSvgViewBox'
  ].forEach(token => {
    if (!exportText.includes(token)) {
      addFailure(`Mollweide export sizing should use safe canvas display dimensions (${token}): ${exportManager}`);
    }
  });
  ['this.mollweideMap.canvas.clientWidth', 'this.mollweideMap.canvas.clientHeight', 'canvas.clientWidth', 'canvas.clientHeight'].forEach(token => {
    if (exportText.includes(token)) {
      addFailure(`Mollweide export sizing should not use raw client dimension token ${token}: ${exportManager}`);
    }
  });

  const snapshotExporter = join(root, 'src', 'features', 'export', 'sceneSnapshotExporter.js');
  const snapshotText = readFileSync(snapshotExporter, 'utf8');
  [
    "from './exportSizing.js'",
    'getSceneSnapshotSize(manager)'
  ].forEach(token => {
    if (!snapshotText.includes(token)) {
      addFailure(`Scene snapshot sizing should use safe canvas display dimensions (${token}): ${snapshotExporter}`);
    }
  });
  ['manager?.canvas?.clientWidth', 'manager?.canvas?.clientHeight', 'getCanvasDisplaySize'].forEach(token => {
    if (snapshotText.includes(token)) {
      addFailure(`Scene snapshot sizing should not use raw client dimension token ${token}: ${snapshotExporter}`);
    }
  });
}

function checkExportRuntimeDependencies() {
  const helper = join(root, 'src', 'features', 'export', 'pdfUtils.js');
  const helperText = readFileSync(helper, 'utf8');
  ['getJsPdfConstructor', 'getJsZipConstructor', 'globalThis.jspdf?.jsPDF', 'globalThis.JSZip'].forEach(token => {
    if (!helperText.includes(token)) {
      addFailure(`Export runtime dependency helper is missing ${token}: ${helper}`);
    }
  });

  const downloadHelper = join(root, 'src', 'features', 'export', 'downloadUtils.js');
  const downloadText = readFileSync(downloadHelper, 'utf8');
  [
    'options.URLApi || globalThis.URL',
    'documentRef?.body?.appendChild',
    'globalThis.setTimeout',
    'removeElement',
    'URLApi.revokeObjectURL',
    'canvasToBlob',
    'blobToDataUrl',
    'canvasToPngDataUrl',
    'readAsDataURL',
    'downloadCanvasAsPng'
  ].forEach(token => {
    if (!downloadText.includes(token)) {
      addFailure(`Download helper is missing browser capability guard ${token}: ${downloadHelper}`);
    }
  });

  const exportFiles = walk(join(root, 'src', 'features', 'export'), file => file.endsWith('.js'));
  exportFiles.forEach(file => {
    if (file === helper) return;
    const text = readFileSync(file, 'utf8');
    ['window.jspdf', 'window.JSZip', 'globalThis.JSZip'].forEach(token => {
      if (text.includes(token)) {
        addFailure(`Export module should use runtime dependency helpers instead of ${token}: ${file}`);
      }
    });
    if (file !== downloadHelper && text.includes('.toBlob(')) {
      addFailure(`Export module should use downloadCanvasAsPng instead of direct canvas.toBlob callbacks: ${file}`);
    }
    if (file !== downloadHelper && text.includes('.toDataURL(')) {
      addFailure(`Export module should use canvasToPngDataUrl instead of direct canvas.toDataURL calls: ${file}`);
    }
  });

  const stlKitExporter = join(root, 'src', 'features', 'export', 'stlKitExporter.js');
  const stlKitText = readFileSync(stlKitExporter, 'utf8');
  if (!stlKitText.includes('getJsZipConstructor()')) {
    addFailure(`STL kit exporter must use ZIP runtime helper: ${stlKitExporter}`);
  }
}

function checkSvgExportFidelity() {
  const exporter = join(root, 'src', 'features', 'export', 'exportManager.js');
  const text = readFileSync(exporter, 'utf8');
  [
    'getSvgStarLabelState',
    'labelManager?.sprites?.get',
    'mollLabelOffset',
    'mollLabelRotation',
    'mollLabelScale',
    'transform=',
    'dominant-baseline="central"'
  ].forEach(token => {
    if (!text.includes(token)) {
      addFailure(`SVG export must preserve edited Mollweide label state (${token}): ${exporter}`);
    }
  });
}

function checkFullscreenCompatibility() {
  const sidebar = join(root, 'src', 'ui', 'sidebar', 'buildSidebar.js');
  const text = readFileSync(sidebar, 'utf8');
  [
    'getFullscreenElement',
    'requestElementFullscreen',
    'exitDocumentFullscreen',
    'webkitRequestFullscreen',
    'mozRequestFullScreen',
    'msRequestFullscreen',
    'webkitfullscreenchange',
    'mozfullscreenchange',
    'MSFullscreenChange',
    "button.disabled = true",
    "aria-pressed"
  ].forEach(token => {
    if (!text.includes(token)) {
      addFailure(`Fullscreen controls are missing cross-browser compatibility token ${token}: ${sidebar}`);
    }
  });
}

function checkSidebarAccessibility() {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  [
    'id="filters-sidebar"',
    'aria-controls="filters-sidebar"',
    'aria-expanded="false"'
  ].forEach(token => {
    if (!html.includes(token)) {
      addFailure(`Sidebar menu accessibility markup is missing ${token}: index.html`);
    }
  });

  const sidebar = join(root, 'src', 'ui', 'sidebar', 'buildSidebar.js');
  const text = readFileSync(sidebar, 'utf8');
  [
    "menuToggle.getAttribute('aria-controls')",
    "menuToggle.setAttribute('aria-expanded'",
    "sidebar?.classList.toggle('open')"
  ].forEach(token => {
    if (!text.includes(token)) {
      addFailure(`Sidebar menu accessibility state sync is missing ${token}: ${sidebar}`);
    }
  });
}

function checkProjectionVisibilityRobustness() {
  const projection = join(root, 'src', 'app', 'projectionVisibility.js');
  const text = readFileSync(projection, 'utf8');
  [
    'getProjectionContainer',
    'documentRef = globalThis.document',
    'documentRef?.getElementById?.(canvasId)?.parentElement || null',
    'container?.remove?.()',
    'requestRender?.()',
    'maybePersistPresets?.()'
  ].forEach(token => {
    if (!text.includes(token)) {
      addFailure(`Projection visibility should tolerate missing optional map DOM (${token}): ${projection}`);
    }
  });

  if (text.includes(".getElementById('legacySphereMap').parentElement") || text.includes(".getElementById('legacyMollweideMap').parentElement")) {
    addFailure(`Projection visibility should not dereference optional legacy map containers directly: ${projection}`);
  }
}

function checkUserNotificationsCentralized(files) {
  const helper = join(root, 'src', 'shared', 'userNotifications.js');
  const helperText = readFileSync(helper, 'utf8');
  [
    'formatUserError',
    'notifyError',
    'app-notification-region',
    "aria-live', 'assertive'",
    "role', 'alert'",
    'globalThis.alert'
  ].forEach(token => {
    if (!helperText.includes(token)) {
      addFailure(`User notification helper is missing ${token}: ${helper}`);
    }
  });

  const theme = join(root, 'styles', 'theme.css');
  const themeText = readFileSync(theme, 'utf8');
  ['#app-notification-region', '.app-notification-error', '.app-notification-close'].forEach(token => {
    if (!themeText.includes(token)) {
      addFailure(`Notification CSS is missing ${token}: ${theme}`);
    }
  });

  files.forEach(file => {
    if (file === helper) return;
    const text = readFileSync(file, 'utf8');
    if (text.includes('alert(') || text.includes('.alert(')) {
      addFailure(`Runtime code should use notifyError instead of direct alert calls: ${file}`);
    }
  });
}

function checkTooltipStylesCentralized() {
  const tooltipJs = join(root, 'src', 'render', 'interactions', 'tooltips.js');
  const themeCss = join(root, 'styles', 'theme.css');
  const tooltipText = readFileSync(tooltipJs, 'utf8');
  const themeText = readFileSync(themeCss, 'utf8');

  [
    'tooltip-catalog-link',
    'tooltip-action-row',
    'tooltip-action-primary',
    'tooltip-action-secondary'
  ].forEach(token => {
    if (!tooltipText.includes(token) || !themeText.includes(`.${token}`)) {
      addFailure(`Tooltip styling should be centralized with class ${token}: ${tooltipJs} / ${themeCss}`);
    }
  });

  ['style.cssText', "style.color = '#ff6f61'", "style.textDecoration = 'underline'", "style.opacity = '0.5'", "style.cursor = 'default'"].forEach(token => {
    if (tooltipText.includes(token)) {
      addFailure(`Tooltip JS should not own visual styling token ${token}: ${tooltipJs}`);
    }
  });
}

function checkCssEscapeCompatibility(files) {
  const helper = join(root, 'src', 'shared', 'formUtils.js');
  const helperText = readFileSync(helper, 'utf8');
  ['getElementByIdWithin', 'globalThis.CSS?.escape', 'getElementById?.(id)', 'container.contains(direct)'].forEach(token => {
    if (!helperText.includes(token)) {
      addFailure(`Form ID lookup helper is missing cross-browser token ${token}: ${helper}`);
    }
  });

  files.forEach(file => {
    if (file === helper) return;
    const text = readFileSync(file, 'utf8');
    if (text.includes('CSS.escape')) {
      addFailure(`Runtime code should use getElementByIdWithin instead of direct CSS.escape: ${file}`);
    }
  });
}

function checkCanvasSizingCentralized() {
  const helper = join(root, 'src', 'shared', 'canvasSizing.js');
  const helperText = readFileSync(helper, 'utf8');
  [
    'getCanvasDisplaySize',
    'getClampedDevicePixelRatio',
    'configureRendererForCanvas',
    'Math.max(1, Math.round(width))',
    'renderer.setSize(size.width, size.height, false)'
  ].forEach(token => {
    if (!helperText.includes(token)) {
      addFailure(`Canvas sizing helper is missing ${token}: ${helper}`);
    }
  });

  [
    join(root, 'src', 'app', 'mapManager.js'),
    join(root, 'src', 'app', 'uvMapManager.js')
  ].forEach(file => {
    const text = readFileSync(file, 'utf8');
    if (!text.includes("from '../shared/canvasSizing.js'") || !text.includes('configureRendererForCanvas(this.renderer, this.canvas)')) {
      addFailure(`Map manager should use centralized canvas sizing: ${file}`);
    }
    [
      'window.devicePixelRatio',
      'this.canvas.clientWidth / this.canvas.clientHeight',
      'this.renderer.setSize(this.canvas.clientWidth',
      'const width = this.canvas.clientWidth',
      'const height = this.canvas.clientHeight'
    ].forEach(token => {
      if (text.includes(token)) {
        addFailure(`Map manager should not use raw canvas sizing token ${token}: ${file}`);
      }
    });
  });
}

function checkCentralizedObjectChildDisposal() {
  const renderUtils = join(root, 'src', 'render', 'engine', 'renderUtils.js');
  const mapManager = join(root, 'src', 'app', 'mapManager.js');
  const uvMapManager = join(root, 'src', 'app', 'uvMapManager.js');
  const renderText = readFileSync(renderUtils, 'utf8');
  const mapText = readFileSync(mapManager, 'utf8');
  const uvText = readFileSync(uvMapManager, 'utf8');

  if (!renderText.includes('export function clearObject3DChildren') || !renderText.includes('disposeObject3D(child)')) {
    addFailure(`Render utilities must centralize child removal/disposal through clearObject3DChildren: ${renderUtils}`);
  }

  [
    [mapManager, mapText],
    [uvMapManager, uvText]
  ].forEach(([file, text]) => {
    if (!text.includes('clearObject3DChildren(this.starGroup)')) {
      addFailure(`Star layers should clear dynamic children through centralized disposal: ${file}`);
    }
    [
      'child.geometry?.dispose',
      'child.material?.dispose',
      'if (child.geometry) child.geometry.dispose()',
      'if (child.material) child.material.dispose()'
    ].forEach(token => {
      if (text.includes(token)) {
        addFailure(`Map star layer should not manually dispose child resource token ${token}: ${file}`);
      }
    });
  });
}

function checkRenderSchedulingCentralized(files) {
  const helper = join(root, 'src', 'shared', 'renderScheduler.js');
  const helperText = readFileSync(helper, 'utf8');
  [
    'scheduleAnimationFrame',
    'scheduleAfterPaint',
    'cancelScheduledAnimationFrame',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'globalRef?.setTimeout',
    'globalRef?.clearTimeout',
    'callback(Date.now())'
  ].forEach(token => {
    if (!helperText.includes(token)) {
      addFailure(`Render scheduler helper is missing compatibility token ${token}: ${helper}`);
    }
  });

  [
    join(root, 'src', 'app', 'renderFrame.js'),
    join(root, 'src', 'app', 'mollweideUpdater.js'),
    join(root, 'src', 'app', 'createApp.js')
  ].forEach(file => {
    const text = readFileSync(file, 'utf8');
    if (!text.includes("from '../shared/renderScheduler.js'")) {
      addFailure(`App render scheduling should use the shared scheduler helper: ${file}`);
    }
  });

  files.forEach(file => {
    if (file === helper) return;
    const text = readFileSync(file, 'utf8');
    if (text.includes('requestAnimationFrame(')) {
      addFailure(`Runtime code should use scheduleAnimationFrame instead of direct requestAnimationFrame: ${file}`);
    }
    if (text.includes('cancelAnimationFrame(')) {
      addFailure(`Runtime code should use cancelScheduledAnimationFrame instead of direct cancelAnimationFrame: ${file}`);
    }
  });
}

function checkTextCanvasCentralized() {
  const helper = join(root, 'src', 'shared', 'textCanvas.js');
  const helperText = readFileSync(helper, 'utf8');
  [
    'parseFontPixelSize',
    'createMeasuredTextCanvas',
    'documentRef = globalThis.document',
    'ctx.measureText',
    'ctx.fillText'
  ].forEach(token => {
    if (!helperText.includes(token)) {
      addFailure(`Text canvas helper is missing shared measurement token ${token}: ${helper}`);
    }
  });

  [
    join(root, 'src', 'app', 'mapManager.js'),
    join(root, 'src', 'features', 'connections', 'connectionPairs.js'),
    join(root, 'src', 'features', 'planes', 'planeMeshes.js')
  ].forEach(file => {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('createMeasuredTextCanvas')) {
      addFailure(`Repeated text canvas renderer should use createMeasuredTextCanvas: ${file}`);
    }
  });
}

function checkLocalFileReadCompatibility() {
  const helper = join(root, 'src', 'shared', 'fileUtils.js');
  const helperText = readFileSync(helper, 'utf8');
  ['readTextFile', 'file.text', 'globalThis.FileReader', 'readAsText', 'reader.onerror'].forEach(token => {
    if (!helperText.includes(token)) {
      addFailure(`Local file reader helper is missing ${token}: ${helper}`);
    }
  });

  const editIo = join(root, 'src', 'features', 'editing', 'editIOControls.js');
  const editIoText = readFileSync(editIo, 'utf8');
  if (!editIoText.includes("from '../../shared/fileUtils.js'") || !editIoText.includes('readTextFile(file)')) {
    addFailure(`Edit import should read local files through readTextFile: ${editIo}`);
  }
  if (editIoText.includes('file.text()')) {
    addFailure(`Edit import must not depend directly on File.text browser support: ${editIo}`);
  }
}

function checkStorageAccessCompatibility(files) {
  const helper = join(root, 'src', 'shared', 'storageUtils.js');
  const helperText = readFileSync(helper, 'utf8');
  ['readStorageItem', 'writeStorageItem', 'removeStorageItem', 'globalThis.localStorage'].forEach(token => {
    if (!helperText.includes(token)) {
      addFailure(`Storage helper is missing ${token}: ${helper}`);
    }
  });

  const presets = join(root, 'src', 'app', 'presets.js');
  const presetsText = readFileSync(presets, 'utf8');
  ['readStorageItem', 'writeStorageItem', 'removeStorageItem'].forEach(token => {
    if (!presetsText.includes(token)) {
      addFailure(`Preset persistence should use shared storage helper ${token}: ${presets}`);
    }
  });

  files.forEach(file => {
    if (file === helper) return;
    const text = readFileSync(file, 'utf8');
    if (text.includes('localStorage') || text.includes('sessionStorage')) {
      addFailure(`Runtime code should use storageUtils instead of direct web storage access: ${file}`);
    }
  });

  const index = join(root, 'index.html');
  const indexText = readFileSync(index, 'utf8');
  if (indexText.includes('localStorage') || indexText.includes('sessionStorage')) {
    addFailure(`Index boot script should not depend on web storage availability: ${index}`);
  }
  if (!indexText.includes('setAttribute("data-theme", "observatory")')) {
    addFailure(`Index boot script should set the single supported theme without storage: ${index}`);
  }
}

function checkCentralizedHashing() {
  const colorUtils = join(root, 'src', 'shared', 'colorUtils.js');
  const text = readFileSync(colorUtils, 'utf8');
  if (!text.includes("from './hashUtils.js'")) {
    addFailure(`Color utilities must use centralized hash utilities: ${colorUtils}`);
  }
  if (text.includes('export function hashString')) {
    addFailure(`Color utilities must not define a separate hashString implementation: ${colorUtils}`);
  }
}

function checkSharedColorParsing() {
  const helper = join(root, 'src', 'shared', 'colorParsing.js');
  const mapManager = join(root, 'src', 'app', 'mapManager.js');
  const uvCanvasLayers = join(root, 'src', 'app', 'uvCanvasLayers.js');
  const colorUtils = join(root, 'src', 'shared', 'colorUtils.js');
  const labelManager = join(root, 'src', 'features', 'labels', 'labelManager.js');
  const connectionPairs = join(root, 'src', 'features', 'connections', 'connectionPairs.js');
  const exportManager = join(root, 'src', 'features', 'export', 'exportManager.js');
  const constellationStyle = join(root, 'src', 'features', 'constellations', 'constellationStyle.js');
  const helperText = readFileSync(helper, 'utf8');
  const mapText = readFileSync(mapManager, 'utf8');
  const uvText = readFileSync(uvCanvasLayers, 'utf8');
  const colorUtilsText = readFileSync(colorUtils, 'utf8');
  const labelText = readFileSync(labelManager, 'utf8');
  const connectionText = readFileSync(connectionPairs, 'utf8');
  const exportText = readFileSync(exportManager, 'utf8');
  const constellationText = readFileSync(constellationStyle, 'utf8');

  [
    'normalizeHexColor',
    'hexToRgb255',
    'hexToUnitRgb',
    'writeUnitRgb',
    'clamp01',
    'rgbToHex',
    'normalizeInterpolationFactor',
    'interpolateHexColor',
    'interpolateColorNumber',
    'hexToRgbaString'
  ].forEach(token => {
    if (!helperText.includes(`export function ${token}`)) {
      addFailure(`Shared color parsing helper is missing ${token}: ${helper}`);
    }
  });
  if (helperText.includes("from '../vendor/three.js'") || helperText.includes('new THREE.Color')) {
    addFailure(`Shared color parsing helper must stay dependency-light and verifier-importable: ${helper}`);
  }
  ['normalizeHexColor', 'writeUnitRgb'].forEach(token => {
    if (!mapText.includes(token)) {
      addFailure(`Map manager should normalize star colors through shared color parsing helper ${token}: ${mapManager}`);
    }
  });
  if (!uvText.includes("from '../shared/colorParsing.js'") || !uvText.includes('hexToRgbaString')) {
    addFailure(`UV canvas layers should share color parsing helper: ${uvCanvasLayers}`);
  }
  if (!colorUtilsText.includes("from './colorParsing.js'") || !colorUtilsText.includes('hexToRgb255') || !colorUtilsText.includes('interpolateHexColor')) {
    addFailure(`Color utilities should delegate hex parsing to shared colorParsing: ${colorUtils}`);
  }
  if (colorUtilsText.includes('parseInt(normalized') || colorUtilsText.includes("hex.replace('#', '')")) {
    addFailure(`Color utilities should not keep a separate ad hoc hex parser: ${colorUtils}`);
  }
  if (!labelText.includes("from '../../shared/colorParsing.js'") || !labelText.includes('normalizeHexColor(star.displayColor')) {
    addFailure(`Label manager should normalize star display colors before canvas/line rendering: ${labelManager}`);
  }
  if (!connectionText.includes("from '../../shared/colorParsing.js'") || !connectionText.includes('getStarThreeColor')) {
    addFailure(`Connection rendering should normalize star display colors through a shared helper: ${connectionPairs}`);
  }
  if (!exportText.includes("from '../../shared/colorParsing.js'") || !exportText.includes('normalizeHexColor(value, fallback)')) {
    addFailure(`Mollweide SVG export should normalize colors through shared color parsing: ${exportManager}`);
  }
  if (
    !constellationText.includes("from '../../shared/colorParsing.js'")
    || !constellationText.includes('clamp01')
    || !constellationText.includes('hexToRgbaString')
    || constellationText.includes('function hexToRgb(')
  ) {
    addFailure(`Constellation styling should use shared hex parsing instead of a local parser: ${constellationStyle}`);
  }
  ['_color.set(star.displayColor', 'new THREE.Color(starA.displayColor', 'new THREE.Color(starB.displayColor'].forEach(token => {
    if (mapText.includes(token)) {
      addFailure(`Map manager should not parse star colors directly with token ${token}: ${mapManager}`);
    }
  });
  [
    [labelText, labelManager, 'lineObj.material.color.set(star.displayColor'],
    [labelText, labelManager, 'new THREE.Color(star.displayColor'],
    [connectionText, connectionPairs, 'new THREE.Color(starA.displayColor'],
    [connectionText, connectionPairs, 'new THREE.Color(starB.displayColor'],
    [connectionText, connectionPairs, 'new THREE.Color(pair.starA.displayColor'],
    [connectionText, connectionPairs, 'new THREE.Color(pair.starB.displayColor'],
    [exportText, exportManager, 'new THREE.Color(pair.starA?.displayColor'],
    [exportText, exportManager, 'new THREE.Color(pair.starB?.displayColor'],
    [exportText, exportManager, 'new THREE.Color(value || fallback']
  ].forEach(([text, file, token]) => {
    if (text.includes(token)) {
      addFailure(`Render/export color path should not parse raw displayColor with token ${token}: ${file}`);
    }
  });
}

function checkSharedOpacityClamping() {
  const files = {
    mapManager: join(root, 'src', 'app', 'mapManager.js'),
    uvMapManager: join(root, 'src', 'app', 'uvMapManager.js'),
    labelManager: join(root, 'src', 'features', 'labels', 'labelManager.js'),
    filterPipeline: join(root, 'src', 'features', 'filters', 'pipeline', 'filterPipeline.js'),
    connectionPairs: join(root, 'src', 'features', 'connections', 'connectionPairs.js'),
    exportManager: join(root, 'src', 'features', 'export', 'exportManager.js'),
    constellationRenderer: join(root, 'src', 'features', 'constellations', 'constellationMapRenderer.js')
  };
  const texts = Object.fromEntries(
    Object.entries(files).map(([key, file]) => [key, readFileSync(file, 'utf8')])
  );

  [
    ['mapManager', 'clamp01, normalizeHexColor'],
    ['labelManager', 'clamp01, normalizeHexColor'],
    ['connectionPairs', 'clamp01, normalizeHexColor'],
    ['exportManager', 'clamp01, normalizeHexColor'],
    ['filterPipeline', 'clamp01'],
    ['constellationRenderer', 'clamp01']
  ].forEach(([key, token]) => {
    if (!texts[key].includes(token)) {
      addFailure(`Opacity/color entry point should import shared clamp helpers (${token}): ${files[key]}`);
    }
  });
  if (!texts.uvMapManager.includes("from './uvCanvasLayers.js'") || !texts.uvMapManager.includes('clamp01(opacity)')) {
    addFailure(`UV map opacity setters should use shared clamp via uvCanvasLayers: ${files.uvMapManager}`);
  }
  [
    [texts.mapManager, files.mapManager, 'this.starOpacity = safeOpacity'],
    [texts.mapManager, files.mapManager, 'this.connectionOpacity = safeOpacity'],
    [texts.mapManager, files.mapManager, 'this.labelOpacity = safeOpacity'],
    [texts.mapManager, files.mapManager, 'clamp01(relativeOpacity * opacityFactor)'],
    [texts.mapManager, files.mapManager, 'clamp01(lineOpacityScale * safeOpacityFactor)'],
    [texts.uvMapManager, files.uvMapManager, 'this.starOpacity = clamp01(opacity)'],
    [texts.uvMapManager, files.uvMapManager, 'this.connectionOpacity = clamp01(opacity)'],
    [texts.uvMapManager, files.uvMapManager, 'this.labelOpacity = clamp01(opacity)'],
    [texts.labelManager, files.labelManager, 'const safeOpacity = clamp01(opacity)'],
    [texts.filterPipeline, files.filterPipeline, 'normalizeFilterOpacityOptions(filters)'],
    [texts.filterPipeline, files.filterPipeline, 'filters[key] = clamp01(filters[key])'],
    [texts.connectionPairs, files.connectionPairs, 'const safeOpacityFactor = clamp01(opacityFactor)'],
    [texts.exportManager, files.exportManager, 'clamp01(this.mollweideMap.connectionOpacity'],
    [texts.exportManager, files.exportManager, 'obj.material.opacity = clamp01'],
    [texts.constellationRenderer, files.constellationRenderer, 'clamp01(baseOpacity)'],
    [texts.constellationRenderer, files.constellationRenderer, 'clamp01(opacity)']
  ].forEach(([text, file, token]) => {
    if (!text.includes(token)) {
      addFailure(`Opacity path should use shared clamp token ${token}: ${file}`);
    }
  });

  [
    [texts.mapManager, files.mapManager, 'this.starOpacity = opacity'],
    [texts.mapManager, files.mapManager, 'this.connectionOpacity = opacity'],
    [texts.mapManager, files.mapManager, 'this.labelOpacity = opacity'],
    [texts.uvMapManager, files.uvMapManager, 'this.starOpacity = opacity'],
    [texts.uvMapManager, files.uvMapManager, 'this.connectionOpacity = opacity'],
    [texts.uvMapManager, files.uvMapManager, 'this.labelOpacity = opacity'],
    [texts.labelManager, files.labelManager, 'this.labelOpacity = opacity'],
    [texts.filterPipeline, files.filterPipeline, 'Math.max(0, Math.min(1, filters.mollweideBorderOpacity))'],
    [texts.connectionPairs, files.connectionPairs, 'lineOpacityScale * opacityFactor'],
    [texts.exportManager, files.exportManager, 'Math.min(1, obj.userData.baseOpacity * opFactor)'],
    [texts.constellationRenderer, files.constellationRenderer, 'Math.max(0, Math.min(1, baseOpacity))'],
    [texts.constellationRenderer, files.constellationRenderer, 'Math.max(0, Math.min(1, opacity))']
  ].forEach(([text, file, token]) => {
    if (text.includes(token)) {
      addFailure(`Opacity path should not use raw/unshared opacity token ${token}: ${file}`);
    }
  });
}

function checkAppStateFactoryDecoupledFromRenderer() {
  const file = join(root, 'src', 'app', 'appStateFactory.js');
  const text = readFileSync(file, 'utf8');
  if (text.includes('../vendor/three.js')) {
    addFailure(`App state factory should not import the renderer stack: ${file}`);
  }
}

function checkStlKitWorkerSplit() {
  const exporter = join(root, 'src', 'features', 'export', 'stlKitExporter.js');
  const worker = join(root, 'src', 'features', 'export', 'stlKitWorker.js');
  const payload = join(root, 'src', 'features', 'export', 'stlKitWorkerPayload.js');
  const exporterText = readFileSync(exporter, 'utf8');
  const workerText = readFileSync(worker, 'utf8');
  const payloadText = readFileSync(payload, 'utf8');

  const buildIndex = exporterText.indexOf('export async function buildPrintableSTLKitFiles');
  const workerIndex = exporterText.indexOf('buildPrintableSTLKitFilesInWorker');
  const wrapperIndex = exporterText.indexOf('export async function exportPrintableSTLKit');
  if (buildIndex < 0 || workerIndex < 0 || wrapperIndex < 0 || !(buildIndex < workerIndex && workerIndex < wrapperIndex)) {
    addFailure(`STL kit exporter must keep pure build, worker bridge, and download wrapper separated: ${exporter}`);
    return;
  }

  const buildSection = exporterText.slice(buildIndex, workerIndex);
  ['const files = []', 'files.push({', "path: 'README.txt'", 'return {'].forEach(token => {
    if (!buildSection.includes(token)) {
      addFailure(`STL kit pure build path is missing ${token}: ${exporter}`);
    }
  });
  ['globalThis.JSZip', 'downloadBlob(', 'alert(', 'new Worker('].forEach(token => {
    if (buildSection.includes(token)) {
      addFailure(`STL kit pure build path must not use browser/download API ${token}: ${exporter}`);
    }
  });

  ['new Worker(new URL', './stlKitWorker.js', "{ type: 'module' }"].forEach(token => {
    if (!exporterText.includes(token)) {
      addFailure(`STL kit export wrapper is missing worker token ${token}: ${exporter}`);
    }
  });
  ['buildPrintableSTLKitFiles', 'postMessage', 'getSTLKitTransferableBuffers'].forEach(token => {
    if (!workerText.includes(token)) {
      addFailure(`STL kit worker is missing ${token}: ${worker}`);
    }
  });
  ['createSTLKitWorkerPayload', 'serializeStarForWorker', 'serializeConnectionsForWorker', 'getSTLKitTransferableBuffers'].forEach(token => {
    if (!payloadText.includes(`export function ${token}`)) {
      addFailure(`STL kit worker payload helper is missing ${token}: ${payload}`);
    }
  });
  if (!exporterText.includes("from './stlKitWorkerPayload.js'") || !exporterText.includes('createSTLKitWorkerPayload(stars, connections, options)')) {
    addFailure(`STL kit exporter must create worker payloads through the shared helper: ${exporter}`);
  }
  ['function cloneVectorLike', 'function serializeStarForWorker', 'function serializeStarsForWorker', 'function serializeConnectionsForWorker'].forEach(token => {
    if (exporterText.includes(token)) {
      addFailure(`STL kit exporter must not keep inline worker payload helper ${token}: ${exporter}`);
    }
  });
}

function checkStlTextGlyphExtraction() {
  const exporter = join(root, 'src', 'features', 'export', 'stlKitExporter.js');
  const glyphs = join(root, 'src', 'features', 'export', 'stlTextGlyphs.js');
  const exporterText = readFileSync(exporter, 'utf8');
  const glyphText = readFileSync(glyphs, 'utf8');

  [
    'VECTOR_GLYPHS',
    'layoutDigits',
    'getGlyphLineMetrics',
    'STAR_STROKE_WIDTH_UNITS',
    'LABEL_STROKE_WIDTH_UNITS'
  ].forEach(token => {
    if (!glyphText.includes(token)) {
      addFailure(`STL text glyph helper is missing ${token}: ${glyphs}`);
    }
    if (!exporterText.includes(token)) {
      addFailure(`STL kit exporter is not wired to text glyph helper token ${token}: ${exporter}`);
    }
  });

  if (exporterText.includes('const VECTOR_GLYPHS') || exporterText.includes('function splitBalanced') || exporterText.includes('function layoutDigits')) {
    addFailure(`STL kit exporter must not keep inline glyph definitions or digit layout helpers: ${exporter}`);
  }
  if (!exporterText.includes("} from './stlTextGlyphs.js'")) {
    addFailure(`STL kit exporter must import glyph helpers from stlTextGlyphs.js: ${exporter}`);
  }
}

function checkStlFeatureDirectionExtraction() {
  const exporter = join(root, 'src', 'features', 'export', 'stlKitExporter.js');
  const featureDirections = join(root, 'src', 'features', 'export', 'stlFeatureDirections.js');
  const exporterText = readFileSync(exporter, 'utf8');
  const featureText = readFileSync(featureDirections, 'utf8');

  ['FEATURE_CANDIDATES', 'findFeatureDirection'].forEach(token => {
    if (!featureText.includes(token)) {
      addFailure(`STL feature-direction helper is missing ${token}: ${featureDirections}`);
    }
  });
  if (!exporterText.includes("from './stlFeatureDirections.js'")) {
    addFailure(`STL kit exporter must import feature direction helper: ${exporter}`);
  }
  if (exporterText.includes('const FEATURE_CANDIDATES') || exporterText.includes('for (const candidate of FEATURE_CANDIDATES)')) {
    addFailure(`STL kit exporter must not keep inline feature-direction candidate search: ${exporter}`);
  }
}

function checkStlTubeLabelLayoutExtraction() {
  const exporter = join(root, 'src', 'features', 'export', 'stlKitExporter.js');
  const helper = join(root, 'src', 'features', 'export', 'stlTubeLabelLayout.js');
  const exporterText = readFileSync(exporter, 'utf8');
  const helperText = readFileSync(helper, 'utf8');

  [
    'buildSegmentLabelBasis',
    'computeTubeLabelLayout',
    'getTubeFlatLayout',
    'getTubeLabelMaxWidth',
    'getTubeLabelMaxHeight',
    'LABEL_TEXT_WIDTH_FACTOR',
    'LABEL_TEXT_HEIGHT_FACTOR'
  ].forEach(token => {
    if (!helperText.includes(token)) {
      addFailure(`STL tube label-layout helper is missing ${token}: ${helper}`);
    }
  });
  if (!helperText.includes("from './stlVectorMath.js'") || !helperText.includes("from './stlTextGlyphs.js'")) {
    addFailure(`STL tube label-layout helper must depend on shared vector/glyph helpers: ${helper}`);
  }
  if (!exporterText.includes("from './stlTubeLabelLayout.js'")) {
    addFailure(`STL kit exporter must import tube label-layout helper: ${exporter}`);
  }
  ['function buildSegmentLabelBasis', 'function computeLabelLayout', 'const TUBE_FLAT_WIDTH', 'const LABEL_TEXT_WIDTH_FACTOR'].forEach(token => {
    if (exporterText.includes(token)) {
      addFailure(`STL kit exporter must not keep inline tube label-layout token ${token}: ${exporter}`);
    }
  });
}

function checkStlPrintOrientationExtraction() {
  const exporter = join(root, 'src', 'features', 'export', 'stlKitExporter.js');
  const helper = join(root, 'src', 'features', 'export', 'stlPrintOrientation.js');
  const exporterText = readFileSync(exporter, 'utf8');
  const helperText = readFileSync(helper, 'utf8');

  [
    'buildFeatureBasis',
    'rotatePointIntoBasis',
    'placeTrianglesOnBuildPlate',
    'orientStarForPrint'
  ].forEach(token => {
    if (!helperText.includes(`export function ${token}`)) {
      addFailure(`STL print-orientation helper is missing ${token}: ${helper}`);
    }
  });
  if (!helperText.includes("from './stlVectorMath.js'")) {
    addFailure(`STL print-orientation helper must depend on shared vector math: ${helper}`);
  }
  if (helperText.includes('CSG') || helperText.includes('trianglesToBinarySTL')) {
    addFailure(`STL print-orientation helper must stay pure and independent of CSG/STL serialization: ${helper}`);
  }
  if (!exporterText.includes("from './stlPrintOrientation.js'")) {
    addFailure(`STL kit exporter must import print-orientation helpers: ${exporter}`);
  }
  [
    'function buildFeatureBasis',
    'function rotatePointIntoBasis',
    'function placeTrianglesOnBuildPlate',
    'function orientStarForPrint'
  ].forEach(token => {
    if (exporterText.includes(token)) {
      addFailure(`STL kit exporter must not keep inline print-orientation token ${token}: ${exporter}`);
    }
  });
}

function checkStlFacetGeometryExtraction() {
  const exporter = join(root, 'src', 'features', 'export', 'stlKitExporter.js');
  const helper = join(root, 'src', 'features', 'export', 'stlFacetGeometry.js');
  const exporterText = readFileSync(exporter, 'utf8');
  const helperText = readFileSync(helper, 'utf8');

  [
    'FACET_DEPTH_FACTOR',
    'FACET_BOX_HALF_DEPTH_FACTOR',
    'FACET_BOX_HALF_EXTENT_FACTOR',
    'getFacetDepth',
    'getFacetPlaneOffset',
    'getFacetDiameter',
    'getFacetBoxHalfDepth',
    'getFacetBoxHalfExtent',
    'makePointOnFacet'
  ].forEach(token => {
    if (!helperText.includes(token)) {
      addFailure(`STL facet-geometry helper is missing ${token}: ${helper}`);
    }
  });
  if (helperText.includes('CSG') || helperText.includes('buildTubeTriangles')) {
    addFailure(`STL facet-geometry helper must stay pure and independent of mesh construction: ${helper}`);
  }
  if (!exporterText.includes("from './stlFacetGeometry.js'")) {
    addFailure(`STL kit exporter must import facet-geometry helpers: ${exporter}`);
  }
  [
    'const FACET_DEPTH_FACTOR',
    'const FACET_BOX_HALF_DEPTH_FACTOR',
    'const FACET_BOX_HALF_EXTENT_FACTOR',
    'function getFacetDepth',
    'function getFacetPlaneOffset',
    'function getFacetDiameter',
    'function makePointOnFacet'
  ].forEach(token => {
    if (exporterText.includes(token)) {
      addFailure(`STL kit exporter must not keep inline facet-geometry token ${token}: ${exporter}`);
    }
  });
}

function checkStlSocketPlanningExtraction() {
  const exporter = join(root, 'src', 'features', 'export', 'stlKitExporter.js');
  const helper = join(root, 'src', 'features', 'export', 'stlSocketPlanning.js');
  const exporterText = readFileSync(exporter, 'utf8');
  const helperText = readFileSync(helper, 'utf8');

  [
    'HOLE_TOLERANCE',
    'HOLE_RADIUS',
    'TUBE_INSERTION_DEPTH',
    'HOLE_CLUSTER_CLEARANCE',
    'Y_JUNCTION_OUTSIDE',
    'clusterHoleEndpoints',
    'getClusterMergedDirection',
    'buildSystemSocketPlan',
    'buildEndpointMap',
    'buildSystemSocketPlans',
    'buildTubeComponents',
    'buildForcedMergeMap',
    'getForcedMergeSignature'
  ].forEach(token => {
    if (!helperText.includes(token)) {
      addFailure(`STL socket-planning helper is missing ${token}: ${helper}`);
    }
  });
  if (helperText.includes('CSG') || helperText.includes('buildHoleCSG') || helperText.includes('buildTubeTriangles')) {
    addFailure(`STL socket-planning helper must stay pure and independent of CSG mesh construction: ${helper}`);
  }
  if (!exporterText.includes("from './stlSocketPlanning.js'")) {
    addFailure(`STL kit exporter must import socket-planning helpers: ${exporter}`);
  }
  [
    'const HOLE_TOLERANCE',
    'const TUBE_INSERTION_DEPTH',
    'const HOLE_CLUSTER_CLEARANCE',
    'const Y_JUNCTION_OUTSIDE',
    'function clusterHoleEndpoints',
    'function getClusterMergedDirection',
    'function buildSystemSocketPlan',
    'function buildEndpointMap',
    'function buildSystemSocketPlans',
    'function buildTubeComponents',
    'function buildForcedMergeMap',
    'function getForcedMergeSignature'
  ].forEach(token => {
    if (exporterText.includes(token)) {
      addFailure(`STL kit exporter must not keep inline socket-planning token ${token}: ${exporter}`);
    }
  });
  if (!exporterText.includes('socketPlan.holeCutters') || exporterText.includes('socketPlan.negativeSolids')) {
    addFailure(`STL kit exporter must convert pure socket hole cutters into CSG at the star-build boundary: ${exporter}`);
  }
}

function checkStlVectorMathExtraction() {
  const exporter = join(root, 'src', 'features', 'export', 'stlKitExporter.js');
  const featureDirections = join(root, 'src', 'features', 'export', 'stlFeatureDirections.js');
  const vectorMath = join(root, 'src', 'features', 'export', 'stlVectorMath.js');
  const exporterText = readFileSync(exporter, 'utf8');
  const featureText = readFileSync(featureDirections, 'utf8');
  const vectorText = readFileSync(vectorMath, 'utf8');

  [
    'vecNormalise',
    'vecDot',
    'vecCross',
    'vecAdd',
    'vecSub',
    'vecScale',
    'vecLength',
    'vecDistance'
  ].forEach(token => {
    if (!vectorText.includes(`export function ${token}`)) {
      addFailure(`STL vector math helper is missing ${token}: ${vectorMath}`);
    }
  });
  if (!exporterText.includes("from './stlVectorMath.js'")) {
    addFailure(`STL kit exporter must import shared vector math: ${exporter}`);
  }
  if (!featureText.includes("from './stlVectorMath.js'")) {
    addFailure(`STL feature-direction helper must import shared vector math: ${featureDirections}`);
  }

  [
    'function vecNormalise',
    'function vecDot',
    'function vecCross',
    'function vecAdd',
    'function vecSub',
    'function vecScale',
    'function vecLength',
    'function vecDistance'
  ].forEach(token => {
    if (exporterText.includes(token) || featureText.includes(token)) {
      addFailure(`STL modules must not keep inline vector helper ${token}: ${exporter} / ${featureDirections}`);
    }
  });
}

function checkStlKitMetadataExtraction() {
  const exporter = join(root, 'src', 'features', 'export', 'stlKitExporter.js');
  const metadata = join(root, 'src', 'features', 'export', 'stlKitMetadata.js');
  const exporterText = readFileSync(exporter, 'utf8');
  const metadataText = readFileSync(metadata, 'utf8');

  [
    'sanitizeSTLFilename',
    'getSystemName',
    'getRankingDistance',
    'getPrintableRadius',
    'buildSystemRankMap',
    'buildKitManifest'
  ].forEach(token => {
    if (!metadataText.includes(`export function ${token}`)) {
      addFailure(`STL kit metadata helper is missing ${token}: ${metadata}`);
    }
  });
  if (!exporterText.includes("from './stlKitMetadata.js'")) {
    addFailure(`STL kit exporter must import metadata helpers: ${exporter}`);
  }
  [
    'function sanitizeFilename',
    'function getRankingDistance',
    'function getPrintableRadius',
    'function buildSystemRankMap',
    'function buildKitManifest'
  ].forEach(token => {
    if (exporterText.includes(token)) {
      addFailure(`STL kit exporter must not keep inline metadata helper ${token}: ${exporter}`);
    }
  });
}

function checkEditExportSchema() {
  const schemaFile = join(root, 'src', 'features', 'editing', 'editSchema.js');
  const schemaText = readFileSync(schemaFile, 'utf8');
  [
    "export const EDIT_SCHEMA",
    "export const EDIT_SCHEMA_VERSION",
    'createEditExportPayload',
    'normalizeLabelEdits',
    'lineEdits',
    'removedLineSegments',
    'hiddenLineKeys'
  ].forEach(token => {
    if (!schemaText.includes(token)) {
      addFailure(`Edit export schema is missing ${token}: ${schemaFile}`);
    }
  });

  const persistenceFile = join(root, 'src', 'features', 'editing', 'editPersistence.js');
  const persistenceText = readFileSync(persistenceFile, 'utf8');
  ['createEditExportPayload(manager)', 'normalizeLabelEdits', 'astrography-edits.json'].forEach(token => {
    if (!persistenceText.includes(token)) {
      addFailure(`Edit persistence adapter is missing ${token}: ${persistenceFile}`);
    }
  });
}

function checkEditControlLifecycle() {
  const registryFile = join(root, 'src', 'shared', 'eventListenerRegistry.js');
  const registryText = readFileSync(registryFile, 'utf8');
  ['createEventListenerRegistry', 'addEventListener', 'removeEventListener', 'disposeAll', 'return dispose'].forEach(token => {
    if (!registryText.includes(token)) {
      addFailure(`Event listener registry is missing ${token}: ${registryFile}`);
    }
  });

  const managerFile = join(root, 'src', 'features', 'editing', 'editManager.js');
  const managerText = readFileSync(managerFile, 'utf8');
  [
    'createEventListenerRegistry',
    '_eventListeners',
    'addManagedEventListener',
    'return this._eventListeners.add(target, type, handler, options)',
    'this._eventListeners.disposeAll()',
    'this.stopRotateTransformListeners?.()',
    'this.stopScaleTransformListeners?.()',
    'this.editOverlay?.remove?.()'
  ].forEach(token => {
    if (!managerText.includes(token)) {
      addFailure(`Edit manager lifecycle cleanup is missing ${token}: ${managerFile}`);
    }
  });

  [
    join(root, 'src', 'features', 'editing', 'editIOControls.js'),
    join(root, 'src', 'features', 'editing', 'labelDragControls.js'),
    join(root, 'src', 'features', 'editing', 'transformControls.js')
  ].forEach(file => {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('addManagedEventListener')) {
      addFailure(`Edit control setup should use managed listener cleanup: ${file}`);
    }
  });

  const transformFile = join(root, 'src', 'features', 'editing', 'transformControls.js');
  const transformText = readFileSync(transformFile, 'utf8');
  [
    'replaceTransformDocumentListeners',
    'stopRotateTransformListeners',
    'stopScaleTransformListeners',
    'globalThis.document',
    'manager[key]?.()'
  ].forEach(token => {
    if (!transformText.includes(token)) {
      addFailure(`Transform controls should use disposable managed document listeners (${token}): ${transformFile}`);
    }
  });
  ['document.addEventListener', 'document.removeEventListener'].forEach(token => {
    if (transformText.includes(token)) {
      addFailure(`Transform controls should not manage document listeners directly (${token}): ${transformFile}`);
    }
  });

  if (!managerText.includes("this.addManagedEventListener(btn, 'click'") ||
      !managerText.includes("this.addManagedEventListener(this.mollweideMap.canvas, 'pointerdown', this.onLinePointerDown)")) {
    addFailure(`Edit manager line/undo controls should use managed listener cleanup: ${managerFile}`);
  }
}

function checkUvMapFilterDecoupling() {
  const file = join(root, 'src', 'app', 'uvMapManager.js');
  const text = readFileSync(file, 'utf8');
  ['readNumberInput', "getElementById('filters-form')", 'new FormData', '_inputCache', '_formDataCache'].forEach(token => {
    if (text.includes(token)) {
      addFailure(`UV map rendering should use filter options instead of DOM form reads (${token}): ${file}`);
    }
  });
  if (!text.includes('filterOptions = this.filterOptions') || !text.includes('getFilterNumber')) {
    addFailure(`UV map rendering is missing filter option snapshot plumbing: ${file}`);
  }
  if (!text.includes('!cell?.active || !cell?.globeMesh')) {
    addFailure(`UV cloud-density rendering must skip inactive overlay cells: ${file}`);
  }

  const pipeline = join(root, 'src', 'features', 'filters', 'pipeline', 'filterPipeline.js');
  const pipelineText = readFileSync(pipeline, 'utf8');
  const snapshotIndex = pipelineText.indexOf('setFilterOptions(options)');
  const opacityIndex = pipelineText.indexOf('setStarOpacity(options.starOpacity)');
  if (snapshotIndex < 0 || opacityIndex < 0 || snapshotIndex > opacityIndex) {
    addFailure(`UV filter options must be set before opacity redraws in: ${pipeline}`);
  }
}

function checkUvLayerSignatureExtraction() {
  const manager = join(root, 'src', 'app', 'uvMapManager.js');
  const managerText = readFileSync(manager, 'utf8');
  const signatureModule = join(root, 'src', 'app', 'uvLayerSignatures.js');
  const signatureText = readFileSync(signatureModule, 'utf8');
  [
    'buildFeatureLayerSignature',
    'buildLabelLayerSignature',
    'buildStarLayerSignature',
    'buildStarTopologySignature'
  ].forEach(token => {
    if (!managerText.includes(token)) {
      addFailure(`UV map manager must use extracted layer signature helper ${token}: ${manager}`);
    }
    if (!signatureText.includes(`export function ${token}`)) {
      addFailure(`UV layer signature module must export ${token}: ${signatureModule}`);
    }
  });
  ['buildFeatureLayerSignature(connections)', 'buildStarLayerSignature(stars)', 'buildLabelLayerSignature(stars)', 'buildStarTopologySignature(stars)'].forEach(token => {
    if (managerText.includes(token)) {
      addFailure(`UV map manager should not keep inline signature method ${token}: ${manager}`);
    }
  });
}

function checkUvCanvasLayerUtilityExtraction() {
  const manager = join(root, 'src', 'app', 'uvMapManager.js');
  const helper = join(root, 'src', 'app', 'uvCanvasLayers.js');
  const managerText = readFileSync(manager, 'utf8');
  const helperText = readFileSync(helper, 'utf8');

  ['rgbaFromHex', 'createLayerCanvas'].forEach(token => {
    if (!helperText.includes(`export function ${token}`)) {
      addFailure(`UV canvas-layer helper is missing ${token}: ${helper}`);
    }
  });
  if (!helperText.includes("from '../shared/colorParsing.js'") || !helperText.includes('export { clamp01 }')) {
    addFailure(`UV canvas-layer helper should re-export shared alpha clamping from colorParsing: ${helper}`);
  }
  if (!helperText.includes('hexToRgbaString(hex, alpha)')) {
    addFailure(`UV canvas-layer helper should format CSS rgba through shared color parsing: ${helper}`);
  }
  if (!helperText.includes('ATLAS_WIDTH') || !helperText.includes('ATLAS_HEIGHT')) {
    addFailure(`UV canvas-layer helper must use centralized atlas dimensions: ${helper}`);
  }
  if (!managerText.includes("from './uvCanvasLayers.js'")) {
    addFailure(`UV map manager must import canvas-layer utilities: ${manager}`);
  }
  ['function rgbaFromHex', 'function clamp01', 'function createLayerCanvas', 'const _rgbaColor'].forEach(token => {
    if (managerText.includes(token)) {
      addFailure(`UV map manager must not keep inline canvas-layer token ${token}: ${manager}`);
    }
  });
}

function checkUvOverlayCellUtilityExtraction() {
  const manager = join(root, 'src', 'app', 'uvMapManager.js');
  const helper = join(root, 'src', 'app', 'uvOverlayCells.js');
  const managerText = readFileSync(manager, 'utf8');
  const helperText = readFileSync(helper, 'utf8');

  [
    'getOverlayCellRaDec',
    'getOverlayCellUv',
    'getOverlayCellAtlasPoint',
    'getOverlayCellColor',
    'getOverlayCellOpacity',
    'getOverlayCellAlpha',
    'getAverageOverlayAlpha',
    'getOverlayDistanceRatio',
    'getScaledOverlayRadius'
  ].forEach(token => {
    if (!helperText.includes(`export function ${token}`)) {
      addFailure(`UV overlay-cell helper is missing ${token}: ${helper}`);
    }
  });
  if (!helperText.includes("from './uvCanvasLayers.js'") || !helperText.includes("from '../shared/constants.js'")) {
    addFailure(`UV overlay-cell helper must depend on shared UV canvas/atlas utilities: ${helper}`);
  }
  if (helperText.includes("from '../vendor/three.js'") || helperText.includes('MathUtils')) {
    addFailure(`UV overlay-cell helper must stay dependency-light and testable without Three.js: ${helper}`);
  }
  if (!managerText.includes("from './uvOverlayCells.js'")) {
    addFailure(`UV map manager must import overlay-cell utilities: ${manager}`);
  }
  [
    'cell1.raRad ?? 0',
    'cell2.raRad ?? 0',
    'cell1.decRad ?? 0',
    'cell2.decRad ?? 0',
    'THREE.MathUtils.lerp(12, 1, distRatio)',
    'cell.tcMesh?.material?.opacity ?? 0.35',
    'cell.globeMesh.material?.opacity ?? 0.2'
  ].forEach(token => {
    if (managerText.includes(token)) {
      addFailure(`UV overlay drawing should use overlay-cell helpers instead of inline fallback token ${token}: ${manager}`);
    }
  });
}

function checkFilterDisplayStatsCentralized() {
  const pipeline = join(root, 'src', 'features', 'filters', 'pipeline', 'index.js');
  const pipelineText = readFileSync(pipeline, 'utf8');
  ['computeDisplayStats', 'needsDisplayStats', 'displayStats'].forEach(token => {
    if (!pipelineText.includes(token)) {
      addFailure(`Filter pipeline is missing centralized display stats token ${token}: ${pipeline}`);
    }
  });

  [
    join(root, 'src', 'features', 'filters', 'logic', 'sizeFilter.js'),
    join(root, 'src', 'features', 'filters', 'logic', 'colorFilter.js'),
    join(root, 'src', 'features', 'filters', 'logic', 'opacityFilter.js')
  ].forEach(file => {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('displayStats')) {
      addFailure(`Range-dependent filter does not accept centralized display stats: ${file}`);
    }
  });
}

function checkFilterProjectionConsistency() {
  const helper = join(root, 'src', 'features', 'filters', 'state', 'filterProjectionStars.js');
  const helperText = readFileSync(helper, 'utf8');
  ['getAngularProjectionStars', 'getFilterProjectionStarId', 'isDefaultProjectionViewpointStar', 'SOL_STAR_NAME'].forEach(token => {
    if (!helperText.includes(token)) {
      addFailure(`Filter projection helper is missing ${token}: ${helper}`);
    }
  });

  [
    join(root, 'src', 'features', 'filters', 'state', 'filterDefaults.js'),
    join(root, 'src', 'features', 'filters', 'pipeline', 'index.js')
  ].forEach(file => {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('getAngularProjectionStars')) {
      addFailure(`Filter default and pipeline paths should share angular projection star exclusion: ${file}`);
    }
  });
}

function checkConnectionSignatureCoverage() {
  const manager = join(root, 'src', 'app', 'mapManager.js');
  const helper = join(root, 'src', 'features', 'connections', 'connectionRenderState.js');
  const managerText = readFileSync(manager, 'utf8');
  const helperText = readFileSync(helper, 'utf8');

  [
    'getConnectionPairKey',
    'haveSameKeys',
    'buildConnectionVisualSignature',
    'buildConnectionBoundsSignature',
    'getConnectionDistanceBounds',
    'resetConnectionDistanceBoundsCache'
  ].forEach(token => {
    if (!helperText.includes(`export function ${token}`)) {
      addFailure(`Connection render-state helper is missing ${token}: ${helper}`);
    }
  });
  ['mixHash', 'hashString', 'Number(pair?.distance).toPrecision(12)', 'connections.length'].forEach(token => {
    if (!helperText.includes(token)) {
      addFailure(`Connection render-state helper is missing signature token ${token}: ${helper}`);
    }
  });
  if (!managerText.includes("from '../features/connections/connectionRenderState.js'")) {
    addFailure(`Map manager must import connection render-state helper: ${manager}`);
  }
  [
    'function getConnectionPairKey',
    'function haveSameKeys',
    'function buildConnectionVisualSignature',
    'function buildConnectionBoundsSignature',
    'function getConnectionDistanceBounds'
  ].forEach(token => {
    if (managerText.includes(token)) {
      addFailure(`Map manager must not keep inline connection render-state helper ${token}: ${manager}`);
    }
  });
  if (helperText.includes('return connectionObjs.length') || helperText.includes('`${connectionObjs.length}`')) {
    addFailure(`Connection bounds signature must not collapse to only connection count: ${helper}`);
  }
}

function checkOverlayFilterOptionDecoupling() {
  [
    join(root, 'src', 'features', 'density', 'densityOverlay.js'),
    join(root, 'src', 'features', 'isolation', 'isolationOverlay.js')
  ].forEach(file => {
    const text = readFileSync(file, 'utf8');
    ['getElementById', 'density-slider', 'isolation-slider', 'tolerance-slider'].forEach(token => {
      if (text.includes(token)) {
        addFailure(`Overlay update logic should use filter options instead of DOM reads (${token}): ${file}`);
      }
    });
    if (!text.includes('options = {}')) {
      addFailure(`Overlay update logic is missing filter option plumbing: ${file}`);
    }
  });

  const stateFile = join(root, 'src', 'features', 'filters', 'state', 'filterOverlayState.js');
  const stateText = readFileSync(stateFile, 'utf8');
  if (!stateText.includes('updateIsolationFilter(allStars, isolationOverlay, normalizedScenes.tc, normalizedScenes.globe, normalizedScenes.moll, filters)') ||
      !stateText.includes('updateDensityFilter(allStars, densityOverlay, normalizedScenes.tc, normalizedScenes.globe, normalizedScenes.moll, filters)')) {
    addFailure(`Overlay state manager must pass normalized filters into density/isolation updates: ${stateFile}`);
  }
}

function checkOverlayInstancing() {
  const helper = join(root, 'src', 'features', 'overlays', 'instancedCellLayer.js');
  const helperText = readFileSync(helper, 'utf8');
  ['class InstancedCellLayer', 'InstancedMesh', 'instanceOpacity', 'createCellVisualState'].forEach(token => {
    if (!helperText.includes(token)) {
      addFailure(`Instanced overlay helper is missing ${token}: ${helper}`);
    }
  });

  [
    join(root, 'src', 'features', 'density', 'densityOverlay.js'),
    join(root, 'src', 'features', 'clouds', 'cloudDensityOverlay.js'),
    join(root, 'src', 'features', 'isolation', 'isolationOverlay.js')
  ].forEach(file => {
    const text = readFileSync(file, 'utf8');
    ['InstancedCellLayer', 'createCellVisualState', 'getSceneObjects()'].forEach(token => {
      if (!text.includes(token)) {
        addFailure(`Grid overlay is missing batched cell rendering token ${token}: ${file}`);
      }
    });
    [
      'new THREE.Mesh(cubeGeometry',
      'new THREE.Mesh(planeGeometry',
      'new THREE.Mesh(circleGeometry',
      'baseMaterial.clone()',
      'planeBaseMaterial.clone()',
      'planeBase.clone()'
    ].forEach(token => {
      if (text.includes(token)) {
        addFailure(`Grid overlay reintroduced per-cell mesh/material creation (${token}): ${file}`);
      }
    });
  });

  [
    join(root, 'src', 'features', 'filters', 'state', 'filterOverlayState.js'),
    join(root, 'src', 'features', 'filters', 'pipeline', 'filterPipeline.js')
  ].forEach(file => {
    const text = readFileSync(file, 'utf8');
    if (!text.includes('getSceneObjects')) {
      addFailure(`Overlay lifecycle cleanup must use batched scene objects: ${file}`);
    }
  });
}

function checkRuntimeDataValidation() {
  const validators = join(root, 'src', 'data', 'dataValidation.js');
  const validatorText = readFileSync(validators, 'utf8');
  [
    'validateManifestFiles',
    'validateStarBatch',
    'validateCloudData',
    'validateConstellationCenters',
    'validateConstellationFullNames',
    'validateStellarClassData'
  ].forEach(token => {
    if (!validatorText.includes(`function ${token}`) && !validatorText.includes(`function ${token}`.replace('function ', 'export function '))) {
      addFailure(`Runtime data validator is missing ${token}: ${validators}`);
    }
  });

  [
    [join(root, 'src', 'data', 'loaders', 'loadStarData.js'), ['validateManifestFiles', 'validateStarBatch']],
    [join(root, 'src', 'features', 'clouds', 'cloudDataCache.js'), ['validateCloudData']],
    [join(root, 'src', 'features', 'constellations', 'constellationDataService.js'), ['validateConstellationCenters', 'validateConstellationFullNames']],
    [join(root, 'src', 'features', 'filters', 'logic', 'stellarClassData.js'), ['validateStellarClassData']]
  ].forEach(([file, tokens]) => {
    const text = readFileSync(file, 'utf8');
    tokens.forEach(token => {
      if (!text.includes(token)) {
        addFailure(`Loader is missing runtime validation call ${token}: ${file}`);
      }
    });
  });
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function assertUnfiltered(source, rawLength, validLength) {
  if (rawLength !== validLength) {
    addFailure(`Runtime data validation rejected ${rawLength - validLength} record(s): ${source}`);
  }
}

function checkRuntimeDataFiles() {
  try {
    const manifestPath = join(root, 'data', 'manifest.json');
    const manifestFiles = validateManifestFiles(readJson(manifestPath), manifestPath);
    manifestFiles.forEach(name => {
      const path = join(root, 'data', name);
      const raw = readJson(path);
      const valid = validateStarBatch(raw, path);
      assertUnfiltered(path, raw.length, valid.length);
    });

    walk(join(root, 'data'), file => file.endsWith('_cloud_data.json')).forEach(path => {
      const raw = readJson(path);
      const valid = validateCloudData(raw, path);
      assertUnfiltered(path, raw.length, valid.length);
    });

    const centersPath = join(root, 'constellation_center.json');
    const rawCenters = readJson(centersPath);
    const validCenters = validateConstellationCenters(rawCenters, centersPath);
    assertUnfiltered(centersPath, rawCenters.length, validCenters.length);

    const namesPath = join(root, 'constellation_full_names.json');
    const rawNames = readJson(namesPath);
    const validNames = validateConstellationFullNames(rawNames, namesPath);
    assertUnfiltered(namesPath, Object.keys(rawNames).length, Object.keys(validNames).length);

    const classesPath = join(root, 'stellar_class.json');
    const rawClasses = readJson(classesPath);
    const validClasses = validateStellarClassData(rawClasses, classesPath);
    assertUnfiltered(classesPath, Object.keys(rawClasses).length, Object.keys(validClasses).length);
  } catch (error) {
    addFailure(`Runtime data validation failed: ${error.message}`);
  }
}

async function checkBehavioralInvariants() {
  assertEqual(
    formatUserError('PNG export failed', new Error('Renderer unavailable')),
    'PNG export failed: Renderer unavailable',
    'User error notification formatting'
  );
  const scopedControl = { id: 'control:1' };
  const scopedContainer = {
    ownerDocument: {
      getElementById: id => (id === 'control:1' ? scopedControl : { id })
    },
    contains: element => element === scopedControl
  };
  assert(
    getElementByIdWithin(scopedContainer, 'control:1') === scopedControl,
    'Scoped form ID lookup should use getElementById without requiring CSS.escape'
  );
  assertEqual(
    getElementByIdWithin(scopedContainer, 'outside'),
    null,
    'Scoped form ID lookup should reject elements outside the container'
  );
  const memoryStorage = new Map();
  const fakeStorage = {
    getItem: key => memoryStorage.get(key) ?? null,
    setItem: (key, value) => memoryStorage.set(key, String(value)),
    removeItem: key => memoryStorage.delete(key)
  };
  assertEqual(writeStorageItem('preset', 'value', { storage: fakeStorage }), true, 'Storage helper write success');
  assertEqual(readStorageItem('preset', { storage: fakeStorage }), 'value', 'Storage helper read success');
  assertEqual(removeStorageItem('preset', { storage: fakeStorage }), true, 'Storage helper remove success');
  assertEqual(readStorageItem('preset', { storage: fakeStorage, fallback: 'missing' }), 'missing', 'Storage helper missing fallback');
  assertEqual(readStorageItem('preset', { storage: null, fallback: 'unavailable' }), 'unavailable', 'Storage helper unavailable fallback');
  const storageErrors = [];
  const throwingStorage = {
    getItem: () => { throw new Error('read denied'); },
    setItem: () => { throw new Error('write denied'); },
    removeItem: () => { throw new Error('remove denied'); }
  };
  assertEqual(
    readStorageItem('preset', { storage: throwingStorage, fallback: 'blocked', onError: error => storageErrors.push(error.message) }),
    'blocked',
    'Storage helper throwing read fallback'
  );
  assertEqual(
    writeStorageItem('preset', 'value', { storage: throwingStorage, onError: error => storageErrors.push(error.message) }),
    false,
    'Storage helper throwing write false'
  );
  assertEqual(
    removeStorageItem('preset', { storage: throwingStorage, onError: error => storageErrors.push(error.message) }),
    false,
    'Storage helper throwing remove false'
  );
  assertArrayEqual(storageErrors, ['read denied', 'write denied', 'remove denied'], 'Storage helper should report storage errors');
  const projectionParent = { id: 'projection-parent' };
  const projectionDocument = {
    getElementById: id => (id === 'map3D' ? { parentElement: projectionParent } : null)
  };
  assertEqual(
    getProjectionContainer('map3D', projectionDocument),
    projectionParent,
    'Projection lookup should return the map container for existing canvases'
  );
  assertEqual(
    getProjectionContainer('missing-map', projectionDocument),
    null,
    'Projection lookup should tolerate missing optional canvases'
  );
  assertArrayEqual(
    getCanvasDisplaySize({ clientWidth: 0, clientHeight: 0, width: 0, height: 0 }),
    { width: 1, height: 1 },
    'Canvas sizing should never return zero dimensions'
  );
  assertArrayEqual(
    getCanvasDisplaySize({
      clientWidth: 0,
      clientHeight: 0,
      width: 300,
      height: 150,
      getBoundingClientRect: () => ({ width: 123.4, height: 56.6 })
    }),
    { width: 123, height: 57 },
    'Canvas sizing should prefer rendered bounds when client dimensions are unavailable'
  );
  assertArrayEqual(
    getSceneSnapshotSize({
      renderer: { domElement: { width: 100, height: 100 } },
      canvas: {
        clientWidth: 0,
        clientHeight: 0,
        width: 100,
        height: 100,
        getBoundingClientRect: () => ({ width: 400, height: 100 })
      }
    }),
    { width: 7680, height: 1920 },
    'Scene snapshot exports should preserve display aspect instead of stale backing-buffer aspect'
  );
  try {
    getSceneSnapshotSize({});
    addFailure('Scene snapshot sizing should reject managers without any canvas.');
  } catch (error) {
    assert(
      String(error.message).includes('no exportable size'),
      'Scene snapshot missing-canvas error should mention exportable size'
    );
  }
  const exportSizingCanvas = {
    clientWidth: 0,
    clientHeight: 0,
    width: 400,
    height: 200,
    getBoundingClientRect: () => ({ width: 800, height: 400 })
  };
  assertArrayEqual(
    getMollweideCropPixels(
      { x: 200, y: 100, width: 400, height: 200 },
      exportSizingCanvas,
      1600,
      800
    ),
    { cropX: 400, cropY: 200, cropW: 800, cropH: 400 },
    'Mollweide raster crop should convert display-space selections to backing pixels safely'
  );
  assertArrayEqual(
    getMollweideCropPixels(
      { x: -20, y: 100, width: 900, height: 400 },
      exportSizingCanvas,
      1600,
      800
    ),
    { cropX: 0, cropY: 200, cropW: 1600, cropH: 600 },
    'Mollweide raster crop should clamp selections to the export backing canvas'
  );
  assertArrayEqual(
    getMollweideSvgViewBox(
      { x: 200, y: 100, width: 400, height: 200 },
      {
        clientWidth: 0,
        clientHeight: 0,
        width: 400,
        height: 200,
        getBoundingClientRect: () => ({ width: 800, height: 400 })
      },
      200,
      { x: 0, y: 0 }
    ),
    { minX: -100, minY: -50, width: 200, height: 100 },
    'SVG export viewBox should use safe display dimensions for crop conversion'
  );
  const originalWindowForSizing = globalThis.window;
  try {
    globalThis.window = { devicePixelRatio: 5 };
    assertEqual(getClampedDevicePixelRatio(), 2, 'Canvas sizing should clamp high device pixel ratios');
  } finally {
    globalThis.window = originalWindowForSizing;
  }
  const rendererCalls = [];
  configureRendererForCanvas({
    setPixelRatio: ratio => rendererCalls.push(['ratio', ratio]),
    setSize: (width, height, updateStyle) => rendererCalls.push(['size', width, height, updateStyle])
  }, { clientWidth: 0, clientHeight: 0, width: 64, height: 32 }, { maxPixelRatio: 1.5 });
  assertArrayEqual(
    rendererCalls,
    [['ratio', 1], ['size', 64, 32, false]],
    'Canvas renderer configuration should set safe pixel ratio and size without mutating CSS size'
  );
  let frameStamp = null;
  const frameResult = scheduleAnimationFrame(stamp => {
    frameStamp = stamp;
  }, {
    requestAnimationFrame: callback => {
      callback(123);
      return 17;
    }
  });
  assertEqual(frameResult, 17, 'Render scheduler should return native animation-frame handles');
  assertEqual(frameStamp, 123, 'Render scheduler should use native animation-frame timestamps');

  const fallbackFrameCalls = [];
  const fallbackFrameResult = scheduleAnimationFrame(() => {
    fallbackFrameCalls.push('frame');
  }, {
    setTimeout: (callback, delay) => {
      fallbackFrameCalls.push(delay);
      callback();
      return 23;
    }
  });
  assertEqual(fallbackFrameResult, 23, 'Render scheduler should return fallback timeout handles');
  assertArrayEqual(fallbackFrameCalls, [16, 'frame'], 'Render scheduler should fall back to a 16ms timeout');

  const nativeCancelCalls = [];
  cancelScheduledAnimationFrame(44, {
    cancelAnimationFrame: handle => nativeCancelCalls.push(handle)
  });
  assertArrayEqual(nativeCancelCalls, [44], 'Render scheduler should use native animation-frame cancellation');

  const fallbackCancelCalls = [];
  cancelScheduledAnimationFrame(55, {
    clearTimeout: handle => fallbackCancelCalls.push(handle)
  });
  assertArrayEqual(fallbackCancelCalls, [55], 'Render scheduler should fall back to timeout cancellation');

  const afterPaintCalls = [];
  await new Promise(resolve => {
    scheduleAfterPaint(() => {
      afterPaintCalls.push('paint');
      resolve();
    }, {
      requestAnimationFrame: callback => {
        afterPaintCalls.push('raf');
        callback(456);
        return 31;
      },
      setTimeout: (callback, delay) => {
        afterPaintCalls.push(delay);
        callback();
        return 32;
      }
    });
  });
  assertArrayEqual(afterPaintCalls, ['raf', 0, 'paint'], 'After-paint scheduling should yield through RAF then timeout');
  assertEqual(parseFontPixelSize('300 72.5px Oswald'), 72.5, 'Text canvas helper should parse decimal font pixel sizes');
  const textCanvasCalls = [];
  const fakeTextCanvasDocument = {
    createElement: tag => {
      assertEqual(tag, 'canvas', 'Text canvas helper should create a canvas');
      return {
        width: 0,
        height: 0,
        getContext: kind => {
          assertEqual(kind, '2d', 'Text canvas helper should request a 2D context');
          return {
            measureText: text => ({ width: text.length * 9 }),
            fillText: (text, x, y) => textCanvasCalls.push(['fillText', text, x, y])
          };
        }
      };
    }
  };
  const textCanvas = createMeasuredTextCanvas('Ly', {
    documentRef: fakeTextCanvasDocument,
    font: '24px Oswald',
    paddingX: 10,
    paddingY: 5,
    fillStyle: '#abcdef'
  });
  assertEqual(textCanvas.canvas.width, 38, 'Text canvas helper should include horizontal padding in measured width');
  assertEqual(textCanvas.canvas.height, 34, 'Text canvas helper should derive height from font size and vertical padding');
  assertArrayEqual(textCanvasCalls, [['fillText', 'Ly', 10, 17]], 'Text canvas helper should draw default middle-baseline text');
  assertEqual(
    await readTextFile({ text: async () => 'modern file text' }),
    'modern file text',
    'Local file reader should use File.text when available'
  );
  class FakeFileReader {
    readAsText(file) {
      this.result = file.value;
      this.onload();
    }
  }
  assertEqual(
    await readTextFile({ value: 'fallback file text' }, { FileReaderCtor: FakeFileReader }),
    'fallback file text',
    'Local file reader should fall back to FileReader'
  );
  try {
    await readTextFile({});
    addFailure('Local file reader should reject when no file APIs are available.');
  } catch (error) {
    assert(
      String(error.message).includes('cannot read local text files'),
      'Local file reader unsupported error should mention local text files'
    );
  }
  class FakeDataUrlReader {
    readAsDataURL(blob) {
      this.result = `data:${blob.type};base64,ZmFrZQ==`;
      this.onload();
    }
  }
  assertEqual(
    await canvasToPngDataUrl({
      toBlob: callback => callback(new Blob(['fake'], { type: 'image/png' })),
      toDataURL: () => 'data:image/png;base64,unused'
    }, { FileReaderCtor: FakeDataUrlReader }),
    'data:image/png;base64,ZmFrZQ==',
    'Canvas PDF image helper should prefer Blob/FileReader conversion'
  );
  assertEqual(
    await canvasToPngDataUrl({
      toBlob: callback => callback(null),
      toDataURL: () => 'data:image/png;base64,fallback'
    }, { FileReaderCtor: FakeDataUrlReader }),
    'data:image/png;base64,fallback',
    'Canvas PDF image helper should keep a contained toDataURL fallback'
  );
  const removedViaParent = [];
  const removable = { parentNode: { removeChild: element => removedViaParent.push(element) } };
  removeElement(removable);
  assert(removedViaParent[0] === removable, 'Download helper should remove elements without HTMLElement.remove');
  const downloadLog = [];
  let lastLink = null;
  const fakeDocument = {
    body: {
      appendChild: link => {
        link.parentNode = fakeDocument.body;
        downloadLog.push(['append', link.download]);
      },
      removeChild: link => downloadLog.push(['remove', link.download])
    },
    createElement: tagName => {
      const link = {
        tagName,
        style: {},
        click: () => downloadLog.push(['click', link.href])
      };
      lastLink = link;
      return link;
    }
  };
  const fakeUrlApi = {
    createObjectURL: blob => {
      downloadLog.push(['create', blob.size]);
      return 'blob:download-test';
    },
    revokeObjectURL: url => downloadLog.push(['revoke', url])
  };
  downloadBlob(new Blob(['x'], { type: 'text/plain' }), 'test.txt', {
    URLApi: fakeUrlApi,
    documentRef: fakeDocument,
    setTimeoutFn: callback => callback()
  });
  assertEqual(lastLink.download, 'test.txt', 'Download helper should set filename on the link');
  assertArrayEqual(
    downloadLog,
    [
      ['create', 1],
      ['append', 'test.txt'],
      ['click', 'blob:download-test'],
      ['remove', 'test.txt'],
      ['revoke', 'blob:download-test']
    ],
    'Download helper should append, click, remove, and revoke via injectable browser APIs'
  );
  const listenerLog = [];
  const fakeTarget = {
    addEventListener: (type, handler, options) => listenerLog.push(['add', type, handler, options]),
    removeEventListener: (type, handler, options) => listenerLog.push(['remove', type, handler, options])
  };
  const managedHandler = () => {};
  const listenerRegistry = createEventListenerRegistry();
  const disposeManagedClick = listenerRegistry.add(fakeTarget, 'click', managedHandler, { passive: true });
  assert(disposeManagedClick, 'Event listener registry should accept valid targets');
  assertEqual(listenerRegistry.size, 1, 'Event listener registry should track listener count');
  disposeManagedClick();
  disposeManagedClick();
  assertEqual(listenerRegistry.size, 0, 'Event listener registry should let individual disposers remove one listener once');
  assertEqual(listenerLog.length, 2, 'Managed listener individual disposer add/remove count');
  assertArrayEqual(
    listenerLog.map(([action, type]) => [action, type]),
    [['add', 'click'], ['remove', 'click']],
    'Managed listener individual disposer should remove listeners exactly once'
  );
  listenerRegistry.add(fakeTarget, 'pointermove', managedHandler);
  listenerRegistry.add(fakeTarget, 'pointerup', managedHandler);
  assertEqual(listenerRegistry.size, 2, 'Event listener registry should track listeners after individual disposal');
  listenerRegistry.disposeAll();
  assertEqual(listenerRegistry.size, 0, 'Event listener registry should clear listener count after dispose');
  assertEqual(listenerLog.length, 6, 'Managed listener add/remove count');
  assertArrayEqual(
    listenerLog.map(([action, type]) => [action, type]),
    [
      ['add', 'click'],
      ['remove', 'click'],
      ['add', 'pointermove'],
      ['add', 'pointerup'],
      ['remove', 'pointerup'],
      ['remove', 'pointermove']
    ],
    'Managed listener registry should remove listeners on dispose'
  );
  assert(listenerLog[1][2] === managedHandler, 'Managed listener registry should remove the same listener reference');

  const stars = [
    { starId: 'a', distance: 1, viewpointDistance: 3, apparentMagnitude: 1.2, absoluteMagnitude: 4, z_coordinate: -2 },
    { starId: 'b', distance: 8, viewpointDistance: 8, apparentMagnitude: 7.1, absoluteMagnitude: 1, z_coordinate: 5 },
    { starId: 'c', distance: 22, viewpointDistance: 12, apparentMagnitude: 4.9, absoluteMagnitude: 9, z_coordinate: 0 }
  ];

  assertArrayEqual(
    applyDistanceFilter(stars, { minDistance: 2, maxDistance: 10 }).map(star => star.starId),
    ['a', 'b'],
    'Distance filter must prefer viewpointDistance and include range bounds'
  );

  assertArrayEqual(
    applyStarsShownFilter(stars, { starsShown: 'visible', visibleMagnitudeLimit: 5 }).map(star => star.starId),
    ['a', 'c'],
    'Visible-star filter must honor finite apparent magnitude limit'
  );
  const projectionStars = [
    { starId: 'Sol', Common_name_of_the_star: 'Sol' },
    { starId: 'alpha', Common_name_of_the_star: 'Alpha' },
    { starId: 'beta', Common_name_of_the_star_system: 'Beta' }
  ];
  assertEqual(
    getFilterProjectionStarId({ Common_name_of_the_star_system: 'System Name' }),
    'System Name',
    'Filter projection helper should use stable star naming fallbacks'
  );
  assert(isDefaultProjectionViewpointStar(projectionStars[0]), 'Filter projection helper should identify Sol as default viewpoint');
  assertArrayEqual(
    getAngularProjectionStars(projectionStars).map(star => star.starId),
    ['alpha', 'beta'],
    'Default angular projections should exclude Sol'
  );
  assertArrayEqual(
    getAngularProjectionStars(projectionStars, 'alpha').map(star => star.starId),
    ['Sol', 'beta'],
    'Non-Sol angular projections should exclude the active viewpoint star and keep Sol visible'
  );

  assert(needsDisplayStats({ size: 'distance' }), 'Display stats should be required for distance sizing');
  assert(needsDisplayStats({ color: 'galactic-plane' }), 'Display stats should be required for galactic-plane coloring');
  assert(needsDisplayStats({ opacity: 'absolute-magnitude' }), 'Display stats should be required for absolute-magnitude opacity');
  assert(!needsDisplayStats({ size: 'fixed', color: 'stellar-class', opacity: '1' }), 'Display stats should not be required for fixed/non-range modes');

  const stats = computeDisplayStats(stars);
  assertEqual(stats.distanceMin, 1, 'Display stats distanceMin');
  assertEqual(stats.distanceMax, 22, 'Display stats distanceMax');
  assertEqual(stats.maxAbsZ, 5, 'Display stats maxAbsZ');
  assertEqual(stats.absoluteMagnitudeMin, 1, 'Display stats absoluteMagnitudeMin');
  assertEqual(stats.absoluteMagnitudeMax, 9, 'Display stats absoluteMagnitudeMax');

  assertEqual(computeAdaptiveGridSize(3), 5, 'Positive adaptive grid size');
  assertEqual(computeAdaptiveGridSize(-3), 0.5, 'Negative adaptive grid size');

  const formData = new FormData();
  formData.set('size', 'distance');
  formData.set('color', 'stellar-class');
  formData.set('opacity', 'absolute-magnitude');
  formData.set('stars-shown', 'visible');
  formData.set('connections', '9');
  formData.set('connection-mode', 'k-nearest');
  formData.set('connection-k-nearest', '4');
  formData.set('min-distance', '2');
  formData.set('max-distance', '30');
  formData.set('dust-cloud-mode', 'density');
  formData.append('dust-clouds', 'data/local_cloud_data.json');
  formData.set('cloud-density-radius', '6.5');
  formData.set('cloud-density-opacity', '75');
  formData.set('enable-density-filter', 'on');
  formData.set('density-opacity', '60');
  const filters = readFilterState(formData);
  assertEqual(filters.connectionMode, 'k-nearest', 'Filter state connection mode');
  assertEqual(filters.connectionKNearest, 4, 'Filter state k-nearest count');
  assertEqual(filters.minDistance, 2, 'Filter state min distance');
  assertEqual(filters.maxDistance, 30, 'Filter state max distance');
  assertEqual(filters.showCloudDensity, true, 'Filter state cloud-density mode');
  assertEqual(filters.showClouds, false, 'Filter state legacy cloud mode');
  assertEqual(filters.cloudDensityRadius, 6.5, 'Filter state cloud-density radius');
  assertEqual(filters.cloudDensityOpacity, 0.75, 'Filter state cloud-density opacity');
  assertEqual(filters.enableDensityFilter, true, 'Filter state density toggle');
  assertEqual(filters.densityOpacity, 0.6, 'Filter state density opacity');

  const connectionA = {
    pairKey: 'a|b',
    starA: { starId: 'a', displayColor: '#ffffff' },
    starB: { starId: 'b', displayColor: '#ff0000' },
    distance: 3
  };
  const connectionB = {
    starA: { starId: 'b', displayColor: '#ff0000' },
    starB: { starId: 'c', displayColor: '#00ff00' },
    distance: 10
  };
  assertEqual(getConnectionPairKey(connectionA), 'a|b', 'Connection pair key should prefer stored pairKey');
  assertEqual(getConnectionPairKey(connectionB), 'b|c', 'Connection pair key should fall back to star ids');
  assert(haveSameKeys(['a|b', 'b|c'], ['a|b', 'b|c']), 'Connection key comparison should accept same ordered keys');
  assert(!haveSameKeys(['a|b', 'b|c'], ['b|c', 'a|b']), 'Connection key comparison should detect reordered keys');
  assert(
    buildConnectionVisualSignature([connectionA], 'sol') !== buildConnectionVisualSignature([connectionA], 'sirius'),
    'Connection visual signature should include viewpoint'
  );
  assert(
    buildConnectionVisualSignature([connectionA], 'sol') !== buildConnectionVisualSignature([
      { ...connectionA, starA: { ...connectionA.starA, displayColor: '#0000ff' } }
    ], 'sol'),
    'Connection visual signature should include endpoint colors'
  );
  assert(
    buildConnectionBoundsSignature([connectionA]) !== buildConnectionBoundsSignature([{ ...connectionA, distance: 4 }]),
    'Connection bounds signature should include distance'
  );
  resetConnectionDistanceBoundsCache();
  const connectionBounds = getConnectionDistanceBounds([connectionA, connectionB]);
  assertArrayEqual(connectionBounds, { largestDistance: 10, smallestDistance: 3 }, 'Connection distance bounds');
  assert(
    getConnectionDistanceBounds([connectionA, connectionB]) === connectionBounds,
    'Connection distance bounds should reuse cached result for same signature'
  );
  resetConnectionDistanceBoundsCache();
  assert(
    getConnectionDistanceBounds([connectionA, connectionB]) !== connectionBounds,
    'Connection distance bounds cache reset should force recomputation'
  );
  assertArrayEqual(
    getConnectionDistanceBounds([{ distance: 'not-a-number' }]),
    { largestDistance: 0, smallestDistance: 0 },
    'Connection distance bounds should tolerate malformed distances'
  );

  const uvStars = [
    { starId: 'uv-a', displayColor: '#ffffff', displaySize: 1, displayName: 'Alpha', displayLabelSize: 1 },
    { starId: 'uv-b', displayColor: '#ff9900', displaySize: 2, displayName: 'Beta', displayLabelSize: 1.5 }
  ];
  const uvConnections = [
    { pairKey: 'uv-a|uv-b', starA: uvStars[0], starB: uvStars[1] }
  ];
  const uvState = {
    showConstellationOverlayFlag: false,
    showConstellationBoundariesFlag: false,
    enableDensityFilterFlag: false,
    enableIsolationFilterFlag: false,
    showCloudsFlag: false,
    showCloudDensityFlag: true,
    showGalacticPlaneFlag: false,
    showEclipticPlaneFlag: false,
    showCelestialEquatorFlag: false,
    densityOverlay: { revision: 1 },
    isolationOverlay: { revision: 1 }
  };
  const uvSignatureContext = {
    state: uvState,
    filterOptions: {
      cloudDensityRadius: 5,
      cloudDensityOpacity: 0.75,
      selectedDustClouds: ['data/Local_cloud_data.json']
    },
    starOpacity: 1,
    labelOpacity: 1,
    connectionOpacity: 0.5,
    viewpointStarId: 'sol'
  };
  assertEqual(
    getDustCloudSignature({ selectedDustClouds: ['a', 'b'], dustCloudMode: 'legacy' }),
    'legacy:a|b',
    'UV dust cloud signature'
  );
  assertEqual(clampUvAlpha(-1), 0, 'UV alpha clamp lower bound');
  assertEqual(clampUvAlpha(2), 1, 'UV alpha clamp upper bound');
  assertEqual(clampUvAlpha('not-a-number'), 0, 'UV alpha clamp invalid input');
  assertEqual(clampShared01(Number.NaN), 0, 'Shared color alpha clamp invalid input');
  assertEqual(uvRgbaFromHex('#336699', 0.5), 'rgba(51, 102, 153, 0.5)', 'UV hex color conversion');
  assertEqual(uvRgbaFromHex('not-a-color', 2), 'rgba(255, 255, 255, 1)', 'UV invalid color fallback');
  assertEqual(uvRgbaFromHex('not-a-color', Number.NaN), 'rgba(255, 255, 255, 0)', 'UV invalid alpha fallback');
  assertEqual(normalizeHexColor('#abc'), '#aabbcc', 'Shared color parsing should expand short hex');
  assertEqual(normalizeHexColor(0x123abc), '#123abc', 'Shared color parsing should normalize numeric colors');
  assertEqual(normalizeHexColor('not-a-color', '#010203'), '#010203', 'Shared color parsing should use fallback colors');
  assertArrayEqual(hexToRgb255('#336699'), { r: 51, g: 102, b: 153 }, 'Shared color parsing 8-bit RGB');
  assertArrayEqual(hexToUnitRgb('#804020'), {
    r: 128 / 255,
    g: 64 / 255,
    b: 32 / 255
  }, 'Shared color parsing unit RGB');
  assertArrayEqual(hexToRgb255('bad-color'), { r: 255, g: 255, b: 255 }, 'Shared color parsing should use invalid color fallback');
  assertEqual(rgbToHex(300, -5, 15.4), '#ff000f', 'Shared color parsing should clamp RGB-to-hex channels');
  assertEqual(interpolateHexColor('bad-color', '#000000', 0.5), '#808080', 'Shared color parsing should interpolate invalid colors from fallback white');
  assertEqual(interpolateColorNumber('#000000', '#ffffff', 2), 0xffffff, 'Shared color parsing should clamp interpolation factors above 1');
  assertEqual(interpolateColorNumber('#000000', '#ffffff', -1), 0x000000, 'Shared color parsing should clamp interpolation factors below 0');
  assertEqual(hexToRgbaString('bad-color', 0.25), 'rgba(255, 255, 255, 0.25)', 'Shared color parsing RGBA should use invalid color fallback');
  assertEqual(hexToRgbaString('bad-color', Number.NaN), 'rgba(255, 255, 255, 0)', 'Shared color parsing RGBA should clamp invalid alpha');
  assertArrayEqual(parseCssColorToRgba('#336699cc'), { r: 51, g: 102, b: 153, a: 0.8 }, 'CSS color parser should parse 8-digit hex');
  assertArrayEqual(parseCssColorToRgba('rgb(10 20 30 / 50%)'), { r: 10, g: 20, b: 30, a: 0.5 }, 'CSS color parser should parse modern rgb syntax');
  assertArrayEqual(parseCssColorToRgba('rgba(10%, 20%, 30%, 0.25)'), { r: 25.5, g: 51, b: 76.5, a: 0.25 }, 'CSS color parser should parse percentage rgb syntax');
  assertArrayEqual(parseCssColorToRgba('color(srgb 0.1 0.2 0.3 / 25%)'), { r: 25.5, g: 51, b: 76.5, a: 0.25 }, 'CSS color parser should parse color(srgb) syntax');
  assertEqual(parseCssColorToRgba('transparent'), null, 'CSS color parser should ignore transparent backgrounds');
  assertEqual(parseCssColorToRgba('not-a-color'), null, 'CSS color parser should reject unsupported colors');
  const colorBuffer = [0, 0, 0, 0, 0, 0];
  writeUnitRgb(colorBuffer, 3, 'bad-color', '#0f0');
  assertArrayEqual(colorBuffer, [0, 0, 0, 0, 1, 0], 'Shared color parsing should write fallback unit RGB into render buffers');
  const fakeCanvasContext = { kind: '2d' };
  const fakeLayer = createUvLayerCanvas({
    createElement: tag => ({
      tag,
      getContext: kind => (kind === '2d' ? fakeCanvasContext : null)
    })
  });
  assertEqual(fakeLayer.canvas.width, ATLAS_WIDTH, 'UV layer canvas width');
  assertEqual(fakeLayer.canvas.height, ATLAS_HEIGHT, 'UV layer canvas height');
  assertEqual(fakeLayer.ctx, fakeCanvasContext, 'UV layer canvas context');
  try {
    createUvLayerCanvas({ createElement: () => ({ getContext: () => null }) });
    addFailure('UV layer canvas helper should reject missing 2D contexts');
  } catch (error) {
    assert(
      error.message.includes('2D canvas context unavailable'),
      'UV layer canvas helper missing-context error'
    );
  }
  const uvProjectors = {
    raDecToUV: (ra, dec) => ({ u: ra, v: dec }),
    spherePositionToUv: (position, radius) => ({ u: position.x / radius, v: position.y / radius })
  };
  const raDecCell = { raRad: '0.25', decRad: 0.75 };
  assertArrayEqual(getOverlayCellRaDec(raDecCell), { ra: 0.25, dec: 0.75 }, 'UV overlay cell RA/Dec extraction');
  assertArrayEqual(getOverlayCellUv(raDecCell, uvProjectors), { u: 0.25, v: 0.75 }, 'UV overlay cell RA/Dec projection');
  const globeCell = { globeMesh: { position: { x: 25, y: 50 } } };
  assertArrayEqual(getOverlayCellUv(globeCell, { ...uvProjectors, sphereRadius: 100 }), { u: 0.25, v: 0.5 }, 'UV overlay cell globe-position projection');
  assertEqual(getOverlayCellUv({}, uvProjectors), null, 'UV overlay cell missing projection');
  const atlasCell = getOverlayCellAtlasPoint(raDecCell, uvProjectors);
  assertArrayEqual(
    atlasCell,
    { u: 0.25, v: 0.75, x: ATLAS_WIDTH * 0.25, y: ATLAS_HEIGHT * 0.75 },
    'UV overlay cell atlas point'
  );
  const materialCell = {
    tcMesh: { material: { color: { getHexString: () => '123abc' }, opacity: 0.25 } },
    globeMesh: { material: { color: { getHexString: () => 'ff6600' }, opacity: 0.75 } },
    tcPos: { length: () => 10 }
  };
  assertEqual(getOverlayCellColor(materialCell, 'tcMesh', '#000000'), '#123abc', 'UV overlay cell material color');
  assertEqual(getOverlayCellColor({}, 'tcMesh', '#000000'), '#000000', 'UV overlay cell fallback color');
  assertEqual(getOverlayCellOpacity(materialCell, 'tcMesh', 0.1), 0.25, 'UV overlay cell material opacity');
  assertEqual(getOverlayCellOpacity({}, 'tcMesh', 0.1), 0.1, 'UV overlay cell fallback opacity');
  assertEqual(getOverlayCellAlpha(materialCell, { meshKey: 'globeMesh', fallbackOpacity: 0.2, opacityFactor: 2 }), 1, 'UV overlay cell alpha clamping');
  assertEqual(getAverageOverlayAlpha(materialCell, { tcMesh: { material: { opacity: 0.75 } } }, { opacityFactor: 0.5 }), 0.25, 'UV overlay average alpha');
  assertEqual(getOverlayDistanceRatio(materialCell, 20), 0.5, 'UV overlay distance ratio');
  assertEqual(getOverlayDistanceRatio({}, 20), 0.5, 'UV overlay fallback distance ratio');
  assertEqual(
    getScaledOverlayRadius(materialCell, { gridSize: 2, maxDistance: 20 }, { minRadius: 3, radiusFactor: 0.5 }),
    6.5,
    'UV overlay scaled radius'
  );
  assert(
    buildStarTopologySignature(uvStars, uvSignatureContext) !== buildStarTopologySignature(uvStars, { ...uvSignatureContext, viewpointStarId: 'uv-a' }),
    'UV topology signature should include viewpoint'
  );
  assert(
    buildStarLayerSignature(uvStars, uvSignatureContext) !== buildStarLayerSignature(uvStars, { ...uvSignatureContext, starOpacity: 0.5 }),
    'UV star signature should include star opacity'
  );
  assert(
    buildLabelLayerSignature(uvStars, uvSignatureContext) !== buildLabelLayerSignature(uvStars, {
      ...uvSignatureContext,
      state: { ...uvState, showConstellationNamesFlag: true }
    }),
    'UV label signature should include constellation name visibility'
  );
  assert(
    buildFeatureLayerSignature(uvConnections, uvSignatureContext) !== buildFeatureLayerSignature(uvConnections, {
      ...uvSignatureContext,
      filterOptions: { ...uvSignatureContext.filterOptions, cloudDensityRadius: 6 }
    }),
    'UV feature signature should include cloud-density radius'
  );

  assertEqual(
    normalizeCloudStarName(' Alpha\u00a0Centauri-A '),
    'alpha centauri a',
    'Cloud star normalization should collapse spaces and punctuation'
  );
  assertEqual(
    normalizeCloudStarName('Ｓｉｒｉｕｓ / B'),
    'sirius b',
    'Cloud star normalization should normalize Unicode compatibility characters'
  );

  const printableStar = {
    starId: 'sol',
    Common_name_of_the_star: 'Sol',
    Common_name_of_the_star_system: 'Sol',
    Stellar_class: 'G2V',
    distance: 0,
    truePosition: { x: 0, y: 0, z: 0 }
  };
  const kit = await buildPrintableSTLKitFiles([printableStar], [], { allStars: [printableStar] });
  assert(kit, 'STL kit builder should return a result for printable stars');
  assertEqual(kit.summary.starCount, 1, 'STL kit star count');
  assertEqual(kit.summary.tubeCount, 0, 'STL kit tube count');
  assert(kit.files.some(file => file.path === 'README.txt' && file.text.includes('Astrography 3D Print Kit')), 'STL kit should include README metadata');
  const stlFile = kit.files.find(file => file.path === 'stars/1_Sol.stl');
  assert(stlFile?.buffer instanceof ArrayBuffer, 'STL kit should include a star STL ArrayBuffer');
  assert(stlFile?.buffer?.byteLength > 84, 'STL star buffer should contain binary STL data');

  assertEqual(sanitizeSTLFilename('Alpha / Beta:*?'), 'Alpha_Beta', 'STL filename sanitizer');
  assertEqual(
    getSystemName({
      Common_name_of_the_star_system: 'Alpha System',
      Common_name_of_the_star: 'Alpha',
      starId: 'alpha'
    }),
    'Alpha System',
    'STL system-name preference'
  );
  const rankMap = buildSystemRankMap([
    {
      starId: 'far',
      Common_name_of_the_star_system: 'Far',
      Stellar_class: 'G2V',
      absoluteMagnitude: 5,
      distance: 10
    },
    {
      starId: 'near',
      Common_name_of_the_star_system: 'Near',
      Stellar_class: 'G2V',
      absoluteMagnitude: 5,
      distance: 2
    }
  ]);
  assertEqual(rankMap.get('Near'), 1, 'STL system rank map should rank nearer systems first');
  assertEqual(rankMap.get('Far'), 2, 'STL system rank map should retain farther systems');
  const manifest = buildKitManifest({
    sourceStarCount: 2,
    inputConnectionCount: 1,
    exportedSystemCount: 2,
    printableConnectionCount: 0,
    starFileCount: 2,
    tubeFileCount: 0,
    skippedConnections: [{ sysA: 'A', sysB: 'B', reason: 'too short' }]
  });
  assert(manifest.includes('Scale: 1 LY = 5 mm'), 'STL kit manifest should include shared scale');
  assert(manifest.includes('Tube diameter: 4 mm'), 'STL kit manifest should include shared tube diameter');
  assert(manifest.includes('- A -> B: too short'), 'STL kit manifest should include skipped connection details');

  const tubeFlatLayout = getTubeFlatLayout(10);
  assertEqual(tubeFlatLayout.flatLength, 7.6, 'STL tube flat layout should reserve rounded end margins');
  assertEqual(tubeFlatLayout.flatWidth, 3.6, 'STL tube flat layout should use capped flat width');
  assert(
    Math.abs(tubeFlatLayout.surfaceZ - 0.8717797887081347) < 1e-9,
    'STL tube flat layout should compute the flat crown surface height'
  );
  assert(Math.abs(getTubeLabelMaxWidth(tubeFlatLayout) - 6.46) < 1e-9, 'STL tube label max width');
  assert(Math.abs(getTubeLabelMaxHeight(tubeFlatLayout) - 2.808) < 1e-9, 'STL tube label max height');
  assertArrayEqual(
    computeTubeLabelLayout('12', tubeFlatLayout).lines,
    ['12'],
    'STL tube label layout should keep short labels on one line'
  );
  const segmentBasis = buildSegmentLabelBasis([0, 0, 4], [0, 0, 1]);
  assertArrayEqual(segmentBasis.axisX, [0, 0, 1], 'STL segment label basis axisX');
  assertArrayEqual(segmentBasis.axisY, [1, 0, 0], 'STL segment label basis fallback axisY');
  assertArrayEqual(segmentBasis.axisZ, [0, 1, 0], 'STL segment label basis fallback axisZ');

  const featureBasis = buildFeatureBasis([0, 0, 1]);
  assertArrayEqual(featureBasis.right, [1, 0, 0], 'STL print feature basis right axis');
  assertArrayEqual(featureBasis.up, [0, 1, 0], 'STL print feature basis up axis');
  assertArrayEqual(featureBasis.forward, [0, 0, 1], 'STL print feature basis forward axis');
  const verticalFeatureBasis = buildFeatureBasis([0, 1, 0]);
  assertArrayEqual(verticalFeatureBasis.right, [0, 0, 1], 'STL print feature basis vertical fallback right axis');
  assertArrayEqual(verticalFeatureBasis.up, [1, 0, 0], 'STL print feature basis vertical fallback up axis');
  assertArrayEqual(
    rotatePointIntoBasis([1, 2, 3], featureBasis),
    [1, 2, 3],
    'STL print orientation should project points into the feature basis'
  );
  const floatingTriangles = [{ a: [0, 0, -2], b: [1, 0, 3], c: [0, 1, 1] }];
  const placedTriangles = placeTrianglesOnBuildPlate(floatingTriangles);
  assertArrayEqual(placedTriangles[0].a, [0, 0, 0], 'STL build-plate placement should lift the minimum z');
  assertArrayEqual(placedTriangles[0].b, [1, 0, 5], 'STL build-plate placement should preserve triangle shape');
  assertArrayEqual(floatingTriangles[0].a, [0, 0, -2], 'STL build-plate placement should not mutate source triangles');
  const printedTriangles = orientStarForPrint(floatingTriangles, [0, 0, 1]);
  assertEqual(printedTriangles.length, 1, 'STL print orientation should preserve triangle count');
  assertArrayEqual(printedTriangles[0].a, [0, 0, 0], 'STL print orientation should place the model on the build plate');

  assertEqual(FACET_DEPTH_FACTOR, 0.3, 'STL facet depth factor');
  assertEqual(FACET_BOX_HALF_DEPTH_FACTOR, 1.5, 'STL facet trim box depth factor');
  assertEqual(FACET_BOX_HALF_EXTENT_FACTOR, 2.2, 'STL facet trim box extent factor');
  assertEqual(getFacetDepth(10), 3, 'STL facet depth');
  assertEqual(getFacetPlaneOffset(10), 7, 'STL facet plane offset');
  assert(Math.abs(getFacetDiameter(10) - 14.2828568570857) < 1e-12, 'STL facet diameter');
  assertEqual(getFacetBoxHalfDepth(10), 15, 'STL facet trim box half depth');
  assertEqual(getFacetBoxHalfExtent(10), 22, 'STL facet trim box half extent');
  assertArrayEqual(
    makePointOnFacet([1, 0, 0], [0, 1, 0], [0, 0, 1], 2, 3, 4),
    [2, 3, 4],
    'STL facet point transform in canonical basis'
  );
  assertArrayEqual(
    makePointOnFacet([0, 0, 1], [0, 1, 0], [1, 0, 0], 2, 3, 4),
    [4, 3, 2],
    'STL facet point transform in rotated basis'
  );

  assertEqual(HOLE_TOLERANCE, 0.15, 'STL socket hole tolerance');
  assertEqual(HOLE_RADIUS, 2.15, 'STL socket hole radius');
  assertEqual(TUBE_INSERTION_DEPTH, 4, 'STL socket tube insertion depth');
  assertEqual(HOLE_CLUSTER_CLEARANCE, 0.4, 'STL socket cluster clearance');
  assertEqual(Y_JUNCTION_OUTSIDE, 4.5, 'STL socket external junction distance');
  const socketClusters = clusterHoleEndpoints([
    { connectionId: 1, dir: [1, 0, 0] },
    { connectionId: 2, dir: [0.98, 0.2, 0] },
    { connectionId: 3, dir: [-1, 0, 0] }
  ], 10);
  assertArrayEqual(
    socketClusters.map(cluster => cluster.length).sort((a, b) => a - b),
    [1, 2],
    'STL socket clustering should group physically overlapping holes'
  );
  const mergedDirection = getClusterMergedDirection([{ dir: [1, 0, 0] }, { dir: [0, 1, 0] }]);
  assert(Math.abs(mergedDirection[0] - Math.SQRT1_2) < 1e-12, 'STL socket merged direction x');
  assert(Math.abs(mergedDirection[1] - Math.SQRT1_2) < 1e-12, 'STL socket merged direction y');
  assertArrayEqual(getClusterMergedDirection([{ dir: [1, 0, 0] }, { dir: [-1, 0, 0] }]), [1, 0, 0], 'STL socket opposing merge fallback');
  const endpointMap = buildEndpointMap([{ id: 7, sysA: 'A', sysB: 'B', dirA: [1, 0, 0], dirB: [-1, 0, 0] }]);
  assertEqual(endpointMap.get('A')[0].otherSystem, 'B', 'STL socket endpoint map should include opposite system');
  const forcedSocketPlan = buildSystemSocketPlan('A / B', [
    { connectionId: 11, dir: [1, 0, 0] },
    { connectionId: 12, dir: [0, 1, 0] }
  ], 10, [[11, 12]]);
  assertEqual(forcedSocketPlan.clusters.length, 1, 'STL forced socket merge cluster count');
  assertEqual(forcedSocketPlan.clusters[0].merged, true, 'STL forced socket merge flag');
  assertEqual(forcedSocketPlan.connectionClusters.get(11), forcedSocketPlan.connectionClusters.get(12), 'STL forced socket merge connection map');
  assertEqual(forcedSocketPlan.holeCutters[0].innerDist, 6, 'STL socket hole cutter inner distance');
  assertEqual(forcedSocketPlan.holeCutters[0].outerDist, 11, 'STL socket hole cutter outer distance');
  assert(forcedSocketPlan.clusters[0].id.startsWith('A_B__'), 'STL socket cluster ids should be filename-safe');
  const socketSystemInfo = new Map([
    ['A', { radius: 10, rank: 1, posMM: { x: 0, y: 0, z: 0 } }],
    ['B', { radius: 10, rank: 2, posMM: { x: 20, y: 0, z: 0 } }]
  ]);
  const socketConnections = [{ id: 7, sysA: 'A', sysB: 'B', dirA: [1, 0, 0], dirB: [-1, 0, 0] }];
  const socketPlans = buildSystemSocketPlans(socketSystemInfo, socketConnections);
  const socketComponents = buildTubeComponents(socketSystemInfo, socketPlans, socketConnections);
  assertEqual(socketComponents.length, 1, 'STL socket component count');
  assertEqual(socketComponents[0].edges.length, 1, 'STL socket component edge count');
  assertArrayEqual(socketComponents[0].edges[0].pointA, [6, 0, 0], 'STL socket component world point A');
  assertArrayEqual(socketComponents[0].edges[0].pointB, [14, 0, 0], 'STL socket component world point B');
  assertArrayEqual(toWorldPoint(socketSystemInfo.get('B'), [-1, 2, 3]), [19, 2, 3], 'STL socket local-to-world point');
  assertArrayEqual(mergeConnectionGroups([[3, 2], [2, 1], [8], null]), [[1, 2, 3]], 'STL socket forced merge group union');
  const forcedMergeMap = buildForcedMergeMap([{
    clusters: [
      { systemName: 'A', connectionIds: [1] },
      { systemName: 'A', connectionIds: [2] },
      { systemName: 'B', connectionIds: [3] }
    ]
  }]);
  assertArrayEqual(forcedMergeMap.get('A'), [[1, 2]], 'STL socket forced merge map');
  assertEqual(
    getForcedMergeSignature(new Map([['B', [[2, 3]]], ['A', [[1, 2]]]])),
    '[["A",[[1,2]]],["B",[[2,3]]]]',
    'STL socket forced merge signature should be sorted'
  );

  assertArrayEqual(vecNormalise(3, 0, 4), [0.6, 0, 0.8], 'STL vector normalisation');
  assertEqual(vecDot([1, 2, 3], [4, -5, 6]), 12, 'STL vector dot product');
  assertArrayEqual(vecCross([1, 0, 0], [0, 1, 0]), [0, 0, 1], 'STL vector cross product');
  assertArrayEqual(vecAdd([1, 2, 3], [4, 5, 6]), [5, 7, 9], 'STL vector addition');
  assertArrayEqual(vecSub([4, 5, 6], [1, 2, 3]), [3, 3, 3], 'STL vector subtraction');
  assertArrayEqual(vecScale([1, -2, 3], 2), [2, -4, 6], 'STL vector scaling');
  assertEqual(vecLength([2, 3, 6]), 7, 'STL vector length');
  assertEqual(vecDistance([1, 2, 3], [4, 6, 3]), 5, 'STL vector distance');

  const workerStar = {
    starId: 'worker-a',
    Common_name_of_the_star: 'Worker A',
    Common_name_of_the_star_system: 'Worker System A',
    Stellar_class: 'K2V',
    absoluteMagnitude: 6,
    distance: 3,
    truePosition: { x: '1.5', y: null, z: -2 }
  };
  const serializedStar = serializeStarForWorker(workerStar);
  assertArrayEqual(
    serializedStar.truePosition,
    { x: 1.5, y: 0, z: -2 },
    'STL worker star serialization should clone vector-like positions'
  );
  assertArrayEqual(
    serializeStarsForWorker([workerStar, null]).map(star => star.starId),
    ['worker-a'],
    'STL worker star serialization should skip empty stars'
  );
  assertArrayEqual(
    serializeConnectionsForWorker([{ starA: workerStar, starB: printableStar }, null]).map(connection => [
      connection.starA?.starId ?? null,
      connection.starB?.starId ?? null
    ]),
    [['worker-a', 'sol'], [null, null]],
    'STL worker connection serialization should keep malformed entries non-throwing'
  );
  const workerPayload = createSTLKitWorkerPayload([workerStar], [], {});
  assertEqual(workerPayload.stars[0].starId, 'worker-a', 'STL worker payload stars');
  assertEqual(workerPayload.options.allStars[0].starId, 'worker-a', 'STL worker payload allStars fallback');
  const transferable = new ArrayBuffer(8);
  const transferableBuffers = getSTLKitTransferableBuffers({ files: [{ buffer: transferable }, { text: 'README' }, { buffer: 'not-a-buffer' }] });
  assertEqual(transferableBuffers.length, 1, 'STL worker transferable buffer count');
  assert(transferableBuffers[0] === transferable, 'STL worker transferable buffer identity');

  assert(Array.isArray(VECTOR_GLYPHS['0']) && VECTOR_GLYPHS['0'].length > 0, 'STL text glyphs should include digit outlines');
  assertArrayEqual(layoutDigits('12'), ['12'], 'STL digit layout should keep two digits on one line');
  assertArrayEqual(layoutDigits('1234'), ['12', '34'], 'STL digit layout should split four digits over two lines');
  assertArrayEqual(layoutDigits('12345'), ['12', '34', '5'], 'STL digit layout should split five digits over three lines');
  assertArrayEqual(
    getGlyphLineMetrics(['12', '34']),
    { maxWidthUnits: 2.22, totalHeightUnits: 2.3 },
    'STL glyph line metrics'
  );
  assertEqual(FEATURE_CANDIDATES.length, 26, 'STL feature direction candidate count');
  assertArrayEqual(findFeatureDirection([]), [0, 1, 0], 'STL feature direction fallback');
  const chosenFeatureDirection = findFeatureDirection([[1, 0, 0], [-1, 0, 0]]);
  assert(
    Math.abs(chosenFeatureDirection[0]) < 0.75,
    'STL feature direction should avoid occupied opposing X tube directions'
  );

  const editManager = {
    starLabelOffsets: new Map([['sol', { x: 1.25, y: -2.5 }]]),
    starLabelRotations: new Map([['sol', 0.75]]),
    starLabelScales: new Map([['sol', { x: 1.1, y: 0.9 }]]),
    constellationLabelOffsets: new Map([['ori', { x: 3, y: 4 }]]),
    galacticLabelOffsets: new Map([['north', { x: -1, y: 2 }]]),
    removedLineSegments: new Set(['0,0,0,1,1,1']),
    hiddenLineKeys: new Set(['line:sol:sirius'])
  };
  const editPayload = createEditExportPayload(editManager, '2026-01-02T03:04:05.000Z');
  assertEqual(editPayload.schema, EDIT_SCHEMA, 'Edit export schema id');
  assertEqual(editPayload.version, EDIT_SCHEMA_VERSION, 'Edit export schema version');
  assertEqual(editPayload.exportedAt, '2026-01-02T03:04:05.000Z', 'Edit export timestamp override');
  assertArrayEqual(editPayload.edits.lineEdits.removedSegments, ['0,0,0,1,1,1'], 'Edit export removed line segments');
  assertArrayEqual(editPayload.edits.lineEdits.hiddenLines, ['line:sol:sirius'], 'Edit export hidden line keys');

  const normalizedEdits = normalizeLabelEdits(editPayload);
  assertArrayEqual(normalizedEdits.starOffsets, [['sol', { x: 1.25, y: -2.5 }]], 'Edit import star offsets');
  assertArrayEqual(normalizedEdits.starRotations, [['sol', 0.75]], 'Edit import star rotations');
  assertArrayEqual(normalizedEdits.starScales, [['sol', { x: 1.1, y: 0.9 }]], 'Edit import star scales');
  assertArrayEqual(normalizedEdits.constellationOffsets, [['ori', { x: 3, y: 4 }]], 'Edit import constellation offsets');
  assertArrayEqual(normalizedEdits.galacticOffsets, [['north', { x: -1, y: 2 }]], 'Edit import galactic offsets');
  assertArrayEqual(normalizedEdits.removedLineSegments, ['0,0,0,1,1,1'], 'Edit import removed line segments');
  assertArrayEqual(normalizedEdits.hiddenLineKeys, ['line:sol:sirius'], 'Edit import hidden line keys');

  const legacyEdits = normalizeLabelEdits({
    schema: 'astrography-label-edits',
    edits: {
      starOffsets: [['legacy-star', { x: 5, y: 6 }]]
    }
  });
  assertArrayEqual(legacyEdits.starOffsets, [['legacy-star', { x: 5, y: 6 }]], 'Legacy edit import star offsets');
  assertArrayEqual(legacyEdits.removedLineSegments, [], 'Legacy edit import missing line edits');

  try {
    normalizeLabelEdits({ schema: 'unknown-edit-schema', edits: {} });
    addFailure('Edit import should reject unsupported schema ids.');
  } catch (error) {
    assert(
      String(error.message).includes('Unsupported edit file schema'),
      'Edit import unsupported schema error should mention schema'
    );
  }

  try {
    normalizeLabelEdits({ edits: { starOffsets: [['bad', { x: Infinity, y: 0 }]] } });
    addFailure('Edit import should reject non-finite label offsets.');
  } catch (error) {
    assert(
      String(error.message).includes('finite x and y'),
      'Edit import non-finite offset error should mention finite x and y'
    );
  }
}

function getHtmlScriptEntries() {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const scriptPattern = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  const entries = [];
  for (const match of html.matchAll(scriptPattern)) {
    const specifier = match[1].split(/[?#]/)[0];
    if (/^[a-z]+:/i.test(specifier) || specifier.startsWith('//')) continue;
    const file = resolve(root, specifier.replace(/^\/+/, ''));
    if (existsSync(file) && file.endsWith('.js')) entries.push(file);
  }
  return entries;
}

function checkNoOrphanSourceFiles(files) {
  const sourceFiles = new Set(files.map(file => resolve(file)));
  const seen = new Set();
  const stack = [
    join(root, 'src', 'main.js'),
    ...getHtmlScriptEntries()
  ].map(file => resolve(file)).filter(file => sourceFiles.has(file));

  while (stack.length) {
    const file = stack.pop();
    if (seen.has(file)) continue;
    seen.add(file);

    for (const specifier of getRelativeImportSpecifiers(file)) {
      const imported = resolveRelativeImport(file, specifier);
      if (imported && sourceFiles.has(resolve(imported))) {
        stack.push(resolve(imported));
      }
    }
  }

  for (const file of sourceFiles) {
    if (!seen.has(file)) {
      addFailure(`Orphaned source file is not reachable from an HTML entry point: ${file}`);
    }
  }
}

const jsFiles = walk(join(root, 'src'), file => file.endsWith('.js'));
const cssFiles = walk(join(root, 'styles'), file => file.endsWith('.css'));

checkJavaScriptSyntax(jsFiles);
checkRelativeImports(jsFiles);
checkCentralizedThreeImport(jsFiles);
checkCssBraces(cssFiles);
checkRequiredHtmlControls();
checkExportRendererConfiguration();
checkExportSizingSafety();
checkExportRuntimeDependencies();
checkSvgExportFidelity();
checkFullscreenCompatibility();
checkSidebarAccessibility();
checkProjectionVisibilityRobustness();
checkUserNotificationsCentralized(jsFiles);
checkTooltipStylesCentralized();
checkCssEscapeCompatibility(jsFiles);
checkCanvasSizingCentralized();
checkCentralizedObjectChildDisposal();
checkRenderSchedulingCentralized(jsFiles);
checkTextCanvasCentralized();
checkLocalFileReadCompatibility();
checkStorageAccessCompatibility(jsFiles);
checkCentralizedHashing();
checkSharedColorParsing();
checkSharedOpacityClamping();
checkAppStateFactoryDecoupledFromRenderer();
checkStlKitWorkerSplit();
checkStlTextGlyphExtraction();
checkStlFeatureDirectionExtraction();
checkStlTubeLabelLayoutExtraction();
checkStlPrintOrientationExtraction();
checkStlFacetGeometryExtraction();
checkStlSocketPlanningExtraction();
checkStlVectorMathExtraction();
checkStlKitMetadataExtraction();
checkEditExportSchema();
checkEditControlLifecycle();
checkUvMapFilterDecoupling();
checkUvLayerSignatureExtraction();
checkUvCanvasLayerUtilityExtraction();
checkUvOverlayCellUtilityExtraction();
checkFilterDisplayStatsCentralized();
checkFilterProjectionConsistency();
checkConnectionSignatureCoverage();
checkOverlayFilterOptionDecoupling();
checkOverlayInstancing();
checkRuntimeDataValidation();
checkRuntimeDataFiles();
await checkBehavioralInvariants();
checkNoOrphanSourceFiles(jsFiles);

if (failures.length) {
  console.error(failures.join('\n\n'));
  process.exit(1);
}

console.log(`Verified ${jsFiles.length} JS files and ${cssFiles.length} CSS files.`);
