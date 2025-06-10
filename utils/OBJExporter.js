import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';

/**
 * Minimal OBJ exporter based on THREE.js examples.
 * Generates vertex positions and face indices for meshes in the scene.
 */
export class OBJExporter {
  parse(object, mtlName = 'export.mtl') {
    let output = `mtllib ${mtlName}\n`;
    let vertexOffset = 0;
    const vertex = new THREE.Vector3();
    const uvVec = new THREE.Vector2();
    const matrix = new THREE.Matrix4();
    object.traverse(child => {
      if (!child.isMesh && !child.isInstancedMesh && !child.isLine && !child.isLineSegments && !child.isLineLoop && !child.isSprite) return;
      const geometry = child.geometry;
      const position = geometry ? geometry.getAttribute('position') : null;
      const index = geometry ? geometry.getIndex() : null;
      const uvAttr = geometry ? geometry.getAttribute('uv') : null;
      const instanceCount = child.isInstancedMesh ? child.count : 1;
      for (let inst = 0; inst < instanceCount; inst++) {
        if (child.isInstancedMesh) {
          child.getMatrixAt(inst, matrix);
          matrix.multiplyMatrices(child.matrixWorld, matrix);
        } else {
          matrix.copy(child.matrixWorld);
        }
        output += `o ${child.name || 'Mesh'}_${inst}\nusemtl material0\n`;

        if (child.isSprite) {
          const hw = child.scale.x / 2;
          const hh = child.scale.y / 2;
          const verts = [
            new THREE.Vector3(-hw, -hh, 0),
            new THREE.Vector3(hw, -hh, 0),
            new THREE.Vector3(hw, hh, 0),
            new THREE.Vector3(-hw, hh, 0)
          ];
          verts.forEach(v => {
            v.applyMatrix4(matrix);
            output += `v ${v.x} ${v.y} ${v.z}\n`;
          });
          output += 'vt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\n';
          output += `f ${vertexOffset + 1}/${vertexOffset + 1} ${vertexOffset + 2}/${vertexOffset + 2} ${vertexOffset + 3}/${vertexOffset + 3}\n`;
          output += `f ${vertexOffset + 1}/${vertexOffset + 1} ${vertexOffset + 3}/${vertexOffset + 3} ${vertexOffset + 4}/${vertexOffset + 4}\n`;
          vertexOffset += 4;
          continue;
        }

        for (let i = 0; i < position.count; i++) {
          vertex.fromBufferAttribute(position, i).applyMatrix4(matrix);
          output += `v ${vertex.x} ${vertex.y} ${vertex.z}\n`;
          if (uvAttr) {
            uvVec.fromBufferAttribute(uvAttr, i);
            output += `vt ${uvVec.x} ${uvVec.y}\n`;
          }
        }
        if (child.isLine || child.isLineSegments || child.isLineLoop) {
          const verts = [];
          if (index) {
            for (let i = 0; i < index.count; i++) {
              verts.push(index.getX(i) + 1 + vertexOffset);
            }
          } else {
            for (let i = 0; i < position.count; i++) {
              verts.push(vertexOffset + i + 1);
            }
          }
          output += 'l ' + verts.join(' ') + '\n';
        } else {
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
        }
        vertexOffset += position.count;
      }
    });
    return output;
  }
}
