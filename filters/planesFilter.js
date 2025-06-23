// filters/planesFilter.js
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { radToSphere, radToMollweide, getMollweideLambda0, splitMollweideWrap } from '../utils/geometryUtils.js';

const DEG2RAD = Math.PI / 180;

// Galactic to equatorial conversion constants (J2000)
const alphaGP = 192.85948 * DEG2RAD;
const deltaGP = 27.12825 * DEG2RAD;
const lOmega  = 32.93192 * DEG2RAD;

// Obliquity of the ecliptic
const epsilon = 23.43928 * DEG2RAD;

// J2000 Galactic -> Equatorial rotation matrix (IAU, transpose of equatorial
// to galactic matrix)
const GAL_TO_EQ_MATRIX = [
  [-0.0548755604162154, 0.4941094278755837, -0.8676661490190047],
  [-0.8734370902348850, -0.4448296299600112, -0.1980763734312015],
  [-0.4838350155487132, 0.7469822444972189, 0.4559837761750669]
];

function galacticToEquatorial(l, b) {
  const cosb = Math.cos(b);
  const vx = cosb * Math.cos(l);
  const vy = cosb * Math.sin(l);
  const vz = Math.sin(b);
  const eqx =
    GAL_TO_EQ_MATRIX[0][0] * vx +
    GAL_TO_EQ_MATRIX[0][1] * vy +
    GAL_TO_EQ_MATRIX[0][2] * vz;
  const eqy =
    GAL_TO_EQ_MATRIX[1][0] * vx +
    GAL_TO_EQ_MATRIX[1][1] * vy +
    GAL_TO_EQ_MATRIX[1][2] * vz;
  const eqz =
    GAL_TO_EQ_MATRIX[2][0] * vx +
    GAL_TO_EQ_MATRIX[2][1] * vy +
    GAL_TO_EQ_MATRIX[2][2] * vz;
  let ra = Math.atan2(eqy, eqx);
  if (ra < 0) ra += 2 * Math.PI;
  const dec = Math.asin(eqz);
  return { ra, dec };
}

function eclipticToEquatorial(lambda, beta = 0) {
  const sinB = Math.sin(beta);
  const cosB = Math.cos(beta);
  const sinL = Math.sin(lambda);
  const cosL = Math.cos(lambda);
  const sinDec = sinB * Math.cos(epsilon) + cosB * Math.sin(epsilon) * sinL;
  const dec = Math.asin(sinDec);
  const y = sinL * Math.cos(epsilon) - (sinB / cosB) * Math.sin(epsilon);
  const x = cosL;
  let ra = Math.atan2(y, x);
  if (ra < 0) ra += 2 * Math.PI;
  return { ra, dec };
}

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

