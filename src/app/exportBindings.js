import { ExportManager } from '../features/export/exportManager.js';
import { exportSceneSnapshot } from '../features/export/sceneSnapshotExporter.js';
import { exportTrueCoordinatesSTL } from '../features/export/stlExporter.js';
import { exportPrintableSTLKit } from '../features/export/stlKitExporter.js';
import { applyExportDependencyHealth } from '../features/export/exportDependencyHealth.js';
import { notifyError } from '../shared/userNotifications.js';
import { logError } from '../shared/logger.js';

function bindSceneSnapshotExport({ documentRef, id, manager, format, filenameBase }) {
  const button = documentRef.getElementById(id);
  if (!button || !manager) return;

  button.addEventListener('click', async () => {
    try {
      await exportSceneSnapshot(manager, format, filenameBase);
    } catch (error) {
      logError(`${filenameBase} ${format.toUpperCase()} export failed:`, error);
      notifyError(`${format.toUpperCase()} export failed`, error);
    }
  });
}

function bindTrueCoordinatesStlExport({ documentRef, state }) {
  const stlBtn = documentRef.getElementById('export-stl');
  if (!stlBtn) return;

  stlBtn.addEventListener('click', () => {
    exportTrueCoordinatesSTL(state.currentFilteredStars, state.currentConnections);
  });
}

function bindPrintableStlKitExport({ documentRef, state, yieldToUI }) {
  const stlKitBtn = documentRef.getElementById('export-stl-kit');
  if (!stlKitBtn) return;

  const stlKitIdleLabel = stlKitBtn.textContent || 'STL for 3D Printing';
  let stlKitAbortController = null;

  const setStlKitProgress = ({ progress = 0, label = 'Generating STL kit' } = {}) => {
    const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
    if (stlKitAbortController) {
      stlKitBtn.textContent = `Cancel STL Kit ${percent}%`;
      stlKitBtn.setAttribute('aria-label', `Cancel STL kit export (${label} ${percent}%)`);
      stlKitBtn.title = `${label} ${percent}%`;
      return;
    }
    stlKitBtn.textContent = `${label} ${percent}%`;
  };
  const resetStlKitButton = () => {
    stlKitBtn.disabled = false;
    stlKitBtn.removeAttribute('aria-busy');
    stlKitBtn.removeAttribute('data-exporting');
    stlKitBtn.removeAttribute('aria-label');
    stlKitBtn.removeAttribute('title');
    stlKitBtn.textContent = stlKitIdleLabel;
  };

  stlKitBtn.addEventListener('click', async () => {
    if (stlKitAbortController) {
      stlKitAbortController.abort();
      setStlKitProgress({ progress: 0, label: 'Cancelling STL kit' });
      return;
    }

    const controller = new AbortController();
    stlKitAbortController = controller;
    stlKitBtn.disabled = false;
    stlKitBtn.setAttribute('aria-busy', 'true');
    stlKitBtn.setAttribute('data-exporting', 'true');
    setStlKitProgress({ progress: 0, label: 'Generating STL kit' });
    await yieldToUI?.();

    try {
      await exportPrintableSTLKit(state.currentFilteredStars, state.currentConnections, {
        allStars: state.cachedStars,
        onProgress: setStlKitProgress,
        signal: stlKitAbortController.signal
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        setStlKitProgress({ progress: 0, label: 'STL kit cancelled' });
        await yieldToUI?.();
        return;
      }
      logError('STL kit export failed:', error);
      notifyError('STL kit export failed', error);
    } finally {
      if (stlKitAbortController === controller) {
        stlKitAbortController = null;
        resetStlKitButton();
      }
    }
  });
}

export function setupExportBindings({
  documentRef = globalThis.document,
  state,
  maps,
  yieldToUI
}) {
  const exportManager = new ExportManager(maps.mollweideMap);
  exportManager.setup();
  applyExportDependencyHealth(documentRef);

  [
    ['export-true-png', maps.trueCoordinatesMap, 'png', 'true_coordinates_map'],
    ['export-true-pdf', maps.trueCoordinatesMap, 'pdf', 'true_coordinates_map'],
    ['export-uv-png', maps.uvMap, 'png', 'uv_map'],
    ['export-uv-pdf', maps.uvMap, 'pdf', 'uv_map'],
    ['export-globe-png', maps.uvGlobeMap, 'png', 'globe_map'],
    ['export-globe-pdf', maps.uvGlobeMap, 'pdf', 'globe_map'],
    ['export-legacy-globe-png', maps.globeMap, 'png', 'legacy_globe_map'],
    ['export-legacy-globe-pdf', maps.globeMap, 'pdf', 'legacy_globe_map']
  ].forEach(([id, manager, format, filenameBase]) => {
    bindSceneSnapshotExport({ documentRef, id, manager, format, filenameBase });
  });

  bindTrueCoordinatesStlExport({ documentRef, state });
  bindPrintableStlKitExport({ documentRef, state, yieldToUI });

  return { exportManager };
}
