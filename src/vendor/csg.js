/**
 * @file Minimal BSP-tree Constructive Solid Geometry (CSG) library.
 *
 * Implements the subtract operation needed to bore cylindrical holes through
 * spheres for 3D-printable star-map kits.
 *
 * Based on the algorithm by Evan Wallace (MIT licence):
 *   https://evanw.github.io/csg.js/
 *
 * All geometry is represented as arrays of convex polygons.  A BSP tree is
 * used to split polygons by planes so that boolean operations can keep or
 * discard fragments that lie inside / outside a solid.
 */

// ---------------------------------------------------------------------------
// Vertex
// ---------------------------------------------------------------------------

class Vertex {
  constructor(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  clone() {
    return new Vertex(this.x, this.y, this.z);
  }

  flip() {
    // Vertices don't carry normals in this minimal implementation.
  }

  interpolate(other, t) {
    return new Vertex(
      this.x + (other.x - this.x) * t,
      this.y + (other.y - this.y) * t,
      this.z + (other.z - this.z) * t
    );
  }
}

// ---------------------------------------------------------------------------
// Plane
// ---------------------------------------------------------------------------

const EPSILON = 1e-5;
const COPLANAR = 0;
const FRONT = 1;
const BACK = 2;
const SPANNING = 3;

class Plane {
  constructor(normal, w) {
    this.normal = normal;
    this.w = w;
  }

  clone() {
    return new Plane({ x: this.normal.x, y: this.normal.y, z: this.normal.z }, this.w);
  }

  flip() {
    this.normal.x = -this.normal.x;
    this.normal.y = -this.normal.y;
    this.normal.z = -this.normal.z;
    this.w = -this.w;
  }

  /**
   * Split `polygon` by this plane.  Pushes fragments into the four provided
   * arrays depending on which side they fall on.
   */
  splitPolygon(polygon, coplanarFront, coplanarBack, front, back) {
    let polygonType = 0;
    const types = [];
    const n = this.normal;

    for (let i = 0; i < polygon.vertices.length; i++) {
      const v = polygon.vertices[i];
      const t = n.x * v.x + n.y * v.y + n.z * v.z - this.w;
      const type = t < -EPSILON ? BACK : t > EPSILON ? FRONT : COPLANAR;
      polygonType |= type;
      types.push(type);
    }

    switch (polygonType) {
      case COPLANAR: {
        const dot = n.x * polygon.plane.normal.x + n.y * polygon.plane.normal.y + n.z * polygon.plane.normal.z;
        (dot > 0 ? coplanarFront : coplanarBack).push(polygon);
        break;
      }
      case FRONT:
        front.push(polygon);
        break;
      case BACK:
        back.push(polygon);
        break;
      case SPANNING: {
        const f = [];
        const b = [];
        for (let i = 0; i < polygon.vertices.length; i++) {
          const j = (i + 1) % polygon.vertices.length;
          const ti = types[i];
          const tj = types[j];
          const vi = polygon.vertices[i];
          const vj = polygon.vertices[j];

          if (ti !== BACK) f.push(vi);
          if (ti !== FRONT) b.push(vi);

          if ((ti | tj) === SPANNING) {
            const denom = n.x * (vj.x - vi.x) + n.y * (vj.y - vi.y) + n.z * (vj.z - vi.z);
            const t = denom !== 0 ? (this.w - (n.x * vi.x + n.y * vi.y + n.z * vi.z)) / denom : 0;
            const v = vi.interpolate(vj, t);
            f.push(v);
            b.push(v.clone());
          }
        }
        if (f.length >= 3) front.push(new Polygon(f));
        if (b.length >= 3) back.push(new Polygon(b));
        break;
      }
    }
  }

  static fromPoints(a, b, c) {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len < 1e-12) {
      // Degenerate polygon — return a placeholder plane.
      return new Plane({ x: 0, y: 0, z: 1 }, 0);
    }
    nx /= len; ny /= len; nz /= len;
    return new Plane({ x: nx, y: ny, z: nz }, nx * a.x + ny * a.y + nz * a.z);
  }
}

// ---------------------------------------------------------------------------
// Polygon (convex, ≥3 vertices)
// ---------------------------------------------------------------------------

class Polygon {
  constructor(vertices) {
    this.vertices = vertices;
    this.plane = Plane.fromPoints(vertices[0], vertices[1], vertices[2]);
  }

  clone() {
    return new Polygon(this.vertices.map(v => v.clone()));
  }

  flip() {
    this.vertices.reverse();
    this.plane.flip();
  }
}

// ---------------------------------------------------------------------------
// BSP Node
// ---------------------------------------------------------------------------

