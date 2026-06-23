import * as THREE from '../../vendor/three.js';

const _matrix = new THREE.Matrix4();
const _fallbackQuaternion = new THREE.Quaternion();
const _fallbackScale = new THREE.Vector3(1, 1, 1);
const _fallbackColor = new THREE.Color(0xffffff);

export function createCellVisualState(position, color = 0xffffff, opacity = 0) {
  const state = {
    position: position?.clone ? position.clone() : new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(1, 1, 1),
    visible: false,
    material: {
      color: new THREE.Color(color),
      opacity
    },
    setRotationFromMatrix(matrix) {
      this.quaternion.setFromRotationMatrix(matrix);
    }
  };
  return state;
}

export function createInstancedCellMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute vec3 instanceColor;
      attribute float instanceOpacity;
      varying vec4 vInstanceColor;

      void main() {
        vInstanceColor = vec4(instanceColor, instanceOpacity);
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec4 vInstanceColor;

      void main() {
        if (vInstanceColor.a <= 0.001) discard;
        gl_FragColor = vInstanceColor;
      }
    `
  });
}

export class InstancedCellLayer {
  constructor({ geometry, count, renderOrder = 2, side = THREE.FrontSide }) {
    this.geometry = geometry;
    this.material = createInstancedCellMaterial();
    this.material.side = side;
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, Math.max(0, count));
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;

    this.colorAttribute = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(0, count) * 3), 3);
    this.opacityAttribute = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(0, count)), 1);
    this.mesh.geometry.setAttribute('instanceColor', this.colorAttribute);
    this.mesh.geometry.setAttribute('instanceOpacity', this.opacityAttribute);
  }

  update(cells, selectVisual) {
    let instanceIndex = 0;
    const safeCells = Array.isArray(cells) ? cells : [];

    for (let index = 0; index < safeCells.length; index += 1) {
      const cell = safeCells[index];
      const visual = selectVisual(cell);
      if (!cell?.active || !visual?.visible) continue;

      const color = visual.material?.color ?? _fallbackColor;
      const opacity = Number.isFinite(visual.material?.opacity) ? visual.material.opacity : 1;
      const scale = visual.scale ?? _fallbackScale;
      const quaternion = visual.quaternion ?? _fallbackQuaternion;

      _matrix.compose(visual.position, quaternion, scale);
      this.mesh.setMatrixAt(instanceIndex, _matrix);
      this.colorAttribute.setXYZ(instanceIndex, color.r, color.g, color.b);
      this.opacityAttribute.setX(instanceIndex, opacity);
      instanceIndex += 1;
    }

    this.mesh.count = instanceIndex;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.colorAttribute.needsUpdate = true;
    this.opacityAttribute.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry?.dispose?.();
    this.mesh.material?.dispose?.();
  }
}
