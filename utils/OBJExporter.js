import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';

/**
 * Minimal OBJ exporter based on THREE.js examples.
 * Generates vertex positions and face indices for meshes in the scene.
 */
export class OBJExporter {
  parse(object) {
    let output = '';
    let vertexOffset = 0;
    const vertex = new THREE.Vector3();
    const uvVec = new THREE.Vector2();
    const matrix = new THREE.Matrix4();
    object.traverse(child => {
      if (!child.isMesh && !child.isInstancedMesh) return;
      const geometry = child.geometry;
      const position = geometry.getAttribute('position');
      const index = geometry.getIndex();
      const uvAttr = geometry.getAttribute('uv');
      const instanceCount = child.isInstancedMesh ? child.count : 1;
      for (let inst = 0; inst < instanceCount; inst++) {
        if (child.isInstancedMesh) {
          child.getMatrixAt(inst, matrix);
          matrix.multiplyMatrices(child.matrixWorld, matrix);
        } else {
          matrix.copy(child.matrixWorld);
        }
        output += `o ${child.name || 'Mesh'}_${inst}\n`;
        for (let i = 0; i < position.count; i++) {
          vertex.fromBufferAttribute(position, i).applyMatrix4(matrix);
          output += `v ${vertex.x} ${vertex.y} ${vertex.z}\n`;
          if (uvAttr) {
            uvVec.fromBufferAttribute(uvAttr, i);
            output += `vt ${uvVec.x} ${uvVec.y}\n`;
          }
        }
        if (index) {
          for (let i = 0; i < index.count; i += 3) {
            const a = index.getX(i) + 1 + vertexOffset;
            const b = index.getX(i + 1) + 1 + vertexOffset;
            const c = index.getX(i + 2) + 1 + vertexOffset;
            if (uvAttr) {
              output += `f ${a}/${a} ${b}/${b} ${c}/${c}\n`;
            } else {
              output += `f ${a} ${b} ${c}\n`;
            }
          }
        } else {
          for (let i = 0; i < position.count; i += 3) {
            const a = vertexOffset + i + 1;
            const b = vertexOffset + i + 2;
            const c = vertexOffset + i + 3;
            if (uvAttr) {
              output += `f ${a}/${a} ${b}/${b} ${c}/${c}\n`;
            } else {
              output += `f ${a} ${b} ${c}\n`;
            }
          }
        }
        vertexOffset += position.count;
      }
    });
    return output;
  }
}
