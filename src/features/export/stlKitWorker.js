import { buildPrintableSTLKitFiles } from './stlKitExporter.js';
import { getSTLKitTransferableBuffers } from './stlKitWorkerPayload.js';

self.onmessage = async event => {
  const { stars, connections, options } = event.data || {};
  try {
    const result = await buildPrintableSTLKitFiles(stars, connections, options || {});
    self.postMessage({ type: 'success', result }, getSTLKitTransferableBuffers(result));
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: error?.message || String(error)
    });
  }
};
