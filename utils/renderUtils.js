import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';

export function createWideLineMaterial(color, { fadePower = 1.0, opacityFactor = 1.0 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      color: { value: new THREE.Color(color) },
      opacityFactor: { value: opacityFactor },
      fadePower: { value: fadePower }
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      attribute float side;
      attribute float along;
      varying float vSide;
      varying float vAlong;
      void main() {
        vSide = side;
        vAlong = along;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float opacityFactor;
      uniform float fadePower;
      varying float vSide;
      varying float vAlong;
      void main() {
        float dist = length(vec2(vSide, vAlong));
        float alpha = pow(max(0.0, 1.0 - dist), fadePower) * opacityFactor;
        if (alpha <= 0.0) discard;
        gl_FragColor = vec4(color, alpha);
      }
    `
  });
}

export function buildWideLineGeometry(points, width) {
  const vertices = [];
  const sides = [];
  const along = [];
  const safeWidth = Math.max(0.0001, width);
  for (let i = 0; i < points.length; i += 2) {
    const p1 = points[i];
    const p2 = points[i + 1];
    if (!p1 || !p2) continue;
    const dir = new THREE.Vector2(p2.x - p1.x, p2.y - p1.y);
    if (dir.lengthSq() === 0) continue;
    dir.normalize();
    const perp = new THREE.Vector2(-dir.y, dir.x).multiplyScalar(safeWidth / 2);
    const a1 = new THREE.Vector3(p1.x + perp.x, p1.y + perp.y, p1.z);
    const a2 = new THREE.Vector3(p1.x - perp.x, p1.y - perp.y, p1.z);
    const b1 = new THREE.Vector3(p2.x + perp.x, p2.y + perp.y, p2.z);
    const b2 = new THREE.Vector3(p2.x - perp.x, p2.y - perp.y, p2.z);

    vertices.push(a1.x, a1.y, a1.z, a2.x, a2.y, a2.z, b2.x, b2.y, b2.z);
    sides.push(1, -1, -1);
    along.push(-1, -1, 1);
    vertices.push(a1.x, a1.y, a1.z, b2.x, b2.y, b2.z, b1.x, b1.y, b1.z);
    sides.push(1, -1, 1);
    along.push(-1, 1, 1);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geom.setAttribute('side', new THREE.Float32BufferAttribute(sides, 1));
  geom.setAttribute('along', new THREE.Float32BufferAttribute(along, 1));
  return geom;
}

export function disposeMaterial(material) {
  if (!material) return;
  if (Array.isArray(material)) {
    material.forEach(disposeMaterial);
    return;
  }
  for (const value of Object.values(material)) {
    if (value && typeof value === 'object' && typeof value.dispose === 'function' && value !== material) {
      value.dispose();
    }
  }
  if (material.uniforms) {
    Object.values(material.uniforms).forEach(uniform => {
      const value = uniform?.value;
      if (value && typeof value.dispose === 'function') value.dispose();
    });
  }
  material.dispose?.();
}

export function disposeObject3D(obj) {
  if (!obj) return;
  obj.traverse?.(child => {
    child.geometry?.dispose?.();
    disposeMaterial(child.material);
  });
}

export function stableAngleFromString(value) {
  const str = String(value ?? '');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return ((hash >>> 0) / 0xFFFFFFFF) * Math.PI * 2;
}
