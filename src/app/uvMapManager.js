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
import { loadConstellationCenters, loadConstellationFullNames, getConstellationFullNames } from '../features/constellations/constellationDataService.js';
import { getConstellationLabelAnchors } from '../features/constellations/constellationLabelPlacement.js';
import { applyCanvasConstellationLabelStyle, constellationLineCss } from '../features/constellations/constellationStyle.js';
import { computeConstellationColorMapping } from '../features/constellations/constellationOverlayMeshes.js';
import { galacticToEquatorial, eclipticToEquatorial } from '../features/planes/planeDefinitions.js';

const ATLAS_WIDTH = 4096;
const ATLAS_HEIGHT = 2048;
const PLANE_WIDTH = EQUIRECT_WIDTH;
const PLANE_HEIGHT = EQUIRECT_HEIGHT;
const GLOBE_RADIUS = 99;
const TAU = Math.PI * 2;
const LABEL_MARGIN_Y = 10;

function createHiddenPointsMaterial() {
  return new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.35,
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
    const lineWidth = Math.max(1, readNumberInput('connection-width-slider', 5) * 0.45);
    const labelSize = readNumberInput('connection-label-size-slider', 1);
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

      // Distance label at midpoint
      if (connection.distance != null && opacity > 0.05 && labelSize > 0.01) {
        const midIdx = Math.floor(uvPoints.length / 2);
        const midUv = uvPoints[midIdx];
        if (midUv) {
          const distText = `${connection.distance < 10 ? connection.distance.toFixed(1) : connection.distance.toFixed(0)} ly`;
          const fontSize = Math.round(THREE.MathUtils.clamp(10 * labelSize, 6, 24));
          const labelColor = rgbaFromHex(
            connection.starA.displayColor || '#8fb5ff',
            opacity * 0.85
          );
          ctx.save();
          ctx.font = `${fontSize}px Oswald`;
          ctx.fillStyle = labelColor;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.strokeStyle = `rgba(0,0,0,${opacity * 0.7})`;
          ctx.lineWidth = 2;
          const px = midUv.u * ATLAS_WIDTH;
          const py = midUv.v * ATLAS_HEIGHT;
          [-ATLAS_WIDTH, 0, ATLAS_WIDTH].forEach(shiftX => {
            const drawX = px + shiftX;
            if (drawX < -60 || drawX > ATLAS_WIDTH + 60) return;
            ctx.strokeText(distText, drawX, py);
            ctx.fillText(distText, drawX, py);
          });
          ctx.restore();
        }
      }
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

    const visibleLabeledStars = (stars || []).filter(star => star.displayVisible && star.displayName);
    if (!visibleLabeledStars.length) return;

    const visibleStarAnchors = (stars || [])
      .filter(star => star.displayVisible)
      .map(star => {
        const starPos = getStarEquirectangularPosition(star);
        return {
          x: ((starPos.x / EQUIRECT_WIDTH) + 0.5) * ATLAS_WIDTH,
          y: (0.5 - (starPos.y / EQUIRECT_HEIGHT)) * ATLAS_HEIGHT,
          star
        };
      });

    const placedBoxes = [];
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    visibleLabeledStars
      .slice()
      .sort((a, b) => this.getLabelPriority(b) - this.getLabelPriority(a))
      .forEach(star => {
        const placement = this.computeUvLabelPlacement(ctx, star, visibleStarAnchors, placedBoxes);
        if (!placement) return;

        const textColor = rgbaFromHex(star.displayColor || '#ffffff', opacity);
        const lineColor = rgbaFromHex(star.displayColor || '#ffffff', opacity * 0.2);
        ctx.font = `${placement.fontSize}px Oswald`;
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1.35;

        this.strokeUvSegment(
          ctx,
          placement.connector.startUv,
          placement.connector.endUv
        );

        [-ATLAS_WIDTH, 0, ATLAS_WIDTH].forEach(shiftX => {
          const drawX = placement.drawX + shiftX;
          if (drawX + placement.bounds.width < -24 || drawX > ATLAS_WIDTH + 24) return;
          ctx.fillStyle = textColor;
          ctx.strokeStyle = `rgba(0,0,0,${opacity * 0.85})`;
          ctx.lineWidth = 3;
          ctx.strokeText(star.displayName, drawX, placement.drawY);
          ctx.fillText(star.displayName, drawX, placement.drawY);
        });

        placedBoxes.push({
          x: placement.bounds.x,
          y: placement.bounds.y,
          width: placement.bounds.width,
          height: placement.bounds.height,
          starX: placement.starPx.x,
          starY: placement.starPx.y
        });
      });
    ctx.restore();
  }

  getLabelPriority(star) {
    const nameWeight = Math.max(1, (star.displayName || '').length * 0.05);
    const sizeWeight = star.displayLabelSize !== undefined ? star.displayLabelSize : (star.displaySize || 1);
    const magWeight = Number.isFinite(star.absoluteMagnitude) ? (8 - star.absoluteMagnitude) * 0.35 : 0;
    return sizeWeight * 2 + magWeight + nameWeight;
  }

  computeUvLabelPlacement(ctx, star, visibleStarAnchors, placedBoxes) {
    const starPos = getStarEquirectangularPosition(star);
    const starPx = {
      x: ((starPos.x / EQUIRECT_WIDTH) + 0.5) * ATLAS_WIDTH,
      y: (0.5 - (starPos.y / EQUIRECT_HEIGHT)) * ATLAS_HEIGHT
    };
    const labelSize = star.displayLabelSize !== undefined ? star.displayLabelSize : star.displaySize;
    const fontSize = Math.round(THREE.MathUtils.clamp(10 + labelSize * 4, 10, 28));
    const paddingX = 8;
    const textHeight = Math.max(fontSize + 4, 14);
    ctx.font = `${fontSize}px Oswald`;
    const textWidth = ctx.measureText(star.displayName).width;

    const baseRadius = THREE.MathUtils.clamp((star.displaySize || 1) * 2.8 + 10, 12, 30);
    const directions = [
      new THREE.Vector2(1, 0),
      new THREE.Vector2(-1, 0),
      new THREE.Vector2(0.84, -0.54),
      new THREE.Vector2(0.84, 0.54),
      new THREE.Vector2(-0.84, -0.54),
      new THREE.Vector2(-0.84, 0.54),
      new THREE.Vector2(0, -1),
      new THREE.Vector2(0, 1)
    ];
    const radii = [baseRadius, baseRadius + 8, baseRadius + 16, baseRadius + 24];

    let best = null;
    for (const radius of radii) {
      for (const dir of directions) {
        const candidate = this.evaluateUvLabelCandidate({
          starPx,
          dir,
          radius,
          textWidth,
          textHeight,
          paddingX,
          fontSize,
          visibleStarAnchors,
          placedBoxes
        });
        if (!candidate) continue;
        if (!best || candidate.score < best.score) {
          best = candidate;
        }
      }
    }

    if (!best) return null;

    const starUv = { u: starPx.x / ATLAS_WIDTH, v: starPx.y / ATLAS_HEIGHT };
    const anchorUv = { u: best.anchorX / ATLAS_WIDTH, v: best.anchorY / ATLAS_HEIGHT };
    const endUv = { u: unwrapUvAroundReference(starUv.u, anchorUv.u), v: anchorUv.v };

    return {
      fontSize,
      drawX: best.drawX,
      drawY: best.drawY,
      bounds: best.bounds,
      starPx,
      connector: {
        startUv: starUv,
        endUv
      }
    };
  }

  evaluateUvLabelCandidate({ starPx, dir, radius, textWidth, textHeight, paddingX, fontSize, visibleStarAnchors, placedBoxes }) {
    const anchorXRaw = starPx.x + dir.x * radius;
    const anchorY = THREE.MathUtils.clamp(starPx.y + dir.y * radius, LABEL_MARGIN_Y + textHeight * 0.5, ATLAS_HEIGHT - LABEL_MARGIN_Y - textHeight * 0.5);
    const preferRight = dir.x >= 0;
    const drawXRaw = preferRight ? (anchorXRaw + paddingX) : (anchorXRaw - paddingX - textWidth);
    const drawX = this.wrapPixelX(drawXRaw);
    const drawY = anchorY;
    const bounds = {
      x: drawX,
      y: drawY - textHeight * 0.5,
      width: textWidth,
      height: textHeight
    };

    let overlapPenalty = 0;
    for (const box of placedBoxes) {
      if (this.boxesOverlapWrapped(bounds, box)) overlapPenalty += 5000;
    }

    let starPenalty = 0;
    const expandedBounds = {
      x: bounds.x - 5,
      y: bounds.y - 4,
      width: bounds.width + 10,
      height: bounds.height + 8
    };
    for (const anchor of visibleStarAnchors) {
      if (anchor.x === starPx.x && anchor.y === starPx.y) continue;
      if (this.pointInWrappedRect(anchor.x, anchor.y, expandedBounds)) {
        starPenalty += 220;
      }
    }

    const verticalPenalty = Math.abs(anchorY - starPx.y) * 0.28;
    const radialPenalty = radius * 0.9;
    const sideBias = dir.x < 0 ? 6 : 0;
    const polarPenalty = (anchorY < 70 || anchorY > ATLAS_HEIGHT - 70) ? 40 : 0;
    const score = overlapPenalty + starPenalty + verticalPenalty + radialPenalty + sideBias + polarPenalty;

    return {
      score,
      anchorX: this.wrapPixelX(anchorXRaw),
      anchorY,
      drawX,
      drawY,
      bounds
    };
  }

  wrapPixelX(value) {
    let wrapped = value % ATLAS_WIDTH;
    if (wrapped < 0) wrapped += ATLAS_WIDTH;
    return wrapped;
  }

  pointInWrappedRect(x, y, rect) {
    if (y < rect.y || y > rect.y + rect.height) return false;
    for (const shift of [-ATLAS_WIDTH, 0, ATLAS_WIDTH]) {
      const shiftedX = x + shift;
      if (shiftedX >= rect.x && shiftedX <= rect.x + rect.width) return true;
    }
    return false;
  }

  boxesOverlapWrapped(a, b) {
    const yOverlap = a.y < (b.y + b.height) && (a.y + a.height) > b.y;
    if (!yOverlap) return false;
    for (const shift of [-ATLAS_WIDTH, 0, ATLAS_WIDTH]) {
      const bx = b.x + shift;
      const xOverlap = a.x < (bx + b.width) && (a.x + a.width) > bx;
      if (xOverlap) return true;
    }
    return false;
  }

  drawConstellationNames(ctx) {
    if (!this.state.showConstellationNamesFlag) return;
    const opacity = clamp01(readNumberInput('constellation-name-opacity-slider', 80) / 100);
    if (opacity <= 0.001) return;
    const centers = getConstellationLabelAnchors();
    const fullNames = getConstellationFullNames();
    ctx.save();
    applyCanvasConstellationLabelStyle(ctx, opacity);
    centers.forEach(center => {
      const { u, v } = raDecToUV(center.ra, center.dec);
      const x = u * ATLAS_WIDTH;
      const y = v * ATLAS_HEIGHT;
      const name = fullNames[center.name] || center.name;
      [-ATLAS_WIDTH, 0, ATLAS_WIDTH].forEach(shiftX => {
        const drawX = x + shiftX;
        if (drawX < -180 || drawX > ATLAS_WIDTH + 180) return;
        ctx.strokeText(name, drawX, y);
        ctx.fillText(name, drawX, y);
      });
    });
    ctx.restore();
  }

  drawConstellationBoundaries(ctx, boundaries) {
    const opacity = clamp01(readNumberInput('constellation-line-opacity-slider', 40) / 100);
    const lineWidth = Math.max(0.1, readNumberInput('constellation-line-width-slider', 1));
    if (opacity <= 0.001) return;
    ctx.save();
    ctx.strokeStyle = constellationLineCss(opacity);
    ctx.lineWidth = lineWidth;
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
    const opacityFactor = clamp01(readNumberInput('density-opacity-slider', 100) / 100);
    if (opacityFactor <= 0.001) return;

    // Smooth heatmap pass (inspired by Mollweide heatmap canvas approach)
    ctx.save();
    ctx.filter = 'blur(6px)';
    (overlay.cubesData || []).forEach(cell => {
      if (!cell?.active) return;
      const uv = (cell.raRad != null && cell.decRad != null)
        ? raDecToUV(cell.raRad, cell.decRad)
        : spherePositionToUv(cell.globeMesh.position, 100);
      const x = uv.u * ATLAS_WIDTH;
      const y = uv.v * ATLAS_HEIGHT;
      const color = cell.tcMesh?.material?.color ? `#${cell.tcMesh.material.color.getHexString()}` : '#ff8844';
      const cellAlpha = cell.tcMesh?.material?.opacity ?? 0.15;
      const alpha = clamp01(cellAlpha * opacityFactor);
      const distRatio = cell.tcPos ? Math.min(1, cell.tcPos.length() / (overlay.maxDistance || 20)) : 0.5;
      const scale = THREE.MathUtils.lerp(12, 1, distRatio);
      const radius = Math.max(4, overlay.gridSize * scale * 0.6);
      const grd = ctx.createRadialGradient(x, y, 0, x, y, radius);
      grd.addColorStop(0, rgbaFromHex(color, alpha));
      grd.addColorStop(0.7, rgbaFromHex(color, alpha * 0.3));
      grd.addColorStop(1, rgbaFromHex(color, 0));
      ctx.fillStyle = grd;
      this.drawWrappedCircle(ctx, x, y, radius);
    });
    ctx.filter = 'none';

    // Draw adjacent lines between active cells
    (overlay.adjacentLines || []).forEach(({ cell1, cell2 }) => {
      if (!cell1?.active || !cell2?.active) return;
      const uv1 = (cell1.raRad != null) ? raDecToUV(cell1.raRad, cell1.decRad) : spherePositionToUv(cell1.globeMesh.position, 100);
      const uv2 = (cell2.raRad != null) ? raDecToUV(cell2.raRad, cell2.decRad) : spherePositionToUv(cell2.globeMesh.position, 100);
      const c1 = cell1.tcMesh?.material?.color;
      const c2 = cell2.tcMesh?.material?.color;
      const avgColor = c1 ? `#${c1.clone().lerp(c2 || c1, 0.5).getHexString()}` : '#ff8844';
      const avgAlpha = clamp01(((cell1.tcMesh?.material?.opacity ?? 0) + (cell2.tcMesh?.material?.opacity ?? 0)) / 2 * opacityFactor);
      ctx.strokeStyle = rgbaFromHex(avgColor, avgAlpha);
      ctx.lineWidth = 1.5;
      const segments = sampleGreatCircleUvFromRaDec(
        cell1.raRad ?? 0, cell1.decRad ?? 0,
        cell2.raRad ?? 0, cell2.decRad ?? 0,
        100, 12
      );
      for (let j = 0; j < segments.length - 1; j++) {
        splitWrappedUvSegment(segments[j], segments[j + 1]).forEach(([s, e]) => this.strokeUvSegment(ctx, s, e));
      }
    });
    ctx.restore();
  }

  drawIsolationOverlay(ctx) {
    if (!this.state.enableIsolationFilterFlag || !this.state.isolationOverlay) return;
    const overlay = this.state.isolationOverlay;

    // Draw adjacent lines between active cells first (behind cell dots)
    ctx.save();
    (overlay.adjacentLines || []).forEach(({ line, cell1, cell2 }) => {
      if (!cell1?.active || !cell2?.active) return;
      const uv1 = (cell1.raRad != null) ? raDecToUV(cell1.raRad, cell1.decRad) : spherePositionToUv(cell1.globeMesh.position, 100);
      const uv2 = (cell2.raRad != null) ? raDecToUV(cell2.raRad, cell2.decRad) : spherePositionToUv(cell2.globeMesh.position, 100);
      const c1 = cell1.tcMesh?.material?.color;
      const c2 = cell2.tcMesh?.material?.color;
      const avgColor = c1 ? `#${c1.clone().lerp(c2 || c1, 0.5).getHexString()}` : '#4f97ff';
      const avgAlpha = clamp01(((cell1.tcMesh?.material?.opacity ?? 0) + (cell2.tcMesh?.material?.opacity ?? 0)) / 2);
      ctx.strokeStyle = rgbaFromHex(avgColor, avgAlpha * 0.6);
      ctx.lineWidth = 1.2;
      const segments = sampleGreatCircleUvFromRaDec(
        cell1.raRad ?? 0, cell1.decRad ?? 0,
        cell2.raRad ?? 0, cell2.decRad ?? 0,
        100, 12
      );
      for (let j = 0; j < segments.length - 1; j++) {
        splitWrappedUvSegment(segments[j], segments[j + 1]).forEach(([s, e]) => this.strokeUvSegment(ctx, s, e));
      }
    });

    // Draw cell indicators
    (overlay.cubesData || []).forEach(cell => {
      if (!cell?.active) return;
      const uv = (cell.raRad != null && cell.decRad != null)
        ? raDecToUV(cell.raRad, cell.decRad)
        : spherePositionToUv(cell.globeMesh.position, 100);
      const x = uv.u * ATLAS_WIDTH;
      const y = uv.v * ATLAS_HEIGHT;
      const color = cell.tcMesh?.material?.color ? `#${cell.tcMesh.material.color.getHexString()}` : '#4f97ff';
      const alpha = clamp01(cell.tcMesh?.material?.opacity ?? 0.35);
      const distRatio = cell.tcPos ? Math.min(1, cell.tcPos.length() / (overlay.maxDistance || 20)) : 0.5;
      const scale = THREE.MathUtils.lerp(12, 1, distRatio);
      const radius = Math.max(3, overlay.gridSize * scale * 0.5);
      ctx.fillStyle = rgbaFromHex(color, alpha);
      this.drawWrappedCircle(ctx, x, y, radius);
    });
    ctx.restore();
  }

  drawCloudDensityOverlay(ctx) {
    if (!this.state.showCloudDensityFlag || !Array.isArray(this.state.cloudDensityOverlays)) return;
    const cdOpacity = clamp01(readNumberInput('cloud-density-opacity-slider', 100) / 100);
    if (cdOpacity <= 0.001) return;
    ctx.save();
    ctx.filter = 'blur(4px)';
    this.state.cloudDensityOverlays.forEach(overlay => {
      (overlay?.cubesData || []).forEach(cell => {
        if (!cell?.globeMesh) return;
        const color = cell.globeMesh.material?.color ? `#${cell.globeMesh.material.color.getHexString()}` : '#ff6600';
        const alpha = clamp01((cell.globeMesh.material?.opacity ?? 0.2) * cdOpacity);
        // Use native UV from globe position
        const uv = spherePositionToUv(cell.globeMesh.position, 100);
        const x = uv.u * ATLAS_WIDTH;
        const y = uv.v * ATLAS_HEIGHT;
        const radius = Math.max(6, 18);
        const grd = ctx.createRadialGradient(x, y, 0, x, y, radius);
        grd.addColorStop(0, rgbaFromHex(color, alpha));
        grd.addColorStop(0.6, rgbaFromHex(color, alpha * 0.4));
        grd.addColorStop(1, rgbaFromHex(color, 0));
        ctx.fillStyle = grd;
        this.drawWrappedCircle(ctx, x, y, radius);
      });
    });
    ctx.filter = 'none';
    ctx.restore();
  }

  drawCloudsOverlay(ctx) {
    const overlays = this.sourceGlobeScene?.userData?.cloudOverlays;
    if (!this.state.showCloudsFlag || !Array.isArray(overlays)) return;
    const cloudOpacity = clamp01(readNumberInput('cloud-opacity-slider', 100) / 100);
    if (cloudOpacity <= 0.001) return;
    overlays.forEach(lineSegments => {
      const geometry = lineSegments?.geometry;
      const pos = geometry?.getAttribute?.('position');
      if (!pos) return;
      const color = lineSegments.material?.color ? `#${lineSegments.material.color.getHexString()}` : '#ff6600';
      const baseAlpha = lineSegments.material?.opacity ?? 0.8;
      const alpha = clamp01(baseAlpha * cloudOpacity);
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
    const planeOpacity = clamp01(readNumberInput('plane-opacity-slider', 50) / 100);
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
