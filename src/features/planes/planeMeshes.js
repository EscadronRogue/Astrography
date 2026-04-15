// Plane mesh builders migrated from the legacy planes filter module.
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { radToSphere, radToMollweide, getMollweideLambda0, splitMollweideWrap } from '../../shared/geometryUtils.js';
import { DEG2RAD, galacticToEquatorial, eclipticToEquatorial } from './planeDefinitions.js';


export function createGalacticPlaneMesh(size = 250, opacity = 0.2) {
  const half = size / 2;
  const dirs = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2].map(l => {
    const { ra, dec } = galacticToEquatorial(l, 0);
    return radToSphere(ra, dec, half);
  });
  const positions = [
    dirs[0].x, dirs[0].y, dirs[0].z,
    dirs[1].x, dirs[1].y, dirs[1].z,
    dirs[2].x, dirs[2].y, dirs[2].z,
    dirs[2].x, dirs[2].y, dirs[2].z,
    dirs[3].x, dirs[3].y, dirs[3].z,
    dirs[0].x, dirs[0].y, dirs[0].z
  ];
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    opacity,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  return new THREE.Mesh(geom, mat);
}

export function createEclipticPlaneMesh(size = 250, opacity = 0.2) {
  const geom = new THREE.PlaneGeometry(size, size);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffff00, opacity, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(geom, mat);
  const pole = radToSphere(270 * DEG2RAD, 66.5607 * DEG2RAD, 1);
  mesh.lookAt(pole);
  return mesh;
}

export function createCelestialEquatorMesh(size = 250, opacity = 0.2) {
  const geom = new THREE.PlaneGeometry(size, size);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff0000, opacity, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(geom, mat);
  const pole = radToSphere(0, 90 * DEG2RAD, 1);
  mesh.lookAt(pole);
  return mesh;
}

function createGreatCircleLine(points, color, width = 2, opacity = 0.5) {
  const geom = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    linewidth: width
  });
  return new THREE.Line(geom, mat);
}

export function createGalacticPlaneGlobe(R = 100, segments = 180, opacity = 0.5) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const l = (i / segments) * 2 * Math.PI;
    const { ra, dec } = galacticToEquatorial(l, 0);
    pts.push(radToSphere(ra, dec, R));
  }
  return createGreatCircleLine(pts, 0xffffff, 20, opacity);
}

export function createEclipticPlaneGlobe(R = 100, segments = 180, opacity = 0.5) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const lam = (i / segments) * 2 * Math.PI;
    const { ra, dec } = eclipticToEquatorial(lam, 0);
    pts.push(radToSphere(ra, dec, R));
  }
  return createGreatCircleLine(pts, 0xffff00, 10, opacity);
}

export function createCelestialEquatorGlobe(R = 100, segments = 180, opacity = 0.5) {
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const ra = (i / segments) * 2 * Math.PI;
    const dec = 0;
    pts.push(radToSphere(ra, dec, R));
  }
  return createGreatCircleLine(pts, 0xff0000, 10, opacity);
}

export function createGalacticPlaneMollweide(segments = 180, opacity = 0.5) {
  const line = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 20, transparent: true, opacity })
  );
  line.userData.segments = segments;
  updateGalacticPlaneMollweide(line);
  return line;
}

export function updateGalacticPlaneMollweide(line) {
  const segments = line.userData.segments || 180;
  const lambda0 = getMollweideLambda0();
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const l = (i / segments) * 2 * Math.PI;
    const { ra, dec } = galacticToEquatorial(l, 0);
    pts.push(radToMollweide(ra, dec, 100, lambda0));
  }
  const positions = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const splits = splitMollweideWrap(pts[i], pts[i + 1]);
    splits.forEach(pair => {
      positions.push(pair[0].x, pair[0].y, 0);
      positions.push(pair[1].x, pair[1].y, 0);
    });
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  line.geometry.dispose();
  line.geometry = geom;
}

export function createEclipticPlaneMollweide(segments = 180, opacity = 0.5) {
  const line = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 10, transparent: true, opacity })
  );
  line.userData.segments = segments;
  updateEclipticPlaneMollweide(line);
  return line;
}

export function createCelestialEquatorMollweide(segments = 180, opacity = 0.5) {
  const line = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 10, transparent: true, opacity })
  );
  line.userData.segments = segments;
  updateCelestialEquatorMollweide(line);
  return line;
}

export function updateEclipticPlaneMollweide(line) {
  const segments = line.userData.segments || 180;
  const lambda0 = getMollweideLambda0();
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const lam = (i / segments) * 2 * Math.PI;
    const { ra, dec } = eclipticToEquatorial(lam, 0);
    pts.push(radToMollweide(ra, dec, 100, lambda0));
  }
  const positions = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const splits = splitMollweideWrap(pts[i], pts[i + 1]);
    splits.forEach(pair => {
      positions.push(pair[0].x, pair[0].y, 0);
      positions.push(pair[1].x, pair[1].y, 0);
    });
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  line.geometry.dispose();
  line.geometry = geom;
}

