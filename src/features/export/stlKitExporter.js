/**
 * @file 3D-printable STL kit exporter for the True Coordinates map.
 *
 * Produces a ZIP file containing:
 * - stars/  -> one STL per star system (sphere with connection holes + engraved rank)
 * - tubes/  -> branchable tube parts, including Y pieces where star holes merge
 *
 * Assembly: tubes slide directly into the matching holes in star spheres.
 * No separate joints or connectors.
 *
 * Physical scale:
 *   1 LY  = 5 mm
 *   Standard star diameter = 16 mm
 *   Tube diameter = 4 mm
 */

import { CSG } from '../../vendor/csg.js';
import { downloadBlob } from './downloadUtils.js';
import { getJsZipConstructor } from './pdfUtils.js';
import { logInfo, logWarn } from '../../shared/logger.js';
import { validateBinarySTL } from './stlValidation.js';
import {
  buildSphereTriangles,
  trianglesToBinarySTL
} from './stlExporter.js';
import {
  STL_MM_PER_LY,
  STL_STANDARD_STAR_DIAMETER_MM,
  STL_TUBE_RADIUS_MM
} from './stlScale.js';
import { findFeatureDirection } from './stlFeatureDirections.js';
import {
  orientStarForPrint,
  placeTrianglesOnBuildPlate
} from './stlPrintOrientation.js';
import {
  buildKitManifest,
  buildSystemRankMap,
  sanitizeSTLFilename
} from './stlKitMetadata.js';
import { createSTLKitWorkerPayload } from './stlKitWorkerPayload.js';
import {
  buildForcedMergeMap,
  buildSystemSocketPlans,
  buildTubeComponents,
  getForcedMergeSignature
} from './stlSocketPlanning.js';
import {
  assertNotAborted,
  createAbortError,
  reportBuildProgress,
  reportExportProgress,
  yieldToBrowser
} from './stlKitProgress.js';
import { endPerformanceMeasure, startPerformanceMeasure } from '../../shared/performanceMetrics.js';
import {
  buildPrintableConnectionPlan,
  buildPrintableSystemInfo
} from './stlKitPlanning.js';
import {
  buildFacetTrimCSG,
  buildHoleCSG,
  buildStarNumberCSG,
  buildTubeComponentCSG,
  unionAllCSG
} from './stlKitCsg.js';

// ---------------------------------------------------------------------------
// Physical dimensions (mm)
// ---------------------------------------------------------------------------

const KIT_MM_PER_LY = STL_MM_PER_LY;

// Stars
const STANDARD_DIAMETER_MM = STL_STANDARD_STAR_DIAMETER_MM;

// Tubes
const KIT_TUBE_RADIUS = STL_TUBE_RADIUS_MM;
const EXPORT_HEAVY_YIELD_INTERVAL = 2;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Export a 3D-printable kit as a ZIP of individual STL files.
 *
 * The ZIP contains:
 *   stars/   - one STL per system (sphere with holes + engraved rank)
 *   tubes/   - straight or branched tube parts, with Y pieces when holes merge
 *
 * @param {Array}  stars       Currently filtered/displayed stars.
 * @param {Array}  connections Current connection pairs.
 * @param {Object} [options]
 * @param {Array}  [options.allStars] Full heliocentric dataset for global numbering.
 */
