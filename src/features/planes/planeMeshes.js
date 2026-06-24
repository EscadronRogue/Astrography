import * as THREE from '../../vendor/three.js';
import { radToSphere } from '../../shared/geometryUtils.js';
import { createMeasuredTextCanvas } from '../../shared/textCanvas.js';
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

function createTextSprite(text, color = '#ffffff', opacity = 0.8, fontSize = 150) {
  const { canvas } = createMeasuredTextCanvas(text, {
    font: `${fontSize}px Oswald`,
    paddingX: 10,
    height: fontSize * 1.2,
    fillStyle: color,
    textBaseline: 'alphabetic',
    textY: fontSize
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, opacity });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(canvas.width / 100, canvas.height / 100, 1);
  return sprite;
}

function createTextPlane(text, color = '#ffffff', opacity = 0.8, fontSize = 150) {
  const { canvas } = createMeasuredTextCanvas(text, {
    font: `${fontSize}px Oswald`,
    paddingX: 10,
    height: fontSize * 1.2,
    fillStyle: color,
    textBaseline: 'alphabetic',
    textY: fontSize
  });
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
