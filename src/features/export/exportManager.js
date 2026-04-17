import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { buildWideLineGeometry } from '../../render/engine/renderUtils.js';
import { EXPORT_TARGET_WIDTH, EXPORT_TARGET_HEIGHT, EXPORT_MAX_TILE_SIZE } from '../../shared/constants.js';

function getJsPdfConstructor() {
  const constructor = window.jspdf?.jsPDF;
  if (!constructor) {
    throw new Error('jsPDF is not available in the current page context.');
  }
  return constructor;
}

export class ExportManager {
  constructor(mollweideMap) {
    this.mollweideMap = mollweideMap;
    this.exportSelectMode = false;
    this.exportOverlay = null;
    this.exportRectElem = null;
    this.exportPngBtn = null;
    this.exportPdfBtn = null;
    this.exportStart = null;
    this.exportCurrentRect = null;
    this.isSelecting = false;
  }

  scaleMollweideSceneForExport(scale) {
    if (this.mollweideMap.points && this.mollweideMap.points.material.uniforms.cameraZoom) {
      this.mollweideMap.points.material.uniforms.cameraZoom.value *= scale;
    }
    this.mollweideMap.scene.traverse(obj => {
      if (obj.userData && obj.userData.baseWidth && obj.userData.points) {
        let width = obj.userData.baseWidth;
        if (obj.userData.exportLineWidthFactor) width *= obj.userData.exportLineWidthFactor;
        obj.geometry.dispose();
        if (obj.userData.isMollweideBorder) {
          const R = obj.userData.baseRadius || 100;
          const segments = obj.userData.segments || 1024;
          const pts = [];
          let prev = null;
          const offsetR = R + width / 2;
          for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * 2 * Math.PI;
            const p = new THREE.Vector3(2 * offsetR * Math.cos(theta), offsetR * Math.sin(theta), 0);
            if (prev) {
              pts.push(prev, p);
            }
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

  restoreMollweideScene(scale) {
    if (this.mollweideMap.points && this.mollweideMap.points.material.uniforms.cameraZoom) {
      this.mollweideMap.points.material.uniforms.cameraZoom.value /= scale;
    }
    this.mollweideMap.scene.traverse(obj => {
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

  exportMollweideMap(format = 'png', rect = null) {
    const baseWidth = this.mollweideMap.renderer.domElement.width;
    const baseHeight = this.mollweideMap.renderer.domElement.height;
    const scale = Math.max(1, EXPORT_TARGET_WIDTH / baseWidth, EXPORT_TARGET_HEIGHT / baseHeight);
    this.scaleMollweideSceneForExport(scale);
    const exportWidth = Math.round(baseWidth * scale);
    const exportHeight = Math.round(baseHeight * scale);
    const exportRenderer = new THREE.WebGLRenderer({ antialias: true });
    exportRenderer.setPixelRatio(1);
    let cropX = 0;
    let cropY = 0;
    let cropW = baseWidth;
    let cropH = baseHeight;
    if (rect) {
      const scaleX = baseWidth / this.mollweideMap.canvas.clientWidth;
      const scaleY = baseHeight / this.mollweideMap.canvas.clientHeight;
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
    const tile = Math.min(Math.floor(maxSize / scale), EXPORT_MAX_TILE_SIZE);
    for (let y = cropY; y < cropY + cropH; y += tile) {
      for (let x = cropX; x < cropX + cropW; x += tile) {
        const tileW = Math.min(tile, cropW - (x - cropX));
        const tileH = Math.min(tile, cropH - (y - cropY));
        const tileWScaled = Math.round(tileW * scale);
        const tileHScaled = Math.round(tileH * scale);
        exportRenderer.setSize(tileWScaled, tileHScaled, false);
        const cam = this.mollweideMap.camera.clone();
        const aspect = baseWidth / baseHeight;
        cam.left = (-this.mollweideMap.frustumSize * aspect) / 2;
        cam.right = (this.mollweideMap.frustumSize * aspect) / 2;
        cam.top = this.mollweideMap.frustumSize / 2;
        cam.bottom = -this.mollweideMap.frustumSize / 2;
        cam.updateProjectionMatrix();
        cam.setViewOffset(
          exportWidth,
          exportHeight,
          Math.round(x * scale),
          Math.round(y * scale),
          tileWScaled,
          tileHScaled
        );
        exportRenderer.render(this.mollweideMap.scene, cam);
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
    this.restoreMollweideScene(scale);
    exportRenderer.dispose();
    if (format === 'pdf') {
      const imgData = finalCanvas.toDataURL('image/png');
      const JsPDF = getJsPdfConstructor();
      const pdf = new JsPDF({
        orientation: exportCropW >= exportCropH ? 'landscape' : 'portrait',
        unit: 'px',
        format: [exportCropW, exportCropH]
      });
      pdf.addImage(imgData, 'PNG', 0, 0, exportCropW, exportCropH);
      pdf.save('mollweide_map.pdf');
    } else {
      finalCanvas.toBlob(b => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(b);
        link.download = 'mollweide_map.png';
        link.click();
        URL.revokeObjectURL(link.href);
      }, 'image/png');
    }
  }

  exitExportSelection() {
    this.exportSelectMode = false;
    if (this.exportOverlay) this.exportOverlay.style.display = 'none';
    if (this.exportRectElem) {
      this.exportRectElem.style.display = 'none';
      this.exportRectElem.style.width = '0px';
      this.exportRectElem.style.height = '0px';
    }
    if (this.exportPngBtn) this.exportPngBtn.classList.add('hidden-control');
    if (this.exportPdfBtn) this.exportPdfBtn.classList.add('hidden-control');
    const btn = document.getElementById('export-mollweide');
    if (btn) btn.classList.remove('active');
    this.exportCurrentRect = null;
    this.isSelecting = false;
  }

  getCanvasPos(event) {
    const rect = this.mollweideMap.canvas.getBoundingClientRect();
    const x = Math.min(Math.max(event.clientX, rect.left), rect.right) - rect.left;
    const y = Math.min(Math.max(event.clientY, rect.top), rect.bottom) - rect.top;
    return { x, y, rect };
  }

  onExportPointerDown = (e) => {
    if (!this.exportSelectMode) return;
    if (e.target !== this.exportOverlay) return;
    const pos = this.getCanvasPos(e);
    this.exportStart = { x: pos.x, y: pos.y };
    this.exportCurrentRect = { x: pos.x, y: pos.y, width: 0, height: 0 };
    this.exportRectElem.style.display = 'block';
    this.exportRectElem.style.left = `${pos.rect.left + pos.x}px`;
    this.exportRectElem.style.top = `${pos.rect.top + pos.y}px`;
    this.exportRectElem.style.width = '0px';
    this.exportRectElem.style.height = '0px';
    this.isSelecting = true;
  };

  onExportPointerMove = (e) => {
    if (!this.isSelecting) return;
    const pos = this.getCanvasPos(e);
    const x = Math.min(this.exportStart.x, pos.x);
    const y = Math.min(this.exportStart.y, pos.y);
    const w = Math.abs(pos.x - this.exportStart.x);
    const h = Math.abs(pos.y - this.exportStart.y);
    this.exportCurrentRect = { x, y, width: w, height: h };
    this.exportRectElem.style.left = `${pos.rect.left + x}px`;
    this.exportRectElem.style.top = `${pos.rect.top + y}px`;
    this.exportRectElem.style.width = `${w}px`;
    this.exportRectElem.style.height = `${h}px`;
  };

  onExportPointerUp = (e) => {
    if (!this.isSelecting) return;
    this.onExportPointerMove(e);
    this.isSelecting = false;
  };

  setup() {
    const btn = document.getElementById('export-mollweide');
    this.exportPngBtn = document.getElementById('export-png');
    this.exportPdfBtn = document.getElementById('export-pdf');
    this.exportOverlay = document.getElementById('export-selection-overlay');
    this.exportRectElem = document.getElementById('export-selection-rect');
    if (!btn || !this.exportOverlay || !this.exportRectElem || !this.exportPngBtn || !this.exportPdfBtn) return;

    this._onPngClick = () => {
      try {
        if (this.exportCurrentRect) this.exportMollweideMap('png', this.exportCurrentRect);
      } catch (error) {
        console.error('PNG export failed:', error);
        alert(`PNG export failed: ${error.message}`);
      }
      this.exitExportSelection();
    };
    this._onPdfClick = () => {
      try {
        if (this.exportCurrentRect) this.exportMollweideMap('pdf', this.exportCurrentRect);
      } catch (error) {
        console.error('PDF export failed:', error);
        alert(`PDF export failed: ${error.message}`);
      }
      this.exitExportSelection();
    };
    this._onToggleClick = () => {
      this.exportSelectMode = !this.exportSelectMode;
      btn.classList.toggle('active', this.exportSelectMode);
      if (this.exportSelectMode) {
        this.exportOverlay.style.display = 'block';
        this.exportPngBtn.classList.remove('hidden-control');
        this.exportPdfBtn.classList.remove('hidden-control');
        this.exportRectElem.style.display = 'none';
        this.exportCurrentRect = null;
      } else {
        this.exitExportSelection();
      }
    };

    this.exportPngBtn.addEventListener('click', this._onPngClick);
    this.exportPdfBtn.addEventListener('click', this._onPdfClick);
    this.exportOverlay.addEventListener('pointerdown', this.onExportPointerDown);
    this.exportOverlay.addEventListener('pointermove', this.onExportPointerMove);
    window.addEventListener('pointerup', this.onExportPointerUp);
    this._exportToggleBtn = btn;
    btn.addEventListener('click', this._onToggleClick);
  }

  dispose() {
    if (this.exportPngBtn) this.exportPngBtn.removeEventListener('click', this._onPngClick);
    if (this.exportPdfBtn) this.exportPdfBtn.removeEventListener('click', this._onPdfClick);
    if (this.exportOverlay) {
      this.exportOverlay.removeEventListener('pointerdown', this.onExportPointerDown);
      this.exportOverlay.removeEventListener('pointermove', this.onExportPointerMove);
    }
    window.removeEventListener('pointerup', this.onExportPointerUp);
    if (this._exportToggleBtn) this._exportToggleBtn.removeEventListener('click', this._onToggleClick);
  }
}
