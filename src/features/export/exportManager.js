import * as THREE from '../../vendor/three.js';
import { buildWideLineGeometry } from '../../render/engine/renderUtils.js';
import { splitMollweideWrap } from '../../shared/geometryUtils.js';
import { getConnectionLineParams } from '../connections/connectionSettings.js';
import { EXPORT_TARGET_WIDTH, EXPORT_TARGET_HEIGHT, EXPORT_MAX_TILE_SIZE } from '../../shared/constants.js';
import { canvasToPngDataUrl, downloadBlob, downloadCanvasAsPng } from './downloadUtils.js';
import { getJsPdfConstructor } from './pdfUtils.js';
import { configureExportRenderer } from './rendererExportSettings.js';
import { notifyError } from '../../shared/userNotifications.js';
import { getMollweideCropPixels, getMollweideSvgViewBox } from './exportSizing.js';
import { clamp01, normalizeHexColor } from '../../shared/colorParsing.js';

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&apos;'
  })[char]);
}

function formatSvgNumber(value) {
  if (!Number.isFinite(value)) return '0';
  return Number(value.toFixed(3)).toString();
}

function colorToHex(value, fallback = '#ffffff') {
  return normalizeHexColor(value, fallback);
}

function getPairStrokeColor(pair) {
  const color = new THREE.Color(colorToHex(pair.starA?.displayColor))
    .lerp(new THREE.Color(colorToHex(pair.starB?.displayColor)), 0.5);
  return `#${color.getHexString()}`;
}

function getSvgPoint(point) {
  return {
    x: point?.x || 0,
    y: -(point?.y || 0)
  };
}

function getMollweideLabelBaseScale(star, axis = 'y') {
  const labelSize = star.displayLabelSize !== undefined ? star.displayLabelSize : star.displaySize;
  const scaleFactor = THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(labelSize ?? 1, 0.1, 8, 0.1, 5), 0.1, 5);
  const fontSize = 72 * scaleFactor;
  const padding = axis === 'x' ? 20 : 10;
  const estimatedTextWidth = Math.max(String(star.displayName || '').length * fontSize * 0.52, fontSize);
  const pixelSize = axis === 'x' ? estimatedTextWidth + padding : fontSize + padding;
  return Math.max(0.001, (pixelSize / 100) * scaleFactor);
}

function getMollweideLabelScaleRatio(star, labelObj, axis = 'y') {
  const current = labelObj?.scale?.[axis] ?? star.mollLabelScale?.[axis];
  if (!Number.isFinite(current)) return 1;
  return THREE.MathUtils.clamp(current / getMollweideLabelBaseScale(star, axis), 0.2, 6);
}

function getSvgStarLabelState(mollweideMap, star, radius) {
  const labelObj = mollweideMap.labelManager?.sprites?.get(star);
  const offset = star.mollLabelOffset || { x: 0, y: radius + 0.8, z: 0 };
  const fallbackPosition = {
    x: (star.mollweidePosition?.x || 0) + (offset.x || 0),
    y: (star.mollweidePosition?.y || 0) + (offset.y || 0),
    z: 0
  };
  const point = getSvgPoint(labelObj?.position || fallbackPosition);
  const rotation = labelObj?.material?.rotation ?? star.mollLabelRotation ?? 0;
  const scaleX = getMollweideLabelScaleRatio(star, labelObj, 'x');
  const scaleY = getMollweideLabelScaleRatio(star, labelObj, 'y');
  const transform = [
    `translate(${formatSvgNumber(point.x)} ${formatSvgNumber(point.y)})`,
    Math.abs(rotation) > 1e-6 ? `rotate(${formatSvgNumber(THREE.MathUtils.radToDeg(-rotation))})` : null,
    Math.abs(scaleX - 1) > 1e-3 || Math.abs(scaleY - 1) > 1e-3
      ? `scale(${formatSvgNumber(scaleX)} ${formatSvgNumber(scaleY)})`
      : null
  ].filter(Boolean).join(' ');

  return { transform };
}

