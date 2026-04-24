/**
 * @file STL exporter for the True Coordinates 3D map.
 *
 * Generates a binary STL file containing:
 *  – each plotted star as a sphere (radius derived from displaySize × 0.2,
 *    matching the InstancedMesh scale used in mapManager)
 *  – each active connection line as a cylindrical tube connecting the centres
 *    of the two endpoint spheres, with uniform thickness.
 *
 * The coordinate system matches the True Coordinates map (right‑handed,
 * units = light-years).
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Sphere tessellation (segments around latitude / longitude). */
const SPHERE_SEGMENTS = 16;

/** Number of radial segments for connection tubes. */
const TUBE_RADIAL_SEGMENTS = 8;

/** Uniform tube radius (in the same coordinate space as star positions). */
const TUBE_RADIUS = 0.06;

/** Matches the scale factor applied in mapManager.updateStarPositions. */
const STAR_SCALE_FACTOR = 0.2;

// ---------------------------------------------------------------------------
// Low‑level geometry helpers
// ---------------------------------------------------------------------------

/**
 * Generate triangles for a UV sphere centred at `centre` with the given
 * `radius`. Returns an array of triangle objects {a, b, c} where each vertex
 * is [x, y, z].
 */
function buildSphereTriangles(centre, radius, widthSegs = SPHERE_SEGMENTS, heightSegs = SPHERE_SEGMENTS) {
  const triangles = [];
  const cx = centre.x, cy = centre.y, cz = centre.z;

  for (let iy = 0; iy < heightSegs; iy++) {
    const phi1 = (iy / heightSegs) * Math.PI;
    const phi2 = ((iy + 1) / heightSegs) * Math.PI;
    const sinP1 = Math.sin(phi1), cosP1 = Math.cos(phi1);
    const sinP2 = Math.sin(phi2), cosP2 = Math.cos(phi2);

    for (let ix = 0; ix < widthSegs; ix++) {
      const theta1 = (ix / widthSegs) * 2 * Math.PI;
      const theta2 = ((ix + 1) / widthSegs) * 2 * Math.PI;
      const sinT1 = Math.sin(theta1), cosT1 = Math.cos(theta1);
      const sinT2 = Math.sin(theta2), cosT2 = Math.cos(theta2);

      // Four corners of this quad on the sphere
      const p00 = [cx + radius * sinP1 * cosT1, cy + radius * cosP1, cz + radius * sinP1 * sinT1];
      const p10 = [cx + radius * sinP1 * cosT2, cy + radius * cosP1, cz + radius * sinP1 * sinT2];
      const p01 = [cx + radius * sinP2 * cosT1, cy + radius * cosP2, cz + radius * sinP2 * sinT1];
      const p11 = [cx + radius * sinP2 * cosT2, cy + radius * cosP2, cz + radius * sinP2 * sinT2];

      // Top cap row: single triangle (degenerate quad top edge)
      if (iy === 0) {
        triangles.push({ a: p00, b: p11, c: p01 });
      }
      // Bottom cap row: single triangle
      else if (iy === heightSegs - 1) {
        triangles.push({ a: p00, b: p10, c: p11 });
      }
      // Middle rows: two triangles per quad
      else {
        triangles.push({ a: p00, b: p10, c: p11 });
        triangles.push({ a: p00, b: p11, c: p01 });
      }
    }
  }

  return triangles;
}

/**
 * Generate triangles for a cylinder (tube) between two 3D points.
 * The tube has uniform `radius` and `radialSegs` segments around its axis.
 */
function buildTubeTriangles(startPos, endPos, radius = TUBE_RADIUS, radialSegs = TUBE_RADIAL_SEGMENTS) {
  const triangles = [];

  // Build a local coordinate frame along the tube axis
  const dx = endPos.x - startPos.x;
  const dy = endPos.y - startPos.y;
  const dz = endPos.z - startPos.z;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (length < 1e-10) return triangles;

  // Normalised axis
  const ax = dx / length, ay = dy / length, az = dz / length;

  // Choose a vector not parallel to the axis to derive a perpendicular
  let refX = 0, refY = 1, refZ = 0;
  if (Math.abs(ay) > 0.9) {
    refX = 1; refY = 0; refZ = 0;
  }

  // Cross product: perp = axis × ref
  let px = ay * refZ - az * refY;
  let py = az * refX - ax * refZ;
  let pz = ax * refY - ay * refX;
  let pl = Math.sqrt(px * px + py * py + pz * pz);
  px /= pl; py /= pl; pz /= pl;

  // Second perpendicular: perp2 = axis × perp
  let qx = ay * pz - az * py;
  let qy = az * px - ax * pz;
  let qz = ax * py - ay * px;

  // Build rings at start and end
  const startRing = [];
  const endRing = [];
  for (let i = 0; i < radialSegs; i++) {
    const angle = (i / radialSegs) * 2 * Math.PI;
    const cosA = Math.cos(angle) * radius;
    const sinA = Math.sin(angle) * radius;

    startRing.push([
      startPos.x + px * cosA + qx * sinA,
      startPos.y + py * cosA + qy * sinA,
      startPos.z + pz * cosA + qz * sinA
    ]);
    endRing.push([
      endPos.x + px * cosA + qx * sinA,
      endPos.y + py * cosA + qy * sinA,
      endPos.z + pz * cosA + qz * sinA
    ]);
  }

  // Side quads → triangles
  for (let i = 0; i < radialSegs; i++) {
    const next = (i + 1) % radialSegs;
    const s0 = startRing[i], s1 = startRing[next];
    const e0 = endRing[i],   e1 = endRing[next];

    triangles.push({ a: s0, b: s1, c: e1 });
    triangles.push({ a: s0, b: e1, c: e0 });
  }

  // End caps
  const sc = [startPos.x, startPos.y, startPos.z];
  const ec = [endPos.x, endPos.y, endPos.z];
  for (let i = 0; i < radialSegs; i++) {
    const next = (i + 1) % radialSegs;
    // Start cap (winding reversed so normal points outward)
    triangles.push({ a: sc, b: startRing[next], c: startRing[i] });
    // End cap
    triangles.push({ a: ec, b: endRing[i], c: endRing[next] });
  }

  return triangles;
}

