export function removeElement(element) {
  if (!element) return;
  if (typeof element.remove === 'function') {
    element.remove();
    return;
  }
  element.parentNode?.removeChild?.(element);
}

export function downloadBlob(blob, filename, options = {}) {
  if (!(blob instanceof Blob)) {
    throw new Error(`Cannot download ${filename}: export did not produce a Blob.`);
  }

  const URLApi = options.URLApi || globalThis.URL;
  const documentRef = options.documentRef || globalThis.document;
  const setTimeoutFn = options.setTimeoutFn || globalThis.setTimeout;
  if (!URLApi?.createObjectURL || !URLApi?.revokeObjectURL || !documentRef?.createElement || !documentRef?.body?.appendChild) {
    throw new Error(`Cannot download ${filename}: browser download APIs are not available.`);
  }

  const url = URLApi.createObjectURL(blob);
  const link = documentRef.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  documentRef.body.appendChild(link);
  if (typeof link.click === 'function') {
    link.click();
  }
  removeElement(link);

  if (typeof setTimeoutFn === 'function') {
    setTimeoutFn(() => URLApi.revokeObjectURL(url), options.revokeDelayMs ?? 1000);
  } else {
    URLApi.revokeObjectURL(url);
  }
}

export function canvasToBlob(canvas, type = 'image/png', quality) {
  if (!canvas?.toBlob) {
    return Promise.reject(new Error('Canvas image export is not supported by this browser.'));
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!(blob instanceof Blob)) {
        reject(new Error('Canvas image export did not produce a Blob.'));
        return;
      }
      resolve(blob);
    }, type, quality);
  });
}

export function blobToDataUrl(blob, options = {}) {
  if (!(blob instanceof Blob)) {
    return Promise.reject(new Error('Image export did not produce a Blob.'));
  }

  const FileReaderCtor = options.FileReaderCtor || globalThis.FileReader;
  if (typeof FileReaderCtor !== 'function') {
    return Promise.reject(new Error('Blob-to-image conversion is not supported by this browser.'));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReaderCtor();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to convert image data.'));
    reader.readAsDataURL(blob);
  });
}

export async function canvasToPngDataUrl(canvas, options = {}) {
  try {
    const blob = await canvasToBlob(canvas, 'image/png');
    return await blobToDataUrl(blob, options);
  } catch (error) {
    if (typeof canvas?.toDataURL === 'function') {
      return canvas.toDataURL('image/png');
    }
    throw error;
  }
}

export async function downloadCanvasAsPng(canvas, filename) {
  const blob = await canvasToBlob(canvas, 'image/png');
  downloadBlob(blob, filename);
  return blob;
}