export class ExportManager {
  constructor(mollweideMap) {
    this.mollweideMap = mollweideMap;
    this.exportSelectMode = false;
    this.exportOverlay = null;
    this.exportRectElem = null;
    this.exportPngBtn = null;
    this.exportPdfBtn = null;
    this.exportSvgBtn = null;
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
          obj.material.opacity = clamp01(obj.userData.baseOpacity * opFactor);
        }
      } else if (obj.userData && obj.userData.baseLineWidth !== undefined && obj.material && obj.material.linewidth !== undefined) {
        let lwFactor = scale;
        if (obj.userData.exportLineWidthFactor) lwFactor *= obj.userData.exportLineWidthFactor;
        obj.material.linewidth = obj.userData.baseLineWidth * lwFactor;
        if (obj.userData.baseOpacity !== undefined) {
          const opFactor = obj.userData.exportOpacityFactor || 1;
          obj.material.opacity = clamp01(obj.userData.baseOpacity * opFactor);
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
          obj.material.opacity = clamp01(obj.userData.baseOpacity);
        }
      } else if (obj.userData && obj.userData.baseLineWidth !== undefined && obj.material && obj.material.linewidth !== undefined) {
        obj.material.linewidth = obj.userData.baseLineWidth;
        if (obj.userData.baseOpacity !== undefined) obj.material.opacity = clamp01(obj.userData.baseOpacity);
      }
    });
  }

  async exportMollweideMap(format = 'png', rect = null) {
    const baseWidth = this.mollweideMap.renderer.domElement.width;
    const baseHeight = this.mollweideMap.renderer.domElement.height;
    if (baseWidth <= 0 || baseHeight <= 0) {
      throw new Error('Mollweide canvas has no exportable size.');
    }

    const exportRenderer = new THREE.WebGLRenderer({ antialias: true });
    exportRenderer.setPixelRatio(1);
    configureExportRenderer(exportRenderer, this.mollweideMap.renderer);
    const maxSize = exportRenderer.capabilities.maxTextureSize || EXPORT_MAX_TILE_SIZE;
    const requestedScale = Math.max(1, EXPORT_TARGET_WIDTH / baseWidth, EXPORT_TARGET_HEIGHT / baseHeight);
    const scale = Math.min(requestedScale, Math.max(1, maxSize));
    if (scale < requestedScale) {
      console.warn(`Export scale capped from ${requestedScale.toFixed(2)} to ${scale.toFixed(2)} by WebGL texture limits.`);
    }

    if (rect && (rect.width < 2 || rect.height < 2)) {
      rect = null;
    }

    this.scaleMollweideSceneForExport(scale);
    const exportWidth = Math.round(baseWidth * scale);
    const exportHeight = Math.round(baseHeight * scale);
    const { cropX, cropY, cropW, cropH } = getMollweideCropPixels(rect, this.mollweideMap.canvas, baseWidth, baseHeight);
    const exportCropW = Math.round(cropW * scale);
    const exportCropH = Math.round(cropH * scale);
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = exportCropW;
    finalCanvas.height = exportCropH;
    const ctx = finalCanvas.getContext('2d');
    if (!ctx) {
      this.restoreMollweideScene(scale);
      exportRenderer.dispose();
      throw new Error('2D canvas context unavailable');
    }
    const tile = Math.max(1, Math.min(Math.floor(maxSize / scale), EXPORT_MAX_TILE_SIZE));

    try {
      for (let y = cropY; y < cropY + cropH; y += tile) {
        for (let x = cropX; x < cropX + cropW; x += tile) {
          const tileW = Math.min(tile, cropW - (x - cropX));
          const tileH = Math.min(tile, cropH - (y - cropY));
          const tileWScaled = Math.max(1, Math.round(tileW * scale));
          const tileHScaled = Math.max(1, Math.round(tileH * scale));
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
    } finally {
      this.restoreMollweideScene(scale);
      exportRenderer.dispose();
    }

    if (format === 'pdf') {
      const imgData = await canvasToPngDataUrl(finalCanvas);
      const JsPDF = getJsPdfConstructor();
      const pdf = new JsPDF({
        orientation: exportCropW >= exportCropH ? 'landscape' : 'portrait',
        unit: 'px',
        format: [exportCropW, exportCropH]
      });
      pdf.addImage(imgData, 'PNG', 0, 0, exportCropW, exportCropH);
      pdf.save('mollweide_map.pdf');
    } else {
      await downloadCanvasAsPng(finalCanvas, 'mollweide_map.png');
    }
  }

  getSvgViewBox(rect = null) {
    if (!rect || rect.width < 2 || rect.height < 2) {
      return { minX: -200, minY: -100, width: 400, height: 200 };
    }

    return getMollweideSvgViewBox(rect, this.mollweideMap.canvas, this.mollweideMap.frustumSize, this.mollweideMap.camera.position);
  }

  exportMollweideSvg(rect = null) {
    const viewBox = this.getSvgViewBox(rect);
    const stars = Array.isArray(this.mollweideMap.starObjects) ? this.mollweideMap.starObjects : [];
    const connections = Array.isArray(this.mollweideMap.connectionObjects) ? this.mollweideMap.connectionObjects : [];
    const { connectionMaxWidth } = getConnectionLineParams();
    const connectionOpacity = clamp01(this.mollweideMap.connectionOpacity ?? 0.5);
    const starOpacity = clamp01(this.mollweideMap.starOpacity ?? 1);
    const labelOpacity = clamp01(this.mollweideMap.labelOpacity ?? 1);
    const largestDistance = connections.reduce((largest, pair) => Math.max(largest, pair.distance || 0), 0);
    const smallestDistance = connections.reduce((smallest, pair) => Math.min(smallest, pair.distance || Infinity), Infinity);
    const distanceRange = largestDistance - smallestDistance || 1;
    const parts = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      `<svg xmlns="http://www.w3.org/2000/svg" width="${EXPORT_TARGET_WIDTH}" height="${Math.round(EXPORT_TARGET_WIDTH / 2)}" viewBox="${formatSvgNumber(viewBox.minX)} ${formatSvgNumber(viewBox.minY)} ${formatSvgNumber(viewBox.width)} ${formatSvgNumber(viewBox.height)}" role="img" aria-label="Astrography Mollweide export">`,
      '<defs>',
      '<clipPath id="mollweide-clip"><ellipse cx="0" cy="0" rx="200" ry="100"/></clipPath>',
      '</defs>',
      '<rect x="-220" y="-120" width="440" height="240" fill="#070a12"/>',
      '<g clip-path="url(#mollweide-clip)">'
    ];

    connections.forEach(pair => {
      if (!pair.starA?.mollweidePosition || !pair.starB?.mollweidePosition) return;
      const normDist = ((pair.distance || 0) - smallestDistance) / distanceRange;
      const strokeWidth = Math.max(0.08, THREE.MathUtils.lerp(connectionMaxWidth * 0.18, 0.08, normDist));
      const opacity = clamp01(THREE.MathUtils.lerp(1.0, 0.3, normDist) * connectionOpacity);
      splitMollweideWrap(pair.starA.mollweidePosition, pair.starB.mollweidePosition).forEach(([start, end]) => {
        const a = getSvgPoint(start);
        const b = getSvgPoint(end);
        parts.push(`<line x1="${formatSvgNumber(a.x)}" y1="${formatSvgNumber(a.y)}" x2="${formatSvgNumber(b.x)}" y2="${formatSvgNumber(b.y)}" stroke="${getPairStrokeColor(pair)}" stroke-width="${formatSvgNumber(strokeWidth)}" stroke-opacity="${formatSvgNumber(opacity)}" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`);
      });
    });

    stars.forEach(star => {
      if (!star.mollweidePosition) return;
      const point = getSvgPoint(star.mollweidePosition);
      const radius = Math.max(0.16, Math.min(3, (star.displaySize ?? 1) * 0.45));
      parts.push(`<circle cx="${formatSvgNumber(point.x)}" cy="${formatSvgNumber(point.y)}" r="${formatSvgNumber(radius)}" fill="${colorToHex(star.displayColor)}" fill-opacity="${formatSvgNumber(starOpacity)}"/>`);
    });

    stars.forEach(star => {
      if (!star.mollweidePosition || !star.displayName) return;
      const radius = Math.max(0.16, Math.min(3, (star.displaySize ?? 1) * 0.45));
      const label = getSvgStarLabelState(this.mollweideMap, star, radius);
      parts.push(`<text transform="${label.transform}" fill="${colorToHex(star.displayColor)}" fill-opacity="${formatSvgNumber(labelOpacity)}" font-family="Inter, Oswald, system-ui, sans-serif" font-size="2.4" text-anchor="middle" dominant-baseline="central">${escapeXml(star.displayName)}</text>`);
    });

    parts.push(
      '</g>',
      '<ellipse cx="0" cy="0" rx="200" ry="100" fill="none" stroke="#f0b64b" stroke-width="0.35" vector-effect="non-scaling-stroke"/>',
      '</svg>'
    );

    downloadBlob(new Blob([parts.join('\n')], { type: 'image/svg+xml;charset=utf-8' }), 'mollweide_map.svg');
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
    if (this.exportSvgBtn) this.exportSvgBtn.classList.add('hidden-control');
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
    this.exportSvgBtn = document.getElementById('export-svg');
    this.exportOverlay = document.getElementById('export-selection-overlay');
    this.exportRectElem = document.getElementById('export-selection-rect');
    if (!btn || !this.exportOverlay || !this.exportRectElem || !this.exportPngBtn || !this.exportPdfBtn || !this.exportSvgBtn) return;

    this._onPngClick = async () => {
      try {
        await this.exportMollweideMap('png', this.exportCurrentRect);
      } catch (error) {
        console.error('PNG export failed:', error);
        notifyError('PNG export failed', error);
      } finally {
        this.exitExportSelection();
      }
    };
    this._onPdfClick = async () => {
      try {
        await this.exportMollweideMap('pdf', this.exportCurrentRect);
      } catch (error) {
        console.error('PDF export failed:', error);
        notifyError('PDF export failed', error);
      } finally {
        this.exitExportSelection();
      }
    };
    this._onSvgClick = () => {
      try {
        this.exportMollweideSvg(this.exportCurrentRect);
      } catch (error) {
        console.error('SVG export failed:', error);
        notifyError('SVG export failed', error);
      } finally {
        this.exitExportSelection();
      }
    };
    this._onToggleClick = () => {
      this.exportSelectMode = !this.exportSelectMode;
      btn.classList.toggle('active', this.exportSelectMode);
      if (this.exportSelectMode) {
        this.exportOverlay.style.display = 'block';
        this.exportPngBtn.classList.remove('hidden-control');
        this.exportPdfBtn.classList.remove('hidden-control');
        this.exportSvgBtn.classList.remove('hidden-control');
        this.exportRectElem.style.display = 'none';
        this.exportCurrentRect = null;
      } else {
        this.exitExportSelection();
      }
    };

    this.exportPngBtn.addEventListener('click', this._onPngClick);
    this.exportPdfBtn.addEventListener('click', this._onPdfClick);
    this.exportSvgBtn.addEventListener('click', this._onSvgClick);
    this.exportOverlay.addEventListener('pointerdown', this.onExportPointerDown);
    this.exportOverlay.addEventListener('pointermove', this.onExportPointerMove);
    window.addEventListener('pointerup', this.onExportPointerUp);
    this._exportToggleBtn = btn;
    btn.addEventListener('click', this._onToggleClick);
  }

  dispose() {
    if (this.exportPngBtn) this.exportPngBtn.removeEventListener('click', this._onPngClick);
    if (this.exportPdfBtn) this.exportPdfBtn.removeEventListener('click', this._onPdfClick);
    if (this.exportSvgBtn) this.exportSvgBtn.removeEventListener('click', this._onSvgClick);
    if (this.exportOverlay) {
      this.exportOverlay.removeEventListener('pointerdown', this.onExportPointerDown);
      this.exportOverlay.removeEventListener('pointermove', this.onExportPointerMove);
    }
    window.removeEventListener('pointerup', this.onExportPointerUp);
    if (this._exportToggleBtn) this._exportToggleBtn.removeEventListener('click', this._onToggleClick);
  }
}