// ---------------------------------------------------------------------------
// Normal computation
// ---------------------------------------------------------------------------

function computeNormal(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const nx = u[1] * v[2] - u[2] * v[1];
  const ny = u[2] * v[0] - u[0] * v[2];
  const nz = u[0] * v[1] - u[1] * v[0];
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
  return [nx / len, ny / len, nz / len];
}

// ---------------------------------------------------------------------------
// Binary STL writer
// ---------------------------------------------------------------------------

/**
 * Encode an array of triangles into a binary STL ArrayBuffer.
 *
 * Binary STL layout:
 *   80 bytes  – header (arbitrary text)
 *   4 bytes   – uint32 triangle count
 *   per triangle (50 bytes each):
 *       12 bytes – normal  (3 × float32)
 *       12 bytes – vertex1 (3 × float32)
 *       12 bytes – vertex2 (3 × float32)
 *       12 bytes – vertex3 (3 × float32)
 *        2 bytes – attribute byte count (0)
 */
function trianglesToBinarySTL(triangles) {
  const triCount = triangles.length;
  const bufferSize = 80 + 4 + triCount * 50;
  const buffer = new ArrayBuffer(bufferSize);
  const view = new DataView(buffer);

  // Header (80 bytes) – fill with a simple text string
  const header = 'Astrography – True Coordinates STL Export';
  for (let i = 0; i < 80; i++) {
    view.setUint8(i, i < header.length ? header.charCodeAt(i) : 0);
  }

  // Triangle count
  view.setUint32(80, triCount, true);

  let offset = 84;
  for (let t = 0; t < triCount; t++) {
    const { a, b, c } = triangles[t];
    const n = computeNormal(a, b, c);

    // Normal
    view.setFloat32(offset, n[0], true); offset += 4;
    view.setFloat32(offset, n[1], true); offset += 4;
    view.setFloat32(offset, n[2], true); offset += 4;
    // Vertex 1
    view.setFloat32(offset, a[0], true); offset += 4;
    view.setFloat32(offset, a[1], true); offset += 4;
    view.setFloat32(offset, a[2], true); offset += 4;
    // Vertex 2
    view.setFloat32(offset, b[0], true); offset += 4;
    view.setFloat32(offset, b[1], true); offset += 4;
    view.setFloat32(offset, b[2], true); offset += 4;
    // Vertex 3
    view.setFloat32(offset, c[0], true); offset += 4;
    view.setFloat32(offset, c[1], true); offset += 4;
    view.setFloat32(offset, c[2], true); offset += 4;
    // Attribute byte count
    view.setUint16(offset, 0, true); offset += 2;
  }

  return buffer;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Export the current True Coordinates scene as a binary .stl file.
 *
 * @param {Array}  stars        – The currently filtered/displayed star array.
 *                                Each star must have a `truePosition`
 *                                (THREE.Vector3) and `displaySize` (number).
 * @param {Array}  connections  – The current connection pairs array (may be
 *                                empty). Each entry: { starA, starB }.
 */
export function exportTrueCoordinatesSTL(stars, connections) {
  if (!stars || stars.length === 0) {
    console.warn('STL export: no stars to export.');
    return;
  }

  const allTriangles = [];

  // ── Stars → spheres ──────────────────────────────────────────────────
  for (let i = 0; i < stars.length; i++) {
    const star = stars[i];
    const pos = star.truePosition;
    if (!pos) continue;

    const size = star.displaySize !== undefined ? star.displaySize : 1;
    const radius = size * STAR_SCALE_FACTOR;

    const tris = buildSphereTriangles(pos, radius);
    for (let t = 0; t < tris.length; t++) {
      allTriangles.push(tris[t]);
    }
  }

  // ── Connections → tubes ──────────────────────────────────────────────
  if (Array.isArray(connections)) {
    for (let i = 0; i < connections.length; i++) {
      const { starA, starB } = connections[i];
      const posA = starA?.truePosition;
      const posB = starB?.truePosition;
      if (!posA || !posB) continue;

      const tris = buildTubeTriangles(posA, posB);
      for (let t = 0; t < tris.length; t++) {
        allTriangles.push(tris[t]);
      }
    }
  }

  // ── Encode & download ────────────────────────────────────────────────
  const stlBuffer = trianglesToBinarySTL(allTriangles);
  const blob = new Blob([stlBuffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = 'true_coordinates_stars.stl';
  link.click();

  URL.revokeObjectURL(url);

  console.log(
    `STL export complete – ${stars.length} stars, ` +
    `${connections?.length || 0} connections, ` +
    `${allTriangles.length} triangles.`
  );
}
