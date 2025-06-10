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
    object.traverse(child => {
      if (!child.isMesh) return;
      const geometry = child.geometry;
      const position = geometry.getAttribute('position');
      const index = geometry.getIndex();
      const worldMatrix = child.matrixWorld;
      output += `o ${child.name || 'Mesh'}\n`;
      for (let i = 0; i < position.count; i++) {
        vertex.fromBufferAttribute(position, i).applyMatrix4(worldMatrix);
        output += `v ${vertex.x} ${vertex.y} ${vertex.z}\n`;
      }
      if (index) {
        for (let i = 0; i < index.count; i += 3) {
          const a = index.getX(i) + 1 + vertexOffset;
          const b = index.getX(i + 1) + 1 + vertexOffset;
          const c = index.getX(i + 2) + 1 + vertexOffset;
          output += `f ${a} ${b} ${c}\n`;
        }
      } else {
        for (let i = 0; i < position.count; i += 3) {
          const a = vertexOffset + i + 1;
          const b = vertexOffset + i + 2;
          const c = vertexOffset + i + 3;
          output += `f ${a} ${b} ${c}\n`;
        }
      }
      vertexOffset += position.count;
    });
    return output;
  }
}