export async function buildPrintableSTLKitFiles(stars, connections, options = {}) {
  const timer = startPerformanceMeasure('export.stlKit.build', {
    stars: stars?.length || 0,
    connections: connections?.length || 0
  });
  const signal = options.signal;
  assertNotAborted(signal);

  if (!stars || stars.length === 0) {
    endPerformanceMeasure(timer, { skipped: true });
    return null;
  }

  // Build printable system metadata.
  const rankMap = buildSystemRankMap(options.allStars?.length ? options.allStars : stars);
  reportBuildProgress(options, 0.02, 'Preparing printable systems');
  const { systemInfo } = buildPrintableSystemInfo(stars, rankMap, { mmPerLy: KIT_MM_PER_LY });
  await yieldToBrowser(signal);
  reportBuildProgress(options, 0.16, 'Preparing printable systems');

  // Build all printable connection pairs.
  reportBuildProgress(options, 0.16, 'Planning printable connections');
  const { candidateConnections, skippedConnections } = buildPrintableConnectionPlan(connections, systemInfo);
  await yieldToBrowser(signal);
  reportBuildProgress(options, 0.30, 'Planning printable connections');

  // Build printable file buffers.
  const allConnections = candidateConnections;
  let forcedMergeMap = new Map();
  let socketPlans = buildSystemSocketPlans(systemInfo, allConnections, forcedMergeMap);
  let tubeComponents = buildTubeComponents(systemInfo, socketPlans, allConnections);

  // Rebuild until a finished removable part no longer asks to plug into the
  // same sphere more than once. When that happens, we collapse those terminal
  // hits into one new merged socket and one medium extremity.
  for (let pass = 0; pass < 6; pass += 1) {
    const nextForcedMergeMap = buildForcedMergeMap(tubeComponents);
    if (getForcedMergeSignature(nextForcedMergeMap) === getForcedMergeSignature(forcedMergeMap)) break;

    forcedMergeMap = nextForcedMergeMap;
    socketPlans = buildSystemSocketPlans(systemInfo, allConnections, forcedMergeMap);
    tubeComponents = buildTubeComponents(systemInfo, socketPlans, allConnections);
    reportBuildProgress(options, 0.30 + 0.05 * ((pass + 1) / 6), 'Resolving printable socket merges');
    await yieldToBrowser(signal);
  }

  const files = [];

  const maxRank = rankMap.size;
  const padDigits = String(maxRank).length;
  const padRank = (r) => String(r).padStart(padDigits, '0');

  let starCount = 0;
  let tubeCount = 0;
  const exportedSystemTotal = Math.max(1, systemInfo.size);
  const tubeComponentTotal = Math.max(1, tubeComponents.length);
  reportBuildProgress(options, 0.36, 'Building star STL files');

  // Stars
  for (const [systemName, info] of systemInfo) {
    const radius = info.radius;
    const socketPlan = socketPlans.get(systemName) || {
      connectionClusters: new Map(),
      clusters: [],
      openingDirections: [],
      holeCutters: []
    };
    const holeDirs = socketPlan.openingDirections;

    // Find best direction for engraved rank number (away from holes)
    const engravingDir = findFeatureDirection(holeDirs);

    // Build sphere with only the actual printable hole positions cut into it.
    const positiveSolids = [
      CSG.fromTriangles(buildSphereTriangles(0, 0, 0, radius, 32, 32))
    ];
    const cutSolids = [];

    // Cut flat facet for engraved number
    const facet = buildFacetTrimCSG(engravingDir, radius);
    cutSolids.push(facet.csg);

    // Engrave rank number
    if (Number.isFinite(info.rank)) {
      cutSolids.push(buildStarNumberCSG(String(info.rank), engravingDir, facet));
    }

    // Socket cutters are planned from the same overlap-merge logic used for
    // the branched tube parts, so stars and removable parts stay aligned.
    for (const cutter of socketPlan.holeCutters || []) {
      cutSolids.push(buildHoleCSG(cutter.holeDir, cutter.innerDist, cutter.outerDist));
    }

    let csg = unionAllCSG(positiveSolids);
    if (cutSolids.length) {
      csg = csg.subtract(unionAllCSG(cutSolids));
    }

    // Orient for print (engraved face up) and place on build plate
    const triangles = orientStarForPrint(csg.toTriangles(), engravingDir);
    const stlBuffer = trianglesToBinarySTL(triangles);

    const rankStr = Number.isFinite(info.rank) ? padRank(info.rank) : '00';
    files.push({
      path: `stars/${rankStr}_${sanitizeSTLFilename(systemName)}.stl`,
      buffer: stlBuffer
    });
    starCount += 1;
    if (starCount % EXPORT_HEAVY_YIELD_INTERVAL === 0) {
      reportBuildProgress(options, 0.36 + 0.42 * (starCount / exportedSystemTotal), 'Building star STL files');
      await yieldToBrowser(signal);
    }
  }
  reportBuildProgress(options, 0.78, 'Building tube STL files');

  // Tubes
  for (const component of tubeComponents) {
    const built = buildTubeComponentCSG(component);
    if (!built) continue;

    const triangles = placeTrianglesOnBuildPlate(built.csg.toTriangles());
    const stlBuffer = trianglesToBinarySTL(triangles);
    const fileLabel = built.labelRanks.map(rank => padRank(rank)).join('-');
    if (!fileLabel) continue;

    files.push({
      path: `tubes/${fileLabel}.stl`,
      buffer: stlBuffer
    });
    tubeCount += 1;
    if (tubeCount % EXPORT_HEAVY_YIELD_INTERVAL === 0) {
      reportBuildProgress(options, 0.78 + 0.18 * (tubeCount / tubeComponentTotal), 'Building tube STL files');
      await yieldToBrowser(signal);
    }
  }

  assertNotAborted(signal);
  reportBuildProgress(options, 0.98, 'Writing STL kit manifest');

  const manifest = buildKitManifest({
    sourceStarCount: stars.length,
    inputConnectionCount: Array.isArray(connections) ? connections.length : 0,
    exportedSystemCount: systemInfo.size,
    printableConnectionCount: allConnections.length,
    starFileCount: starCount,
    tubeFileCount: tubeCount,
    skippedConnections
  });
  files.push({ path: 'README.txt', text: manifest });

  const result = {
    files,
    summary: {
      starCount,
      tubeCount,
      sourceStarCount: stars.length,
      inputConnectionCount: Array.isArray(connections) ? connections.length : 0,
      exportedSystemCount: systemInfo.size,
      printableConnectionCount: allConnections.length,
      skippedConnectionCount: skippedConnections.length
    },
    logMessage:
      `3D-print kit exported - ${starCount} stars, ${tubeCount} tubes ` +
      `(scale: 1 LY = ${KIT_MM_PER_LY} mm, star diameter ${STANDARD_DIAMETER_MM} mm, tube diameter ${KIT_TUBE_RADIUS * 2} mm).`
  };
  endPerformanceMeasure(timer, result.summary);
  return result;
}