// Helper material and geometry builders for wide fading lines on the Mollweide map
function createWideLineMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      opacityFactor: { value: 1.0 }
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      attribute float side;
      varying float vSide;
      void main() {
        vSide = side;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float opacityFactor;
      varying float vSide;
      void main() {
        float alpha = 0.5 * (1.0 - abs(vSide)) * opacityFactor;
        if(alpha <= 0.0) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `
  });
}

// build thick polyline geometry that supports curves and fading
function buildWidePolylineGeometry(points, width) {
  if (points.length < 2) return new THREE.BufferGeometry();
  const half = width / 2;
  const positions = [];
  const sides = [];
  const indices = [];

  const offsets = [];
  const perp = (v) => new THREE.Vector2(-v.y, v.x);

  for (let i = 0; i < points.length; i++) {
    const pPrev = points[i - 1] || points[i];
    const pCurr = points[i];
    const pNext = points[i + 1] || points[i];
    const dirA = new THREE.Vector2(pCurr.x - pPrev.x, pCurr.y - pPrev.y).normalize();
    const dirB = new THREE.Vector2(pNext.x - pCurr.x, pNext.y - pCurr.y).normalize();
    const perpA = perp(dirA);
    const perpB = perp(dirB);
    let normal;
    if (i === 0) {
      normal = perpB;
    } else if (i === points.length - 1) {
      normal = perpA;
    } else {
      const miter = perpA.clone().add(perpB);
      if (miter.lengthSq() === 0) {
        normal = perpA;
      } else {
        const miterNorm = miter.normalize();
        const scale = 1 / miterNorm.dot(perpA);
        normal = miterNorm.multiplyScalar(scale);
      }
    }
    normal.normalize().multiplyScalar(half);
    offsets.push(normal);
  }

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const off = offsets[i];
    positions.push(p.x + off.x, p.y + off.y, p.z);
    sides.push(1);
    positions.push(p.x - off.x, p.y - off.y, p.z);
    sides.push(-1);
  }

  for (let i = 0; i < points.length - 1; i++) {
    const idx = i * 2;
    indices.push(idx, idx + 1, idx + 2);
    indices.push(idx + 1, idx + 3, idx + 2);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('side', new THREE.Float32BufferAttribute(sides, 1));
  geom.setIndex(indices);
  return geom;
}

// combine multiple polyline geometries
function mergeGeometries(geoms) {
  if (geoms.length === 1) return geoms[0];
  const positions = [];
  const sides = [];
  const indices = [];
  let offset = 0;
  geoms.forEach(g => {
    const pos = g.getAttribute('position').array;
    const sid = g.getAttribute('side').array;
    const idx = g.index.array;
    for (let i = 0; i < pos.length; i++) positions.push(pos[i]);
    for (let i = 0; i < sid.length; i++) sides.push(sid[i]);
    for (let i = 0; i < idx.length; i++) indices.push(idx[i] + offset);
    offset += g.getAttribute('position').count;
  });
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('side', new THREE.Float32BufferAttribute(sides, 1));
  geom.setIndex(indices);
  return geom;
}

function buildWideLineGeometry(points, width) {
  const geoms = [];
  let segment = [];
  points.forEach(p => {
    if (p === null) {
      if (segment.length > 1) geoms.push(buildWidePolylineGeometry(segment, width));
      segment = [];
    } else {
      segment.push(p);
    }
  });
  if (segment.length > 1) geoms.push(buildWidePolylineGeometry(segment, width));
  if (geoms.length === 0) return new THREE.BufferGeometry();
  return mergeGeometries(geoms);
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

export function createGalacticPlaneMollweide(segments = 180, opacity = 0.5, width = 40) {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), createWideLineMaterial(0xffffff));
  mesh.renderOrder = 1;
  mesh.material.uniforms.opacityFactor.value = opacity;
  mesh.userData.segments = segments;
  mesh.userData.width = width;
  updateGalacticPlaneMollweide(mesh);
  return mesh;
}

export function updateGalacticPlaneMollweide(line) {
  const segments = line.userData.segments || 180;
  const width = line.userData.width || 40;
  const lambda0 = getMollweideLambda0();
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const l = (i / segments) * 2 * Math.PI;
    const { ra, dec } = galacticToEquatorial(l, 0);
    pts.push(radToMollweide(ra, dec, 100, lambda0));
  }
  const points = [];
  let startNew = true;
  for (let i = 0; i < pts.length - 1; i++) {
    const splits = splitMollweideWrap(pts[i], pts[i + 1]);
    splits.forEach((pair, idx) => {
      if (startNew) {
        points.push(new THREE.Vector3(pair[0].x, pair[0].y, 0));
        startNew = false;
      }
      points.push(new THREE.Vector3(pair[1].x, pair[1].y, 0));
      if (idx < splits.length - 1) {
        points.push(null);
        startNew = true;
      }
    });
  }
  const geom = buildWideLineGeometry(points, width);
  line.geometry.dispose();
  line.geometry = geom;
}

export function createEclipticPlaneMollweide(segments = 180, opacity = 0.5, width = 40) {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), createWideLineMaterial(0xffff00));
  mesh.renderOrder = 1;
  mesh.material.uniforms.opacityFactor.value = opacity;
  mesh.userData.segments = segments;
  mesh.userData.width = width;
  updateEclipticPlaneMollweide(mesh);
  return mesh;
}

export function createCelestialEquatorMollweide(segments = 180, opacity = 0.5, width = 40) {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), createWideLineMaterial(0xff0000));
  mesh.renderOrder = 1;
  mesh.material.uniforms.opacityFactor.value = opacity;
  mesh.userData.segments = segments;
  mesh.userData.width = width;
  updateCelestialEquatorMollweide(mesh);
  return mesh;
}

export function updateEclipticPlaneMollweide(line) {
  const segments = line.userData.segments || 180;
  const width = line.userData.width || 40;
  const lambda0 = getMollweideLambda0();
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const lam = (i / segments) * 2 * Math.PI;
    const { ra, dec } = eclipticToEquatorial(lam, 0);
    pts.push(radToMollweide(ra, dec, 100, lambda0));
  }
  const points = [];
  let startNew = true;
  for (let i = 0; i < pts.length - 1; i++) {
    const splits = splitMollweideWrap(pts[i], pts[i + 1]);
    splits.forEach((pair, idx) => {
      if (startNew) {
        points.push(new THREE.Vector3(pair[0].x, pair[0].y, 0));
        startNew = false;
      }
      points.push(new THREE.Vector3(pair[1].x, pair[1].y, 0));
      if (idx < splits.length - 1) {
        points.push(null);
        startNew = true;
      }
    });
  }
  const geom = buildWideLineGeometry(points, width);
  line.geometry.dispose();
  line.geometry = geom;
}

export function updateCelestialEquatorMollweide(line) {
  const segments = line.userData.segments || 180;
  const width = line.userData.width || 40;
  const lambda0 = getMollweideLambda0();
  const pts = [];
  for (let i = 0; i <= segments; i++) {
    const ra = (i / segments) * 2 * Math.PI;
    pts.push(radToMollweide(ra, 0, 100, lambda0));
  }
  const points = [];
  let startNew = true;
  for (let i = 0; i < pts.length - 1; i++) {
    const splits = splitMollweideWrap(pts[i], pts[i + 1]);
    splits.forEach((pair, idx) => {
      if (startNew) {
        points.push(new THREE.Vector3(pair[0].x, pair[0].y, 0));
        startNew = false;
      }
      points.push(new THREE.Vector3(pair[1].x, pair[1].y, 0));
      if (idx < splits.length - 1) {
        points.push(null);
        startNew = true;
      }
    });
  }
  const geom = buildWideLineGeometry(points, width);
  line.geometry.dispose();
  line.geometry = geom;
}

function createTextSprite(text, color = '#ffffff', opacity = 0.8, fontSize = 150) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
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
  plane.renderOrder = 1;
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

// --- Plane Labels ---
function planeLabelData() {
  const galEq = galacticToEquatorial(0, 0);
  const eclEq = eclipticToEquatorial(0, 0);
  return {
    galactic: { ra: galEq.ra, dec: galEq.dec, text: 'Galactic Plane' },
    ecliptic: { ra: eclEq.ra, dec: eclEq.dec, text: 'Ecliptic Plane' },
    equator: { ra: 0, dec: 0, text: 'Celestial Equator' }
  };
}

export function createPlaneLabelTrue(type, R = 100, opacity = 0.8) {
  const data = planeLabelData()[type];
  const pos = radToSphere(data.ra, data.dec, R);
  const sprite = createTextSprite(data.text, '#ffffff', opacity, 450);
  sprite.position.copy(pos);
  return sprite;
}

export function createPlaneLabelGlobe(type, R = 102, opacity = 0.8) {
  const data = planeLabelData()[type];
  const pos = radToSphere(data.ra, data.dec, R);
  const mesh = createTextPlane(data.text, '#ffffff', opacity, 450);
  mesh.position.copy(pos);
  const normal = pos.clone().normalize();
  const globalUp = new THREE.Vector3(0, 1, 0);
  let desiredUp = globalUp.clone().sub(normal.clone().multiplyScalar(globalUp.dot(normal)));
  if (desiredUp.lengthSq() < 1e-6) desiredUp = new THREE.Vector3(0, 0, 1); else desiredUp.normalize();
  const desiredRight = new THREE.Vector3().crossVectors(desiredUp, normal).normalize();
  const matrix = new THREE.Matrix4().makeBasis(desiredRight, desiredUp, normal);
  mesh.setRotationFromMatrix(matrix);
  return mesh;
}

export function createPlaneLabelMollweide(type, R = 100, opacity = 0.8) {
  const lambda0 = getMollweideLambda0();
  const data = planeLabelData()[type];
  const p = radToMollweide(data.ra, data.dec, R, lambda0);
  const sprite = createTextSprite(data.text, '#ffffff', opacity, 450);
  sprite.position.set(p.x, p.y, 0);
  sprite.userData = { name: data.text, ra: data.ra, dec: data.dec };
  return sprite;
}

export function updatePlaneLabelMollweide(sprite, R = 100) {
  const lambda0 = getMollweideLambda0();
  if (!sprite.userData) return;
  const p = radToMollweide(sprite.userData.ra, sprite.userData.dec, R, lambda0);
  sprite.position.set(p.x, p.y, 0);
}
