// File: /filters/ConcaveGeometry.js
import {
	BufferGeometry,
	Float32BufferAttribute,
	Vector3
} from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';

/**
 * ConcaveGeometry builds a 3D convex hull (or alpha shape) from a set of points
 * using an incremental convex hull algorithm.
 *
 * Complexity: O(n log n) average, O(n^2) worst case — suitable for the small-to-medium
 * point sets (10-50 points) used for cloud shapes.
 *
 * When alpha is finite, faces whose circumradius exceeds alpha are removed,
 * producing an alpha-shape approximation.
 */
class ConcaveGeometry extends BufferGeometry {

	constructor(points, alpha) {
		super();

		if (!points || points.length < 3) {
			console.error("ConcaveGeometry: Need at least three points.");
			return;
		}

		// --- Degenerate case: fewer than 4 points => single triangle -----------
		if (points.length === 3) {
			const verts = [];
			points.forEach(p => verts.push(p.x, p.y, p.z));
			this.setAttribute('position', new Float32BufferAttribute(verts, 3));
			this.setIndex([0, 1, 2]);
			this.computeVertexNormals();
			return;
		}

		// --- Build incremental convex hull ------------------------------------
		const faces = buildConvexHull(points);

		if (faces.length === 0) {
			// All points are coplanar — fall back to a flat triangulation.
			const flatFaces = triangulatCoplanar(points);
			const verts = [];
			flatFaces.forEach(f => {
				f.forEach(idx => {
					const p = points[idx];
					verts.push(p.x, p.y, p.z);
				});
			});
			this.setAttribute('position', new Float32BufferAttribute(verts, 3));
			const idx = [];
			for (let i = 0; i < verts.length / 3; i += 3) idx.push(i, i + 1, i + 2);
			this.setIndex(idx);
			this.computeVertexNormals();
			return;
		}

		// --- Optional alpha filtering -----------------------------------------
		let filteredFaces = faces;
		if (alpha !== undefined && alpha !== null && isFinite(alpha)) {
			filteredFaces = faces.filter(f => {
				const a = points[f[0]], b = points[f[1]], c = points[f[2]];
				const r = triangleCircumradius(a, b, c);
				return r <= alpha;
			});
			if (filteredFaces.length === 0) filteredFaces = faces; // fallback
		}

		// --- Build BufferGeometry from faces -----------------------------------
		const vertices = [];
		filteredFaces.forEach(face => {
			face.forEach(idx => {
				const p = points[idx];
				vertices.push(p.x, p.y, p.z);
			});
		});

		this.setAttribute('position', new Float32BufferAttribute(vertices, 3));
		const indices = [];
		for (let i = 0; i < vertices.length / 3; i += 3) {
			indices.push(i, i + 1, i + 2);
		}
		this.setIndex(indices);
		this.computeVertexNormals();
	}
}

// ---------------------------------------------------------------------------
// Incremental convex hull
// ---------------------------------------------------------------------------

/**
 * Build the convex hull of `points` (array of Vector3) and return an array of
 * triangle faces, each face being [i, j, k] indices into `points`.
 *
 * Algorithm:
 *   1. Find 4 non-coplanar seed points to form an initial tetrahedron.
 *   2. For every remaining point, find faces it can "see" (positive side of the
 *      plane), remove them, collect the horizon edges, and create new faces
 *      connecting the horizon to the new point.
 */
function buildConvexHull(points) {
	const n = points.length;
	const EPS = 1e-10;

	// --- Step 1: find an initial tetrahedron --------------------------------
	const seed = findInitialTetrahedron(points);
	if (!seed) return []; // degenerate — all points coplanar

	const [i0, i1, i2, i3] = seed;

	// Orient the initial tetrahedron so that all face normals point outward.
	// We define the four faces and ensure each normal points away from the
	// opposite vertex.
	let faces = [];

	function makeFace(a, b, c, opposite) {
		const normal = faceNormal(points[a], points[b], points[c]);
		const centroid = faceCentroid(points[a], points[b], points[c]);
		const toOpp = new Vector3().subVectors(points[opposite], centroid);
		if (normal.dot(toOpp) > 0) {
			// Normal points toward the opposite vertex — flip winding.
			return { verts: [a, c, b], normal: normal.negate() };
		}
		return { verts: [a, b, c], normal };
	}

	faces.push(makeFace(i0, i1, i2, i3));
	faces.push(makeFace(i0, i1, i3, i2));
	faces.push(makeFace(i0, i2, i3, i1));
	faces.push(makeFace(i1, i2, i3, i0));

	const usedSet = new Set([i0, i1, i2, i3]);

	// --- Step 2: incrementally add remaining points -------------------------
	for (let pi = 0; pi < n; pi++) {
		if (usedSet.has(pi)) continue;

		const pt = points[pi];

		// Find visible faces (point is on the positive side of the face plane).
		const visible = [];
		const invisible = [];
		for (let fi = 0; fi < faces.length; fi++) {
			const f = faces[fi];
			const centroid = faceCentroid(
				points[f.verts[0]], points[f.verts[1]], points[f.verts[2]]
			);
			const dist = f.normal.dot(new Vector3().subVectors(pt, centroid));
			if (dist > EPS) {
				visible.push(fi);
			} else {
				invisible.push(fi);
			}
		}

		if (visible.length === 0) continue; // Point is inside hull — skip.

		// Collect horizon edges: edges shared between a visible and an invisible face.
		const horizonEdges = [];
		const edgeCount = new Map();

		function edgeKey(a, b) {
			return a < b ? a + '_' + b : b + '_' + a;
		}

		// Record directed edges of visible faces.
		const visibleEdgesDirected = [];
		for (const fi of visible) {
			const v = faces[fi].verts;
			for (let ei = 0; ei < 3; ei++) {
				const a = v[ei], b = v[(ei + 1) % 3];
				const key = edgeKey(a, b);
				edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
				visibleEdgesDirected.push({ a, b, key });
			}
		}

		// Horizon edges appear exactly once among visible faces.
		for (const e of visibleEdgesDirected) {
			if (edgeCount.get(e.key) === 1) {
				horizonEdges.push([e.a, e.b]);
			}
		}

		// Remove visible faces, keeping invisible ones.
		const newFaces = [];
		for (const fi of invisible) {
			newFaces.push(faces[fi]);
		}

		// Create new faces from each horizon edge to the new point.
		for (const [ea, eb] of horizonEdges) {
			// The winding should be such that the normal points outward.
			// The horizon edge [ea, eb] was part of a visible face with that directed
			// order, so the new face should reverse the edge direction relative to the
			// old face: new face = [eb, ea, pi].
			const normal = faceNormal(points[eb], points[ea], points[pi]);
			newFaces.push({ verts: [eb, ea, pi], normal });
		}

		faces = newFaces;
	}

	// Return face index triples.
	return faces.map(f => f.verts);
}

