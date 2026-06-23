import * as THREE from '../../vendor/three.js';
import { canvasToPngDataUrl, downloadCanvasAsPng } from './downloadUtils.js';
import { getJsPdfConstructor } from './pdfUtils.js';
import { configureExportRenderer } from './rendererExportSettings.js';
import { assertWebGLAvailable } from '../../shared/webglSupport.js';
import { collectSceneSnapshotModel } from './exportSceneModel.js';

function cloneCameraForSnapshot(manager, width, height) {
  const sourceCamera = manager.camera;
  const camera = sourceCamera.clone();
  const aspect = width / height;

  if (camera.isPerspectiveCamera) {
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    return camera;
  }

  if (camera.isOrthographicCamera) {
    const viewHeight = camera.top - camera.bottom;
    const centerX = (camera.left + camera.right) / 2;
    const centerY = (camera.top + camera.bottom) / 2;
    const viewWidth = viewHeight * aspect;
    camera.left = centerX - viewWidth / 2;
    camera.right = centerX + viewWidth / 2;
    camera.top = centerY + viewHeight / 2;
    camera.bottom = centerY - viewHeight / 2;
    camera.updateProjectionMatrix();
  }

  return camera;
}

function renderSnapshotCanvas(sceneModel) {
  const manager = sceneModel.source;
  const width = sceneModel.width;
  const height = sceneModel.height;
  assertWebGLAvailable();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(1);
  configureExportRenderer(renderer, manager.renderer);
  renderer.setSize(width, height, false);

  const camera = cloneCameraForSnapshot(manager, width, height);
  try {
    manager.labelManager?.render?.(camera);
    renderer.render(manager.scene, camera);
    return { canvas: renderer.domElement, width, height, dispose: () => renderer.dispose() };
  } catch (error) {
    renderer.dispose();
    throw error;
  } finally {
    manager.labelManager?.render?.(manager.camera);
  }
}

export async function exportSceneSnapshot(manager, format, filenameBase) {
  const sceneModel = collectSceneSnapshotModel(manager, {
    formats: ['png', 'pdf'],
    filenameBase
  });
  const snapshot = renderSnapshotCanvas(sceneModel);
  const filename = sceneModel.metadata.filename;

  if (format === 'pdf') {
    try {
      const JsPDF = getJsPdfConstructor();
      const pdf = new JsPDF({
        orientation: snapshot.width >= snapshot.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [snapshot.width, snapshot.height]
      });
      const imgData = await canvasToPngDataUrl(snapshot.canvas);
      pdf.addImage(imgData, 'PNG', 0, 0, snapshot.width, snapshot.height);
      pdf.save(`${filename}.pdf`);
    } finally {
      snapshot.dispose();
    }
    return;
  }

  try {
    await downloadCanvasAsPng(snapshot.canvas, `${filename}.png`);
  } finally {
    snapshot.dispose();
  }
}