function addBuiltFilesToZip(zip, built) {
  built.files.forEach(file => {
    zip.file(file.path, file.text ?? file.buffer);
  });
}

function validateBuiltStlFiles(built) {
  built.files
    .filter(file => file.path?.toLowerCase?.().endsWith('.stl'))
    .forEach(file => validateBinarySTL(file.buffer));
}

async function buildPrintableSTLKitFilesInWorker(stars, connections, options = {}) {
  assertNotAborted(options.signal);
  if (typeof Worker !== 'function') return null;

  const worker = new Worker(new URL('./stlKitWorker.js', import.meta.url), { type: 'module' });
  const payload = createSTLKitWorkerPayload(stars, connections, options);

  return new Promise((resolve, reject) => {
    const cleanup = () => options.signal?.removeEventListener?.('abort', onAbort);
    const settle = callback => value => {
      cleanup();
      worker.terminate();
      callback(value);
    };
    const resolveDone = settle(resolve);
    const rejectDone = settle(reject);
    const onAbort = () => rejectDone(createAbortError());

    options.signal?.addEventListener?.('abort', onAbort, { once: true });

    worker.onmessage = event => {
      const { type, result, error, progress, label } = event.data || {};
      if (type === 'progress') {
        reportExportProgress(options, 0.08 + 0.62 * progress, label || 'Building printable geometry');
        return;
      }
      if (type === 'success') {
        resolveDone(result);
      } else {
        rejectDone(new Error(error || 'STL kit worker failed.'));
      }
    };
    worker.onerror = event => {
      rejectDone(new Error(event.message || 'STL kit worker failed.'));
    };
    worker.postMessage(payload);
  });
}

export async function exportPrintableSTLKit(stars, connections, options = {}) {
  const timer = startPerformanceMeasure('export.stlKit.download', {
    stars: stars?.length || 0,
    connections: connections?.length || 0
  });
  assertNotAborted(options.signal);
  if (!stars || stars.length === 0) {
    logWarn('STL kit export: no stars to export.');
    endPerformanceMeasure(timer, { skipped: true });
    return;
  }

  const JSZip = getJsZipConstructor();
  reportExportProgress(options, 0.02, 'Preparing STL kit');
  assertNotAborted(options.signal);

  let built = null;
  try {
    reportExportProgress(options, 0.08, 'Building printable geometry');
    built = await buildPrintableSTLKitFilesInWorker(stars, connections, options);
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    logWarn('STL kit worker export failed; falling back to main-thread build.', error);
  }
  if (!built) {
    reportExportProgress(options, 0.12, 'Building printable geometry');
    built = await buildPrintableSTLKitFiles(stars, connections, {
      ...options,
      onBuildProgress(update) {
        reportExportProgress(
          options,
          0.12 + 0.58 * (update?.progress || 0),
          update?.label || 'Building printable geometry'
        );
      }
    });
  }
  if (!built) {
    endPerformanceMeasure(timer, { skipped: true });
    return;
  }
  assertNotAborted(options.signal);
  reportExportProgress(options, 0.72, 'Validating STL files');
  validateBuiltStlFiles(built);
  assertNotAborted(options.signal);

  const zip = new JSZip();
  addBuiltFilesToZip(zip, built);

  await yieldToBrowser(options.signal);
  reportExportProgress(options, 0.82, 'Compressing ZIP');
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }, metadata => {
    assertNotAborted(options.signal);
    reportExportProgress(options, 0.82 + 0.16 * ((metadata?.percent || 0) / 100), 'Compressing ZIP');
  });
  assertNotAborted(options.signal);
  reportExportProgress(options, 0.99, 'Downloading ZIP');
  downloadBlob(blob, 'star_map_3d_print_kit.zip');
  reportExportProgress(options, 1, 'STL kit ready');
  logInfo(built.logMessage);
  endPerformanceMeasure(timer, built.summary || {});
}
