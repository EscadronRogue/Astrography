import { hasJsPdfConstructor, hasJsZipConstructor } from './pdfUtils.js';

const PDF_BUTTON_IDS = [
  'export-true-pdf',
  'export-uv-pdf',
  'export-globe-pdf'
];

const ZIP_BUTTON_IDS = [
  'export-stl-kit'
];

function markUnavailable(button, message) {
  if (!button) return;
  button.disabled = true;
  button.setAttribute('aria-disabled', 'true');
  button.title = message;
  button.classList.add('export-btn-unavailable');
}

export function applyExportDependencyHealth(documentRef = globalThis.document) {
  const missing = [];
  if (!hasJsPdfConstructor()) {
    const message = 'PDF export unavailable: jsPDF did not load.';
    missing.push('jsPDF');
    PDF_BUTTON_IDS.forEach(id => markUnavailable(documentRef?.getElementById?.(id), message));
  }

  if (!hasJsZipConstructor()) {
    const message = 'STL kit ZIP export unavailable: JSZip did not load.';
    missing.push('JSZip');
    ZIP_BUTTON_IDS.forEach(id => markUnavailable(documentRef?.getElementById?.(id), message));
  }

  return missing;
}