// ---------------------------------------------------------------------------
// Find 4 non-coplanar seed points for the initial tetrahedron.
// ---------------------------------------------------------------------------
function findInitialTetrahedron(points) {
	const n = points.length;
	const EPS = 1e-10;

	if (n < 4) return null;

	// Pick the two most distant points along an axis (x first, then refine).
	let i0 = 0, i1 = 1;
	let maxDist = -1;
	for (let i = 0; i < n; i++) {
		for (let j = i + 1; j < n; j++) {
			const d = points[i].distanceToSquared(points[j]);
			if (d > maxDist) {
				maxDist = d;
				i0 = i;
				i1 = j;
			}
		}
	}

	// Find the point farthest from the line (i0, i1).
	const lineDir = new Vector3().subVectors(points[i1], points[i0]).normalize();
	let i2 = -1;
	maxDist = -1;
	for (let i = 0; i < n; i++) {
		if (i === i0 || i === i1) continue;
		const v = new Vector3().subVectors(points[i], points[i0]);
		const proj = v.dot(lineDir);
		const perp = v.clone().addScaledVector(lineDir, -proj);
		const d = perp.lengthSq();
		if (d > maxDist) {
			maxDist = d;
			i2 = i;
		}
	}
	if (i2 === -1 || maxDist < EPS) return null; // All points collinear.

	// Find the point farthest from the plane (i0, i1, i2).
	const planeNormal = faceNormal(points[i0], points[i1], points[i2]);
	let i3 = -1;
	maxDist = -1;
	for (let i = 0; i < n; i++) {
		if (i === i0 || i === i1 || i === i2) continue;
		const v = new Vector3().subVectors(points[i], points[i0]);
		const d = Math.abs(v.dot(planeNormal));
		if (d > maxDist) {
			maxDist = d;
			i3 = i;
		}
	}
	if (i3 === -1 || maxDist < EPS) return null; // All points coplanar.

	return [i0, i1, i2, i3];
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

/** Outward-facing normal of triangle (a, b, c). Not necessarily unit length. */
function faceNormal(a, b, c) {
	const ab = new Vector3().subVectors(b, a);
	const ac = new Vector3().subVectors(c, a);
	return new Vector3().crossVectors(ab, ac).normalize();
}

/** Centroid of triangle (a, b, c). */
function faceCentroid(a, b, c) {
	return new Vector3(
		(a.x + b.x + c.x) / 3,
		(a.y + b.y + c.y) / 3,
		(a.z + b.z + c.z) / 3
	);
}

/**
 * Circumradius of triangle with vertices a, b, c.
 * R = (|ab| * |bc| * |ca|) / (4 * area)
 */
function triangleCircumradius(a, b, c) {
	const ab = a.distanceTo(b);
	const bc = b.distanceTo(c);
	const ca = c.distanceTo(a);
	const s = (ab + bc + ca) / 2;
	const areaSquared = s * (s - ab) * (s - bc) * (s - ca);
	if (areaSquared <= 0) return Infinity; // degenerate triangle
	const area = Math.sqrt(areaSquared);
	return (ab * bc * ca) / (4 * area);
}

// ---------------------------------------------------------------------------
// Coplanar fallback: simple fan triangulation when all points lie in a plane.
// ---------------------------------------------------------------------------
function triangulatCoplanar(points) {
	if (points.length < 3) return [];

	// Project to 2D, sort by angle around centroid, fan-triangulate.
	const centroid = new Vector3(0, 0, 0);
	points.forEach(p => centroid.add(p));
	centroid.divideScalar(points.length);

	// Find a local 2D basis on the plane.
	const n0 = new Vector3().subVectors(points[1], points[0]).normalize();
	let n1 = new Vector3().subVectors(points[2], points[0]);
	const planeN = new Vector3().crossVectors(n0, n1).normalize();
	n1 = new Vector3().crossVectors(planeN, n0).normalize();

	// Project each point to 2D and compute angle.
	const projected = points.map((p, idx) => {
		const v = new Vector3().subVectors(p, centroid);
		const u = v.dot(n0);
		const w = v.dot(n1);
		return { idx, angle: Math.atan2(w, u) };
	});

	projected.sort((a, b) => a.angle - b.angle);

	// Fan from first vertex.
	const faces = [];
	for (let i = 1; i < projected.length - 1; i++) {
		faces.push([projected[0].idx, projected[i].idx, projected[i + 1].idx]);
	}
	return faces;
}

export { ConcaveGeometry };
