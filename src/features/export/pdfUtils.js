export function getJsPdfConstructor() {
  const constructor = globalThis.jspdf?.jsPDF;
  if (!constructor) {
    throw new Error('PDF export requires jsPDF, but it is not loaded.');
  }
  return constructor;
}

export function getJsZipConstructor() {
  const constructor = globalThis.JSZip;
  if (!constructor) {
    throw new Error('ZIP export requires JSZip, but it is not loaded.');
  }
  return constructor;
}
