function getDataView(bufferLike) {
  if (bufferLike instanceof ArrayBuffer) {
    return new DataView(bufferLike);
  }
  if (ArrayBuffer.isView(bufferLike)) {
    return new DataView(bufferLike.buffer, bufferLike.byteOffset, bufferLike.byteLength);
  }
  throw new Error('STL validation requires an ArrayBuffer or typed array.');
}

function readVertex(view, offset) {
  return [
    view.getFloat32(offset, true),
    view.getFloat32(offset + 4, true),
    view.getFloat32(offset + 8, true)
  ];
}

function assertFiniteVector(vector, label) {
  if (!vector.every(Number.isFinite)) {
    throw new Error(`STL validation failed: ${label} contains non-finite values.`);
  }
}

function triangleArea(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  return Math.sqrt(nx * nx + ny * ny + nz * nz) / 2;
}

function expandBounds(bounds, vertex) {
  bounds.minX = Math.min(bounds.minX, vertex[0]);
  bounds.minY = Math.min(bounds.minY, vertex[1]);
  bounds.minZ = Math.min(bounds.minZ, vertex[2]);
  bounds.maxX = Math.max(bounds.maxX, vertex[0]);
  bounds.maxY = Math.max(bounds.maxY, vertex[1]);
  bounds.maxZ = Math.max(bounds.maxZ, vertex[2]);
}

export function validateBinarySTL(bufferLike, { allowEmpty = false } = {}) {
  const view = getDataView(bufferLike);
  if (view.byteLength < 84) {
    throw new Error('STL validation failed: binary STL is shorter than its header.');
  }

  const triangleCount = view.getUint32(80, true);
  const expectedLength = 84 + triangleCount * 50;
  if (view.byteLength !== expectedLength) {
    throw new Error(`STL validation failed: expected ${expectedLength} bytes for ${triangleCount} triangles, got ${view.byteLength}.`);
  }
  if (!allowEmpty && triangleCount === 0) {
    throw new Error('STL validation failed: mesh contains no triangles.');
  }

  const bounds = {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity
  };
  let nonZeroAreaTriangles = 0;

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const offset = 84 + triangle * 50;
    const normal = readVertex(view, offset);
    const a = readVertex(view, offset + 12);
    const b = readVertex(view, offset + 24);
    const c = readVertex(view, offset + 36);
    assertFiniteVector(normal, `triangle ${triangle} normal`);
    assertFiniteVector(a, `triangle ${triangle} vertex A`);
    assertFiniteVector(b, `triangle ${triangle} vertex B`);
    assertFiniteVector(c, `triangle ${triangle} vertex C`);
    [a, b, c].forEach(vertex => expandBounds(bounds, vertex));
    if (triangleArea(a, b, c) > 1e-8) {
      nonZeroAreaTriangles += 1;
    }
  }

  if (!allowEmpty && nonZeroAreaTriangles === 0) {
    throw new Error('STL validation failed: mesh contains only degenerate triangles.');
  }

  return {
    triangleCount,
    nonZeroAreaTriangles,
    bounds
  };
}
