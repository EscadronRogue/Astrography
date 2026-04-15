import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { ThreeDControls, TwoDControls } from '../render/interactions/cameraControls.js';
import { LabelManager } from '../features/labels/labelManager.js';
import { requestRenderIfAvailable } from '../shared/renderScheduler.js';
import { getStarCoordinates } from '../shared/starUtils.js';
import {
  EQUIRECT_WIDTH,
  EQUIRECT_HEIGHT,
  raDecToUV,
  getStarEquirectangularPosition,
  spherePositionToUv,
  normalizeRightAscension,
  splitWrappedUvSegment,
  sampleGreatCircleUvFromVectors,
  sampleGreatCircleUvFromRaDec,
  unwrapUvSequence,
  unwrapUvAroundReference
} from '../shared/uvUtils.js';
import { loadConstellationCenters, loadConstellationFullNames, getConstellationCenters, getConstellationFullNames } from '../features/constellations/constellationDataService.js';
import { computeConstellationColorMapping } from '../features/constellations/constellationOverlayMeshes.js';
import { galacticToEquatorial, eclipticToEquatorial } from '../features/planes/planeDefinitions.js';

const ATLAS_WIDTH = 4096;
const ATLAS_HEIGHT = 2048;
const PLANE_WIDTH = EQUIRECT_WIDTH;
const PLANE_HEIGHT = EQUIRECT_HEIGHT;
const GLOBE_RADIUS = 99;
const TAU = Math.PI * 2;

function createHiddenPointsMaterial() {
  return new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.01,
    transparent: true,
    opacity: 0,
    depthWrite: false
  });
}

