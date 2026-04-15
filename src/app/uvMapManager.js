import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { ThreeDControls, TwoDControls } from '../render/interactions/cameraControls.js';
import { LabelManager } from '../features/labels/labelManager.js';
import { requestRenderIfAvailable } from '../shared/renderScheduler.js';
import { getStarCoordinates } from '../shared/starUtils.js';
import { EQUIRECT_WIDTH, EQUIRECT_HEIGHT, raDecToUV, getStarEquirectangularPosition } from '../shared/uvUtils.js';

const ATLAS_WIDTH = 4096;
const ATLAS_HEIGHT = 2048;
const PLANE_WIDTH = EQUIRECT_WIDTH;
const PLANE_HEIGHT = EQUIRECT_HEIGHT;
const GLOBE_RADIUS = 99;

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
  }

  redrawLastState() {
    if (this.lastStars && this.lastConnections) {
      this.updateMap(this.lastStars, this.lastConnections);
    }
  }

  async updateMap(stars, connectionObjs) {
    this.lastStars = stars;
    this.lastConnections = connectionObjs;
    await this.ensureBoundaryData();
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
    if (this.state.showConstellationBoundariesFlag && Array.isArray(this.boundaryData)) {
      this.drawConstellationBoundaries(ctx, this.boundaryData);
    }
    this.drawConnections(ctx, connectionObjs || []);
    this.drawStars(ctx, stars || []);
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
    const opacity = THREE.MathUtils.clamp(this.connectionOpacity, 0, 1);
    connections.forEach(connection => {
      if (!connection?.starA || !connection?.starB) return;
      const { ra: raA, dec: decA } = getStarCoordinates(connection.starA);
      const { ra: raB, dec: decB } = getStarCoordinates(connection.starB);
      const a = raDecToUV(raA, decA);
      const b = raDecToUV(raB, decB);
      const segments = this.splitWrappedSegment(a, b);
      ctx.save();
      ctx.strokeStyle = rgbaFromHex(connection.starA.displayColor || '#8fb5ff', opacity * 0.7);
      ctx.lineWidth = 2;
      segments.forEach(([s, e]) => {
        ctx.beginPath();
        ctx.moveTo(s.u * ATLAS_WIDTH, s.v * ATLAS_HEIGHT);
        ctx.lineTo(e.u * ATLAS_WIDTH, e.v * ATLAS_HEIGHT);
        ctx.stroke();
      });
      ctx.restore();
    });
  }

  drawStars(ctx, stars) {
    const opacity = THREE.MathUtils.clamp(this.starOpacity, 0, 1);
    stars.forEach(star => {
      if (!star.displayVisible) return;
      const { ra, dec } = getStarCoordinates(star);
      const { u, v } = raDecToUV(ra, dec);
      const x = u * ATLAS_WIDTH;
      const y = v * ATLAS_HEIGHT;
      const radius = THREE.MathUtils.clamp((star.displaySize || 1) * 1.6, 1.2, 10);
      ctx.save();
      ctx.fillStyle = rgbaFromHex(star.displayColor || '#ffffff', opacity);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  drawConstellationBoundaries(ctx, boundaries) {
    ctx.save();
    ctx.strokeStyle = 'rgba(94, 152, 255, 0.5)';
    ctx.lineWidth = 1.25;
    boundaries.forEach(boundary => {
      const points = Array.isArray(boundary?.raDecPolygon) ? boundary.raDecPolygon : [];
      if (points.length < 2) return;
      for (let i = 0; i < points.length; i++) {
        const current = points[i];
        const next = points[(i + 1) % points.length];
        const a = raDecToUV(THREE.MathUtils.degToRad(current.ra), THREE.MathUtils.degToRad(current.dec));
        const b = raDecToUV(THREE.MathUtils.degToRad(next.ra), THREE.MathUtils.degToRad(next.dec));
        this.splitWrappedSegment(a, b).forEach(([s, e]) => {
          ctx.beginPath();
          ctx.moveTo(s.u * ATLAS_WIDTH, s.v * ATLAS_HEIGHT);
          ctx.lineTo(e.u * ATLAS_WIDTH, e.v * ATLAS_HEIGHT);
          ctx.stroke();
        });
      }
    });
    ctx.restore();
  }

  splitWrappedSegment(a, b) {
    let du = b.u - a.u;
    if (Math.abs(du) <= 0.5) return [[a, b]];
    if (du > 0.5) {
      const t = (1 - a.u) / ((b.u - 1) - a.u || 1);
      const vEdge = THREE.MathUtils.lerp(a.v, b.v, t);
      return [
        [{ u: a.u, v: a.v }, { u: 1, v: vEdge }],
        [{ u: 0, v: vEdge }, { u: b.u, v: b.v }]
      ];
    }
    const t = (0 - a.u) / ((b.u + 1) - a.u || 1);
    const vEdge = THREE.MathUtils.lerp(a.v, b.v, t);
    return [
      [{ u: a.u, v: a.v }, { u: 0, v: vEdge }],
      [{ u: 1, v: vEdge }, { u: b.u, v: b.v }]
    ];
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
