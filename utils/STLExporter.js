import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';

// Minimal STL exporter adapted from Three.js examples
export class STLExporter {
  parse(scene) {
    let output = 'solid exported\n';
    const vector = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    const normal = new THREE.Vector3();

    function addTriangle(a, b, c) {
      const cb = new THREE.Vector3();
      const ab = new THREE.Vector3();
      cb.subVectors(c, b);
      ab.subVectors(a, b);
      cb.cross(ab).normalize();
      output += `facet normal ${cb.x} ${cb.y} ${cb.z}\n`;
      output += 'outer loop\n';
      output += `vertex ${a.x} ${a.y} ${a.z}\n`;
      output += `vertex ${b.x} ${b.y} ${b.z}\n`;
      output += `vertex ${c.x} ${c.y} ${c.z}\n`;
      output += 'endloop\nendfacet\n';
    }

    scene.traverse(child => {
      if (!child.isMesh && !child.isInstancedMesh) return;
      const geometry = child.geometry;
      if (!geometry) return;
      const index = geometry.getIndex();
      const position = geometry.getAttribute('position');
      const instanceCount = child.isInstancedMesh ? child.count : 1;
      for (let inst = 0; inst < instanceCount; inst++) {
        if (child.isInstancedMesh) {
          child.getMatrixAt(inst, matrix);
          matrix.multiplyMatrices(child.matrixWorld, matrix);
        } else {
          matrix.copy(child.matrixWorld);
        }
        for (let i = 0; i < position.count; i += 3) {
          const a = index ? index.getX(i) : i;
          const b = index ? index.getX(i + 1) : i + 1;
          const c = index ? index.getX(i + 2) : i + 2;
          const vA = vector.fromBufferAttribute(position, a).applyMatrix4(matrix).clone();
          const vB = vector.fromBufferAttribute(position, b).applyMatrix4(matrix).clone();
          const vC = vector.fromBufferAttribute(position, c).applyMatrix4(matrix).clone();
          addTriangle(vA, vB, vC);
        }
      }
    });

    output += 'endsolid exported';
    return output;
  }
}
