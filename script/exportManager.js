import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { buildWideLineGeometry } from '../utils/renderUtils.js';

function getCanvasPos(mollweideMap, event) {
  const rect = mollweideMap.canvas.getBoundingClientRect();
  const x = Math.min(Math.max(event.clientX, rect.left), rect.right) - rect.left;
  const y = Math.min(Math.max(event.clientY, rect.top), rect.bottom) - rect.top;
  return { x, y, rect };
}

export function createExportManager({ mollweideMap }) {
  const state = {
    exportSelectMode: false,
    exportOverlay: null,
    exportRectElem: null,
    exportPngBtn: null,
    exportPdfBtn: null,
    exportStart: null,
    exportCurrentRect: null,
    isSelecting: false
  };

  function scaleMollweideSceneForExport(scale) {
    if (mollweideMap.points && mollweideMap.points.material.uniforms.cameraZoom) {
      mollweideMap.points.material.uniforms.cameraZoom.value *= scale;
    }
    mollweideMap.scene.traverse(obj => {
      if (obj.userData && obj.userData.baseWidth && obj.userData.points) {
        const width = obj.userData.baseWidth * scale;
        obj.geometry.dispose();
        if (obj.userData.fullCircle) {
          const R = obj.userData.baseRadius || 100;
          const segments = obj.userData.segments || 1024;
          const pts = [];
          let prev = null;
          const offsetR = R + width / 2;
          for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * 2 * Math.PI;
            const p = new THREE.Vector3(2 * offsetR * Math.cos(theta), offsetR * Math.sin(theta), 0);
            if (prev) pts.push(prev, p);
            prev = p;
          }
          obj.geometry = buildWideLineGeometry(pts, width);
        } else {
          obj.geometry = buildWideLineGeometry(obj.userData.points, width);
        }
        if (obj.userData.exportColor !== undefined && obj.material && obj.material.color) {
          obj.material.color.setHex(obj.userData.exportColor);
        }
        if (obj.userData.baseOpacity !== undefined && obj.material) {
          const opFactor = obj.userData.exportOpacityFactor || 1;
          obj.material.opacity = Math.min(1, obj.userData.baseOpacity * opFactor);
        }
      } else if (obj.userData && obj.userData.baseLineWidth !== undefined && obj.material && obj.material.linewidth !== undefined) {
        let lwFactor = scale;
        if (obj.userData.exportLineWidthFactor) lwFactor *= obj.userData.exportLineWidthFactor;
        obj.material.linewidth = obj.userData.baseLineWidth * lwFactor;
        if (obj.userData.baseOpacity !== undefined) {
          const opFactor = obj.userData.exportOpacityFactor || 1;
          obj.material.opacity = Math.min(1, obj.userData.baseOpacity * opFactor);
        }
      }
    });
  }

  function restoreMollweideScene(scale) {
    if (mollweideMap.points && mollweideMap.points.material.uniforms.cameraZoom) {
      mollweideMap.points.material.uniforms.cameraZoom.value /= scale;
    }
    mollweideMap.scene.traverse(obj => {
      if (obj.userData && obj.userData.baseWidth && obj.userData.points) {
        obj.geometry.dispose();
        obj.geometry = buildWideLineGeometry(obj.userData.points, obj.userData.baseWidth);
        if (obj.userData.baseColor !== undefined && obj.material && obj.material.color) {
          obj.material.color.setHex(obj.userData.baseColor);
        }
        if (obj.userData.baseOpacity !== undefined && obj.material) {
          obj.material.opacity = obj.userData.baseOpacity;
        }
      } else if (obj.userData && obj.userData.baseLineWidth !== undefined && obj.material && obj.material.linewidth !== undefined) {
        obj.material.linewidth = obj.userData.baseLineWidth;
        if (obj.userData.baseOpacity !== undefined) obj.material.opacity = obj.userData.baseOpacity;
      }
    });
  }

  function exportMollweideMap(format = 'png', rect = null) {
    const baseWidth = mollweideMap.renderer.domElement.width;
    const baseHeight = mollweideMap.renderer.domElement.height;
    const scale = Math.max(1, 7680 / baseWidth, 4320 / baseHeight);
    scaleMollweideSceneForExport(scale);
    const exportWidth = Math.round(baseWidth * scale);
    const exportHeight = Math.round(baseHeight * scale);
    const exportRenderer = new THREE.WebGLRenderer({ antialias: true });
    exportRenderer.setPixelRatio(1);

    let cropX = 0;
    let cropY = 0;
    let cropW = baseWidth;
    let cropH = baseHeight;
    if (rect) {
      const scaleX = baseWidth / mollweideMap.canvas.clientWidth;
      const scaleY = baseHeight / mollweideMap.canvas.clientHeight;
      cropX = Math.round(rect.x * scaleX);
      cropY = Math.round(rect.y * scaleY);
      cropW = Math.round(rect.width * scaleX);
      cropH = Math.round(rect.height * scaleY);
    }

    const exportCropW = Math.round(cropW * scale);
    const exportCropH = Math.round(cropH * scale);
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = exportCropW;
    finalCanvas.height = exportCropH;
    const ctx = finalCanvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');

    const maxSize = exportRenderer.capabilities.maxTextureSize;
    const tile = Math.min(Math.floor(maxSize / scale), 8192);
    for (let y = cropY; y < cropY + cropH; y += tile) {
      for (let x = cropX; x < cropX + cropW; x += tile) {
        const tileW = Math.min(tile, cropW - (x - cropX));
        const tileH = Math.min(tile, cropH - (y - cropY));
        const tileWScaled = Math.round(tileW * scale);
        const tileHScaled = Math.round(tileH * scale);
        exportRenderer.setSize(tileWScaled, tileHScaled, false);
        const cam = mollweideMap.camera.clone();
        const aspect = baseWidth / baseHeight;
        cam.left = (-mollweideMap.frustumSize * aspect) / 2;
        cam.right = (mollweideMap.frustumSize * aspect) / 2;
        cam.top = mollweideMap.frustumSize / 2;
        cam.bottom = -mollweideMap.frustumSize / 2;
        cam.updateProjectionMatrix();
        cam.setViewOffset(
          exportWidth,
          exportHeight,
          Math.round(x * scale),
          Math.round(y * scale),
          tileWScaled,
          tileHScaled
        );
        exportRenderer.render(mollweideMap.scene, cam);
        cam.clearViewOffset();
        ctx.drawImage(
          exportRenderer.domElement,
          Math.round((x - cropX) * scale),
          Math.round((y - cropY) * scale),
          tileWScaled,
          tileHScaled
        );
      }
    }

    restoreMollweideScene(scale);
    exportRenderer.dispose();

    if (format === 'pdf') {
      const imgData = finalCanvas.toDataURL('image/png');
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({
        orientation: exportCropW >= exportCropH ? 'landscape' : 'portrait',
        unit: 'px',
        format: [exportCropW, exportCropH]
      });
      pdf.addImage(imgData, 'PNG', 0, 0, exportCropW, exportCropH);
      pdf.save('mollweide_map.pdf');
      return;
    }

    finalCanvas.toBlob(blob => {
      if (!blob) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'mollweide_map.png';
      link.click();
      URL.revokeObjectURL(link.href);
    }, 'image/png');
  }

  function exitExportSelection() {
    state.exportSelectMode = false;
    if (state.exportOverlay) state.exportOverlay.style.display = 'none';
    if (state.exportRectElem) {
      state.exportRectElem.style.display = 'none';
      state.exportRectElem.style.width = '0px';
      state.exportRectElem.style.height = '0px';
    }
    if (state.exportPngBtn) state.exportPngBtn.style.display = 'none';
    if (state.exportPdfBtn) state.exportPdfBtn.style.display = 'none';
    const btn = document.getElementById('export-mollweide');
    if (btn) btn.classList.remove('active');
    state.exportCurrentRect = null;
    state.isSelecting = false;
  }

  function onExportPointerDown(event) {
    if (!state.exportSelectMode || event.target !== state.exportOverlay) return;
    const pos = getCanvasPos(mollweideMap, event);
    state.exportStart = { x: pos.x, y: pos.y };
    state.exportCurrentRect = { x: pos.x, y: pos.y, width: 0, height: 0 };
    state.exportRectElem.style.display = 'block';
    state.exportRectElem.style.left = `${pos.rect.left + pos.x}px`;
    state.exportRectElem.style.top = `${pos.rect.top + pos.y}px`;
    state.exportRectElem.style.width = '0px';
    state.exportRectElem.style.height = '0px';
    state.isSelecting = true;
  }

  function onExportPointerMove(event) {
    if (!state.isSelecting) return;
    const pos = getCanvasPos(mollweideMap, event);
    const x = Math.min(state.exportStart.x, pos.x);
    const y = Math.min(state.exportStart.y, pos.y);
    const width = Math.abs(pos.x - state.exportStart.x);
    const height = Math.abs(pos.y - state.exportStart.y);
    state.exportCurrentRect = { x, y, width, height };
    state.exportRectElem.style.left = `${pos.rect.left + x}px`;
    state.exportRectElem.style.top = `${pos.rect.top + y}px`;
    state.exportRectElem.style.width = `${width}px`;
    state.exportRectElem.style.height = `${height}px`;
  }

  function onExportPointerUp(event) {
    if (!state.isSelecting) return;
    onExportPointerMove(event);
    state.isSelecting = false;
  }

  function setup() {
    const btn = document.getElementById('export-mollweide');
    state.exportPngBtn = document.getElementById('export-png');
    state.exportPdfBtn = document.getElementById('export-pdf');
    state.exportOverlay = document.getElementById('export-selection-overlay');
    state.exportRectElem = document.getElementById('export-selection-rect');
    if (!btn || !state.exportOverlay || !state.exportRectElem || !state.exportPngBtn || !state.exportPdfBtn) return;

    state.exportPngBtn.addEventListener('click', () => {
      if (state.exportCurrentRect) exportMollweideMap('png', state.exportCurrentRect);
      exitExportSelection();
    });
    state.exportPdfBtn.addEventListener('click', () => {
      if (state.exportCurrentRect) exportMollweideMap('pdf', state.exportCurrentRect);
      exitExportSelection();
    });

    state.exportOverlay.addEventListener('pointerdown', onExportPointerDown);
    state.exportOverlay.addEventListener('pointermove', onExportPointerMove);
    window.addEventListener('pointerup', onExportPointerUp);

    btn.addEventListener('click', () => {
      state.exportSelectMode = !state.exportSelectMode;
      btn.classList.toggle('active', state.exportSelectMode);
      if (state.exportSelectMode) {
        state.exportOverlay.style.display = 'block';
        state.exportPngBtn.style.display = 'inline-block';
        state.exportPdfBtn.style.display = 'inline-block';
        state.exportRectElem.style.display = 'none';
        state.exportCurrentRect = null;
      } else {
        exitExportSelection();
      }
    });
  }

  return {
    setup,
    exitExportSelection,
    exportMollweideMap
  };
}