function rgbaFromHex(hex, alpha = 1) {
  const color = new THREE.Color(hex || '#ffffff');
  return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${alpha})`;
}

function readNumberInput(id, fallback) {
  const el = document.getElementById(id);
  if (!el) return fallback;
  const parsed = Number.parseFloat(el.value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp01(value) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

async function loadConstellationBoundaries() {
  const response = await fetch('./constellation_boundaries.json');
  if (!response.ok) throw new Error('Failed to load constellation boundary data');
  return response.json();
}

export class UVMapManager {
  constructor({ canvasId, mapType, state }) {
    this.canvas = document.getElementById(canvasId);
    this.mapType = mapType;
    this.state = state;
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
    this.starOpacity = 1;
    this.connectionOpacity = 0.5;
    this.labelOpacity = 1;
    this.starObjects = [];
    this.starGroup = new THREE.Group();
    this.scene.add(this.starGroup);
    this.labelManager = new LabelManager(mapType, this.scene);
    this.labelManager.setLabelOpacity(this.labelOpacity);
    this.boundariesPromise = null;
    this.boundaryData = null;
    this.constellationMetaPromise = null;
    this.sourceGlobeScene = null;

    this.atlasCanvas = document.createElement('canvas');
    this.atlasCanvas.width = ATLAS_WIDTH;
    this.atlasCanvas.height = ATLAS_HEIGHT;
    this.atlasCtx = this.atlasCanvas.getContext('2d');
    this.atlasTexture = new THREE.CanvasTexture(this.atlasCanvas);
    this.atlasTexture.wrapS = THREE.RepeatWrapping;
    this.atlasTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.atlasTexture.needsUpdate = true;

    if (mapType === 'Equirectangular') {
      const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
      this.frustumSize = 130;
      this.camera = new THREE.OrthographicCamera(
        (-this.frustumSize * aspect) / 2,
        (this.frustumSize * aspect) / 2,
        this.frustumSize / 2,
        -this.frustumSize / 2,
        -1000,
        1000
      );
      this.camera.position.set(0, 0, 10);
      this.controls = new TwoDControls(this.camera, this.renderer.domElement, {
        panSpeed: 0.3,
        minZoom: 0.5,
        maxZoom: 12
      });
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(PLANE_WIDTH, PLANE_HEIGHT),
        new THREE.MeshBasicMaterial({ map: this.atlasTexture, transparent: true })
      );
      plane.renderOrder = 0;
      this.surfaceMesh = plane;
      this.scene.add(plane);
    } else {
      this.camera = new THREE.PerspectiveCamera(60, this.canvas.clientWidth / this.canvas.clientHeight, 0.1, 10000);
      this.camera.position.set(0, 0, 220);
      this.controls = new ThreeDControls(this.camera, this.renderer.domElement, {
        minDistance: 120,
        maxDistance: 700,
        target: new THREE.Vector3(0, 0, 0)
      });
      this.scene.add(new THREE.AmbientLight(0xffffff, 0.85));
      const pointLight = new THREE.PointLight(0xffffff, 0.6);
      pointLight.position.set(160, 140, 220);
      this.scene.add(pointLight);
      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(GLOBE_RADIUS, 96, 64),
        new THREE.MeshBasicMaterial({ map: this.atlasTexture, side: THREE.FrontSide })
      );
      sphere.renderOrder = 0;
      this.surfaceMesh = sphere;
      this.scene.add(sphere);
    }

    this.scene.add(this.camera);
    window.addEventListener('resize', () => this.onResize(), false);
  }

  setLegacySourceScene(scene) {
    this.sourceGlobeScene = scene;
  }

  async ensureConstellationMeta() {
    if (this.constellationMetaPromise) return this.constellationMetaPromise;
    this.constellationMetaPromise = Promise.all([
      loadConstellationCenters(),
      loadConstellationFullNames()
    ]).catch(err => {
      console.warn('UV constellation metadata loading failed:', err);
    });
    return this.constellationMetaPromise;
  }

  ensureBoundaryData() {
    if (this.boundaryData) return Promise.resolve(this.boundaryData);
    if (!this.boundariesPromise) {
      this.boundariesPromise = loadConstellationBoundaries()
        .then(data => {
          this.boundaryData = data;
          return data;
        })
        .catch(err => {
          console.warn('UV boundary loading failed:', err);
          this.boundaryData = [];
          return this.boundaryData;
        });
    }
    return this.boundariesPromise;
  }

  setStarOpacity(opacity) {
    this.starOpacity = opacity;
    this.redrawLastState();
  }

  setConnectionOpacity(opacity) {
    this.connectionOpacity = opacity;
    this.redrawLastState();
  }

  setLabelOpacity(opacity) {
    this.labelOpacity = opacity;
    this.labelManager.setLabelOpacity(opacity);
    this.redrawLastState();
  }

  redrawLastState() {
    if (this.lastStars && this.lastConnections) {
      this.updateMap(this.lastStars, this.lastConnections);
    }
  }

  async updateMap(stars, connectionObjs) {
    this.lastStars = stars;
    this.lastConnections = connectionObjs;
    await Promise.all([this.ensureBoundaryData(), this.ensureConstellationMeta()]);
    this.drawAtlas(stars, connectionObjs);
    this.updateInteractionGeometry(stars);
    requestRenderIfAvailable();
  }

  drawAtlas(stars, connectionObjs) {
    const ctx = this.atlasCtx;
    ctx.clearRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);

    this.drawGraticule(ctx);
    this.drawConstellationOverlay(ctx);
    this.drawDensityOverlay(ctx);
    this.drawIsolationOverlay(ctx);
    this.drawCloudDensityOverlay(ctx);
    this.drawCloudsOverlay(ctx);
    this.drawPlanes(ctx);
    if (this.state.showConstellationBoundariesFlag && Array.isArray(this.boundaryData)) {
      this.drawConstellationBoundaries(ctx, this.boundaryData);
    }
    this.drawConnections(ctx, connectionObjs || []);
    this.drawStars(ctx, stars || []);
    this.drawStarLabels(ctx, stars || []);
    this.drawConstellationNames(ctx);
    this.atlasTexture.needsUpdate = true;
  }

  drawGraticule(ctx) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 12; i++) {
      const x = (i / 12) * ATLAS_WIDTH;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ATLAS_HEIGHT);
      ctx.stroke();
    }
    for (let i = 0; i <= 6; i++) {
      const y = (i / 6) * ATLAS_HEIGHT;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(ATLAS_WIDTH, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawConnections(ctx, connections) {
    const opacity = clamp01(this.connectionOpacity);
    const lineWidth = Math.max(1, readNumberInput('connection-width', 5) * 0.45);
    connections.forEach(connection => {
      if (!connection?.starA || !connection?.starB) return;
      const startVec = connection.starA.spherePosition;
      const endVec = connection.starB.spherePosition;
      const uvPoints = (startVec && endVec)
        ? sampleGreatCircleUvFromVectors(startVec, endVec, 100, 24)
        : sampleGreatCircleUvFromRaDec(
            getStarCoordinates(connection.starA).ra,
            getStarCoordinates(connection.starA).dec,
            getStarCoordinates(connection.starB).ra,
            getStarCoordinates(connection.starB).dec,
            100,
            24
          );
      if (uvPoints.length < 2) return;
      ctx.save();
      ctx.strokeStyle = rgbaFromHex(connection.starA.displayColor || '#8fb5ff', opacity * 0.7);
      ctx.lineWidth = lineWidth;
      for (let i = 0; i < uvPoints.length - 1; i++) {
        splitWrappedUvSegment(uvPoints[i], uvPoints[i + 1]).forEach(([s, e]) => this.strokeUvSegment(ctx, s, e));
      }
      ctx.restore();
    });
  }

  drawStars(ctx, stars) {
    const opacity = clamp01(this.starOpacity);
    stars.forEach(star => {
      if (!star.displayVisible) return;
      const { ra, dec } = getStarCoordinates(star);
      const { u, v } = raDecToUV(ra, dec);
      const x = u * ATLAS_WIDTH;
      const y = v * ATLAS_HEIGHT;
      const radius = THREE.MathUtils.clamp((star.displaySize || 1) * 1.6, 1.2, 10);
      ctx.save();
      ctx.fillStyle = rgbaFromHex(star.displayColor || '#ffffff', opacity);
      this.drawWrappedCircle(ctx, x, y, radius);
      ctx.restore();
    });
  }

  drawStarLabels(ctx, stars) {
    const opacity = clamp01(this.labelOpacity);
    if (opacity <= 0.001) return;
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    stars.forEach(star => {
      if (!star.displayVisible || !star.displayName) return;
      const starPos = getStarEquirectangularPosition(star);
      const offset = this.labelManager.computeLabelOffset(star, starPos);
      const labelPos = starPos.clone().add(offset);
      const starUv = {
        u: (starPos.x / EQUIRECT_WIDTH) + 0.5,
        v: 0.5 - (starPos.y / EQUIRECT_HEIGHT)
      };
      const labelUv = {
        u: (labelPos.x / EQUIRECT_WIDTH) + 0.5,
        v: 0.5 - (labelPos.y / EQUIRECT_HEIGHT)
      };
      const normalizedLabelUv = { u: unwrapUvAroundReference(starUv.u, labelUv.u), v: labelUv.v };
      const starPx = { x: starUv.u * ATLAS_WIDTH, y: starUv.v * ATLAS_HEIGHT };
      const labelPx = { x: normalizedLabelUv.u * ATLAS_WIDTH, y: normalizedLabelUv.v * ATLAS_HEIGHT };
      const labelSize = star.displayLabelSize !== undefined ? star.displayLabelSize : star.displaySize;
      const fontSize = Math.round(THREE.MathUtils.clamp(10 + labelSize * 4, 10, 28));
      const textColor = rgbaFromHex(star.displayColor || '#ffffff', opacity);
      const lineColor = rgbaFromHex(star.displayColor || '#ffffff', opacity * 0.22);
      ctx.font = `${fontSize}px Oswald`;
      const metrics = ctx.measureText(star.displayName);
      const paddingX = 8;
      const textWidth = metrics.width + paddingX * 2;
      const originX = labelPx.x;
      const originY = labelPx.y;
      const baselineY = originY;
      [-ATLAS_WIDTH, 0, ATLAS_WIDTH].forEach(shiftX => {
        const shiftedOriginX = originX + shiftX;
        if (shiftedOriginX + textWidth < 0 || shiftedOriginX - textWidth > ATLAS_WIDTH) return;
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1.5;
        this.strokeUvSegment(
          ctx,
          { u: starUv.u + (shiftX / ATLAS_WIDTH), v: starUv.v },
          { u: normalizedLabelUv.u + (shiftX / ATLAS_WIDTH), v: normalizedLabelUv.v }
        );
        ctx.fillStyle = textColor;
        ctx.strokeStyle = `rgba(0,0,0,${opacity * 0.85})`;
        ctx.lineWidth = 3;
        ctx.strokeText(star.displayName, shiftedOriginX + paddingX, baselineY);
        ctx.fillText(star.displayName, shiftedOriginX + paddingX, baselineY);
      });
    });
    ctx.restore();
  }

  drawConstellationNames(ctx) {
    if (!this.state.showConstellationNamesFlag) return;
    const opacity = clamp01(readNumberInput('constellation-name-opacity', 80) / 100);
    if (opacity <= 0.001) return;
    const centers = getConstellationCenters();
    const fullNames = getConstellationFullNames();
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = '20px Oswald';
    centers.forEach(center => {
      const { u, v } = raDecToUV(center.ra, center.dec);
      const x = u * ATLAS_WIDTH;
      const y = v * ATLAS_HEIGHT;
      const name = fullNames[center.name] || center.name;
      [-ATLAS_WIDTH, 0, ATLAS_WIDTH].forEach(shiftX => {
        const drawX = x + shiftX;
        if (drawX < -180 || drawX > ATLAS_WIDTH + 180) return;
        ctx.strokeStyle = `rgba(0,0,0,${opacity * 0.7})`;
        ctx.fillStyle = `rgba(255,255,255,${opacity})`;
        ctx.lineWidth = 4;
        ctx.strokeText(name, drawX, y);
        ctx.fillText(name, drawX, y);
      });
    });
    ctx.restore();
  }

  drawConstellationBoundaries(ctx, boundaries) {
    ctx.save();
    ctx.strokeStyle = 'rgba(94, 152, 255, 0.5)';
    ctx.lineWidth = 1.25;
    boundaries.forEach(boundary => {
      const points = Array.isArray(boundary?.raDecPolygon) ? boundary.raDecPolygon : [];
      if (points.length < 2) return;
      const closedPoints = points.map(point => ({
        ra: THREE.MathUtils.degToRad(point.ra),
        dec: THREE.MathUtils.degToRad(point.dec)
      }));
      for (let i = 0; i < closedPoints.length; i++) {
        const current = closedPoints[i];
        const next = closedPoints[(i + 1) % closedPoints.length];
        const uvPoints = sampleGreatCircleUvFromRaDec(current.ra, current.dec, next.ra, next.dec, 100, 12);
        for (let j = 0; j < uvPoints.length - 1; j++) {
          splitWrappedUvSegment(uvPoints[j], uvPoints[j + 1]).forEach(([s, e]) => this.strokeUvSegment(ctx, s, e));
        }
      }
    });
    ctx.restore();
  }

  drawConstellationOverlay(ctx) {
    if (!this.state.showConstellationOverlayFlag || !Array.isArray(this.state.constellationOverlayGlobe)) return;
    this.state.constellationOverlayGlobe.forEach(mesh => {
      const color = mesh?.material?.color ? `#${mesh.material.color.getHexString()}` : '#7aa2ff';
      const alpha = clamp01(mesh?.material?.opacity ?? 0.15);
      this.fillProjectedMesh(ctx, mesh, color, alpha);
    });
  }

  drawDensityOverlay(ctx) {
    if (!this.state.enableDensityFilterFlag || !this.state.densityOverlay) return;
    const overlay = this.state.densityOverlay;
    (overlay.cubesData || []).forEach(cell => {
      if (!cell?.active || !cell?.globeMesh?.position) return;
      const uv = spherePositionToUv(cell.globeMesh.position, 100);
      const x = uv.u * ATLAS_WIDTH;
      const y = uv.v * ATLAS_HEIGHT;
      const color = cell.mollweideMesh?.material?.color ? `#${cell.mollweideMesh.material.color.getHexString()}` : '#ff8844';
      const alpha = clamp01((cell.mollweideMesh?.material?.opacity ?? 0.15) * readNumberInput('density-opacity', 100) / 100);
      ctx.save();
      ctx.fillStyle = rgbaFromHex(color, alpha);
      this.drawWrappedCircle(ctx, x, y, Math.max(3, overlay.gridSize * 2));
      ctx.restore();
    });
  }

  drawIsolationOverlay(ctx) {
    if (!this.state.enableIsolationFilterFlag || !this.state.isolationOverlay) return;
    const overlay = this.state.isolationOverlay;
    (overlay.cubesData || []).forEach(cell => {
      if (!cell?.active || !cell?.globeMesh?.position) return;
      const uv = spherePositionToUv(cell.globeMesh.position, 100);
      const x = uv.u * ATLAS_WIDTH;
      const y = uv.v * ATLAS_HEIGHT;
      const color = cell.tcMesh?.material?.color ? `#${cell.tcMesh.material.color.getHexString()}` : '#4f97ff';
      const alpha = clamp01(cell.tcMesh?.material?.opacity ?? 0.35);
      ctx.save();
      ctx.fillStyle = rgbaFromHex(color, alpha);
      this.drawWrappedCircle(ctx, x, y, Math.max(3, overlay.gridSize * 2));
      ctx.restore();
    });
  }

  drawCloudDensityOverlay(ctx) {
    if (!this.state.showCloudDensityFlag || !Array.isArray(this.state.cloudDensityOverlays)) return;
    this.state.cloudDensityOverlays.forEach(overlay => {
      (overlay?.cubesData || []).forEach(cell => {
        if (!cell?.globeMesh) return;
        const color = cell.globeMesh.material?.color ? `#${cell.globeMesh.material.color.getHexString()}` : '#ff6600';
        const alpha = clamp01(cell.globeMesh.material?.opacity ?? 0.2);
        this.fillProjectedMesh(ctx, cell.globeMesh, color, alpha);
      });
    });
  }

  drawCloudsOverlay(ctx) {
    const overlays = this.sourceGlobeScene?.userData?.cloudOverlays;
    if (!this.state.showCloudsFlag || !Array.isArray(overlays)) return;
    overlays.forEach(lineSegments => {
      const geometry = lineSegments?.geometry;
      const pos = geometry?.getAttribute?.('position');
      if (!pos) return;
      const color = lineSegments.material?.color ? `#${lineSegments.material.color.getHexString()}` : '#ff6600';
      const alpha = clamp01(lineSegments.material?.opacity ?? 0.8);
      ctx.save();
      ctx.strokeStyle = rgbaFromHex(color, alpha);
      ctx.lineWidth = 1.6;
      for (let i = 0; i <= pos.count - 2; i += 2) {
        const a = new THREE.Vector3().fromBufferAttribute(pos, i);
        const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
        this.splitWrappedSegment(spherePositionToUv(a, 100), spherePositionToUv(b, 100)).forEach(([s, e]) => this.strokeUvSegment(ctx, s, e));
      }
      ctx.restore();
    });
  }

  drawPlanes(ctx) {
    const planeOpacity = clamp01(readNumberInput('plane-opacity', 50) / 100);
    if (planeOpacity <= 0.001) return;
    if (this.state.showGalacticPlaneFlag) {
      this.drawEquatorialCurve(ctx, angle => galacticToEquatorial(angle, 0), '#7effb2', planeOpacity);
    }
    if (this.state.showEclipticPlaneFlag) {
      this.drawEquatorialCurve(ctx, angle => eclipticToEquatorial(angle, 0), '#ffcb6b', planeOpacity);
    }
    if (this.state.showCelestialEquatorFlag) {
      this.drawEquatorialCurve(ctx, angle => ({ ra: normalizeRightAscension(angle), dec: 0 }), '#8fb5ff', planeOpacity);
    }
  }

  drawEquatorialCurve(ctx, curveFn, color, opacity) {
    ctx.save();
    ctx.strokeStyle = rgbaFromHex(color, opacity * 0.95);
    ctx.lineWidth = 2.25;
    const samples = 256;
    let prev = null;
    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * TAU;
      const current = raDecToUV(curveFn(t).ra, curveFn(t).dec);
      if (prev) {
        this.splitWrappedSegment(prev, current).forEach(([s, e]) => this.strokeUvSegment(ctx, s, e));
      }
      prev = current;
    }
    ctx.restore();
  }

  fillProjectedMesh(ctx, mesh, color, alpha) {
    const geometry = mesh?.geometry;
    const positionAttr = geometry?.getAttribute?.('position');
    if (!positionAttr) return;
    const index = geometry.index;
    ctx.save();
    ctx.fillStyle = rgbaFromHex(color, alpha);
    if (index) {
      for (let i = 0; i <= index.count - 3; i += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(positionAttr, index.getX(i)).applyMatrix4(mesh.matrixWorld);
        const b = new THREE.Vector3().fromBufferAttribute(positionAttr, index.getX(i + 1)).applyMatrix4(mesh.matrixWorld);
        const c = new THREE.Vector3().fromBufferAttribute(positionAttr, index.getX(i + 2)).applyMatrix4(mesh.matrixWorld);
        this.fillWrappedTriangle(ctx, a, b, c);
      }
    } else {
      for (let i = 0; i <= positionAttr.count - 3; i += 3) {
        const a = new THREE.Vector3().fromBufferAttribute(positionAttr, i).applyMatrix4(mesh.matrixWorld);
        const b = new THREE.Vector3().fromBufferAttribute(positionAttr, i + 1).applyMatrix4(mesh.matrixWorld);
        const c = new THREE.Vector3().fromBufferAttribute(positionAttr, i + 2).applyMatrix4(mesh.matrixWorld);
        this.fillWrappedTriangle(ctx, a, b, c);
      }
    }
    ctx.restore();
  }

  fillWrappedTriangle(ctx, aVec, bVec, cVec) {
    const tri = [spherePositionToUv(aVec, 100), spherePositionToUv(bVec, 100), spherePositionToUv(cVec, 100)];
    const normalized = this.normalizeWrappedTriangle(tri);
    [-1, 0, 1].forEach(copyOffset => {
      const points = normalized.map(({ u, v }) => ({ x: (u + copyOffset) * ATLAS_WIDTH, y: v * ATLAS_HEIGHT }));
      const xs = points.map(p => p.x);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      if (maxX < -8 || minX > ATLAS_WIDTH + 8) return;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      ctx.lineTo(points[1].x, points[1].y);
      ctx.lineTo(points[2].x, points[2].y);
      ctx.closePath();
      ctx.fill();
    });
  }

  normalizeWrappedTriangle(triangle) {
    return unwrapUvSequence(triangle.map(point => ({ ...point })));
  }

  equirectToAtlas(position) {
    return {
      x: ((position.x / EQUIRECT_WIDTH) + 0.5) * ATLAS_WIDTH,
      y: (0.5 - (position.y / EQUIRECT_HEIGHT)) * ATLAS_HEIGHT
    };
  }

  drawWrappedCircle(ctx, x, y, radius) {
    [-ATLAS_WIDTH, 0, ATLAS_WIDTH].forEach(shiftX => {
      const drawX = x + shiftX;
      if (drawX + radius < 0 || drawX - radius > ATLAS_WIDTH) return;
      ctx.beginPath();
      ctx.arc(drawX, y, radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  strokeUvSegment(ctx, s, e) {
    [-1, 0, 1].forEach(copyOffset => {
      const x1 = (s.u + copyOffset) * ATLAS_WIDTH;
      const y1 = s.v * ATLAS_HEIGHT;
      const x2 = (e.u + copyOffset) * ATLAS_WIDTH;
      const y2 = e.v * ATLAS_HEIGHT;
      if (Math.max(x1, x2) < 0 || Math.min(x1, x2) > ATLAS_WIDTH) return;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });
  }

  splitWrappedSegment(a, b) {
    return splitWrappedUvSegment(a, b);
  }

  updateInteractionGeometry(stars) {
    while (this.starGroup.children.length) {
      const child = this.starGroup.children[0];
      this.starGroup.remove(child);
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }
    if (!stars?.length) {
      this.starObjects = [];
      return;
    }
    const positions = new Float32Array(stars.length * 3);
    stars.forEach((star, index) => {
      let pos;
      if (this.mapType === 'Equirectangular') {
        pos = getStarEquirectangularPosition(star);
      } else {
        pos = star.spherePosition || new THREE.Vector3();
      }
      positions[index * 3] = pos.x;
      positions[index * 3 + 1] = pos.y;
      positions[index * 3 + 2] = pos.z;
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(geometry, createHiddenPointsMaterial());
    this.starGroup.add(points);
    this.starObjects = stars;
  }

  onResize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (this.camera.isOrthographicCamera) {
      const aspect = width / height;
      this.camera.left = (-this.frustumSize * aspect) / 2;
      this.camera.right = (this.frustumSize * aspect) / 2;
      this.camera.top = this.frustumSize / 2;
      this.camera.bottom = -this.frustumSize / 2;
    } else {
      this.camera.aspect = width / height;
    }
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    requestRenderIfAvailable();
  }

  render() {
    if (!this.canvas.isConnected) return;
    this.renderer.render(this.scene, this.camera);
  }
}
