export function readTextFile(file, options = {}) {
  if (!file) {
    return Promise.reject(new Error('No file was selected.'));
  }

  if (typeof file.text === 'function') {
    return file.text();
  }

  const FileReaderCtor = options.FileReaderCtor || globalThis.FileReader;
  if (typeof FileReaderCtor !== 'function') {
    return Promise.reject(new Error('This browser cannot read local text files.'));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReaderCtor();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read the selected file.'));
    reader.readAsText(file);
  });
}