export function updateCelestialEquatorMollweide(line) {
  const segments = line.userData.segments || 180;
  const lambda0 = getMollweideLambda0();
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const ra = (i / segments) * 2 * Math.PI;
    pts.push(radToMollweide(ra, 0, 100, lambda0));
  }
  const positions = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const splits = splitMollweideWrap(pts[i], pts[i + 1]);
    splits.forEach(pair => {
      positions.push(pair[0].x, pair[0].y, 0);
      positions.push(pair[1].x, pair[1].y, 0);
    });
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  line.geometry.dispose();
  line.geometry = geom;
}

function createTextSprite(text, color = '#ffffff', opacity = 0.8, fontSize = 150) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.font = `${fontSize}px Oswald`;
  const textWidth = ctx.measureText(text).width;
  canvas.width = textWidth + 20;
  canvas.height = fontSize * 1.2;
  ctx.font = `${fontSize}px Oswald`;
  ctx.fillStyle = color;
  ctx.fillText(text, 10, fontSize);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(canvas.width / 100, canvas.height / 100, 1);
  return sprite;
}

function createTextPlane(text, color = '#ffffff', opacity = 0.8, fontSize = 150) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');
  ctx.font = `${fontSize}px Oswald`;
  const textWidth = ctx.measureText(text).width;
  canvas.width = textWidth + 20;
  canvas.height = fontSize * 1.2;
  ctx.font = `${fontSize}px Oswald`;
  ctx.fillStyle = color;
  ctx.fillText(text, 10, fontSize);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.ShaderMaterial({
    uniforms: { map: { value: texture }, opacity: { value: opacity } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform float opacity;
      varying vec2 vUv;
      void main() {
        vec2 uvCorrected = gl_FrontFacing ? vUv : vec2(1.0 - vUv.x, vUv.y);
        vec4 color = texture2D(map, uvCorrected);
        gl_FragColor = vec4(color.rgb, color.a * opacity);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide
  });
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(canvas.width / 100, canvas.height / 100),
    material
  );
  plane.renderOrder = 2;
  return plane;
}

function galacticDirectionData() {
  return [
    { l: 0, label: 'Galactic Center' },
    { l: Math.PI, label: 'Galactic Anticenter' },
    { l: Math.PI / 2, label: 'Galactic Rotation' },
    { l: 3 * Math.PI / 2, label: 'Galactic Anti-Rotation' }
  ];
}

export function createGalacticDirectionLabelsTrue(R = 100, opacity = 0.8) {
  const labels = [];
  galacticDirectionData().forEach(d => {
    const eq = galacticToEquatorial(d.l, 0);
    const pos = radToSphere(eq.ra, eq.dec, R);
    const sprite = createTextSprite(d.label, '#ffffff', opacity, 450);
    sprite.position.copy(pos);
    labels.push(sprite);
  });
  return labels;
}

export function createGalacticDirectionLabelsGlobe(R = 102, opacity = 0.8) {
  const labels = [];
  galacticDirectionData().forEach(d => {
    const eq = galacticToEquatorial(d.l, 0);
    const pos = radToSphere(eq.ra, eq.dec, R);
    const mesh = createTextPlane(d.label, '#ffffff', opacity, 450);
    mesh.position.copy(pos);
    const normal = pos.clone().normalize();
    const globalUp = new THREE.Vector3(0, 1, 0);
    let desiredUp = globalUp.clone().sub(normal.clone().multiplyScalar(globalUp.dot(normal)));
    if (desiredUp.lengthSq() < 1e-6) desiredUp = new THREE.Vector3(0, 0, 1); else desiredUp.normalize();
    const desiredRight = new THREE.Vector3().crossVectors(desiredUp, normal).normalize();
    const matrix = new THREE.Matrix4().makeBasis(desiredRight, desiredUp, normal);
    mesh.setRotationFromMatrix(matrix);
    labels.push(mesh);
  });
  return labels;
}

export function createGalacticDirectionLabelsMollweide(R = 100, opacity = 0.8) {
  const lambda0 = getMollweideLambda0();
  const labels = [];
  galacticDirectionData().forEach(d => {
    const eq = galacticToEquatorial(d.l, 0);
    const p = radToMollweide(eq.ra, eq.dec, R, lambda0);
    const sprite = createTextSprite(d.label, '#ffffff', opacity, 450);
    sprite.position.set(p.x, p.y, 0);
    sprite.userData = { name: d.label, ra: eq.ra, dec: eq.dec };
    labels.push(sprite);
  });
  return labels;
}

export function updateGalacticDirectionLabelsMollweide(labels, R = 100) {
  const lambda0 = getMollweideLambda0();
  labels.forEach(sprite => {
    if (!sprite.userData) return;
    const p = radToMollweide(sprite.userData.ra, sprite.userData.dec, R, lambda0);
    sprite.position.set(p.x, p.y, 0);
  });
}