class Node {
  constructor(polygons) {
    this.plane = null;
    this.front = null;
    this.back = null;
    this.polygons = [];
    if (polygons && polygons.length) this.build(polygons);
  }

  clone() {
    const node = new Node();
    node.plane = this.plane ? this.plane.clone() : null;
    node.front = this.front ? this.front.clone() : null;
    node.back = this.back ? this.back.clone() : null;
    node.polygons = this.polygons.map(p => p.clone());
    return node;
  }

  /** Flip every polygon and swap front/back trees. */
  invert() {
    for (let i = 0; i < this.polygons.length; i++) this.polygons[i].flip();
    if (this.plane) this.plane.flip();
    if (this.front) this.front.invert();
    if (this.back) this.back.invert();
    const tmp = this.front;
    this.front = this.back;
    this.back = tmp;
  }

  /** Remove polygons that are inside `bsp`. */
  clipPolygons(polygons) {
    if (!this.plane) return polygons.slice();
    let front = [];
    let back = [];
    for (let i = 0; i < polygons.length; i++) {
      this.plane.splitPolygon(polygons[i], front, back, front, back);
    }
    if (this.front) front = this.front.clipPolygons(front);
    back = this.back ? this.back.clipPolygons(back) : [];
    return front.concat(back);
  }

  /** Remove polygons in this tree that are inside `bsp`. */
  clipTo(bsp) {
    this.polygons = bsp.clipPolygons(this.polygons);
    if (this.front) this.front.clipTo(bsp);
    if (this.back) this.back.clipTo(bsp);
  }

  /** Collect all polygons from this tree. */
  allPolygons() {
    let polys = this.polygons.slice();
    if (this.front) polys = polys.concat(this.front.allPolygons());
    if (this.back) polys = polys.concat(this.back.allPolygons());
    return polys;
  }

  /** Insert new polygons into this tree. */
  build(polygons) {
    if (!polygons.length) return;
    if (!this.plane) this.plane = polygons[0].plane.clone();
    const front = [];
    const back = [];
    for (let i = 0; i < polygons.length; i++) {
      this.plane.splitPolygon(polygons[i], this.polygons, this.polygons, front, back);
    }
    if (front.length) {
      if (!this.front) this.front = new Node();
      this.front.build(front);
    }
    if (back.length) {
      if (!this.back) this.back = new Node();
      this.back.build(back);
    }
  }
}

// ---------------------------------------------------------------------------
// CSG solid — public API
// ---------------------------------------------------------------------------

export class CSG {
  constructor() {
    this.polygons = [];
  }

  clone() {
    const csg = new CSG();
    csg.polygons = this.polygons.map(p => p.clone());
    return csg;
  }

  /**
   * Return a new CSG solid representing this solid with `csg` removed.
   *   A.subtract(B) = A ∖ B
   */
  subtract(csg) {
    const a = new Node(this.polygons);
    const b = new Node(csg.polygons);
    a.invert();
    a.clipTo(b);
    b.clipTo(a);
    b.invert();
    b.clipTo(a);
    b.invert();
    a.build(b.allPolygons());
    a.invert();
    const result = new CSG();
    result.polygons = a.allPolygons();
    return result;
  }

  /** Build a CSG from an array of Polygon instances. */
  static fromPolygons(polygons) {
    const csg = new CSG();
    csg.polygons = polygons;
    return csg;
  }

  // -----------------------------------------------------------------------
  // Conversion helpers — arrays of {a, b, c} triangle objects
  // -----------------------------------------------------------------------

  /**
   * Create a CSG from an array of triangle objects {a, b, c} where each
   * vertex is [x, y, z].
   */
  static fromTriangles(triangles) {
    const polygons = [];
    for (let i = 0; i < triangles.length; i++) {
      const { a, b, c } = triangles[i];
      const va = new Vertex(a[0], a[1], a[2]);
      const vb = new Vertex(b[0], b[1], b[2]);
      const vc = new Vertex(c[0], c[1], c[2]);
      polygons.push(new Polygon([va, vb, vc]));
    }
    return CSG.fromPolygons(polygons);
  }

  /**
   * Extract an array of {a, b, c} triangle objects from this CSG.
   * Polygons with more than 3 vertices are fan-tessellated.
   */
  toTriangles() {
    const triangles = [];
    for (let i = 0; i < this.polygons.length; i++) {
      const verts = this.polygons[i].vertices;
      if (verts.length < 3) continue;
      const a = [verts[0].x, verts[0].y, verts[0].z];
      for (let j = 1; j < verts.length - 1; j++) {
        const b = [verts[j].x, verts[j].y, verts[j].z];
        const c = [verts[j + 1].x, verts[j + 1].y, verts[j + 1].z];
        triangles.push({ a, b, c });
      }
    }
    return triangles;
  }
}
