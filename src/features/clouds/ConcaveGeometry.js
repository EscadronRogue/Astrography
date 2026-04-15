// File: /filters/ConcaveGeometry.js
import {
	BufferGeometry,
	Float32BufferAttribute,
	Vector3
} from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';

/**
 * ConcaveGeometry builds a 3D concave hull (alpha shape) from a set of points.
 * It computes all tetrahedra (via brute force) from the points whose circumsphere
 * radii are below an alpha threshold and whose circumspheres contain no other points.
 * Then it extracts the boundary faces of the alpha complex and triangulates them.
 *
 * Note: This brute-force algorithm is O(n^4) and is only suitable for small point sets.
 */
class ConcaveGeometry extends BufferGeometry {

	constructor(points, alpha) {
		super();
		if (!points || points.length < 4) {
			console.error("ConcaveGeometry: Need at least four points.");
			return;
		}

		// Compute centroid of points.
		const centroid = new Vector3(0, 0, 0);
		points.forEach(p => centroid.add(p));
		centroid.divideScalar(points.length);

		// Compute average distance from centroid.
		let sumDist = 0;
		points.forEach(p => {
			sumDist += p.distanceTo(centroid);
		});
		const avgDist = sumDist / points.length;

		// If alpha not provided, choose a default value (tweak factor as needed).
		if (alpha === undefined || alpha === null) {
			alpha = avgDist * 1.2;
		}

		// Build the alpha complex: find all tetrahedra with circumsphere radius <= alpha
		// and whose circumsphere is "empty" (no other point inside).
		const tetrahedra = [];
		const n = points.length;
		const eps = 1e-6;
		for (let i = 0; i < n - 3; i++) {
			for (let j = i + 1; j < n - 2; j++) {
				for (let k = j + 1; k < n - 1; k++) {
					for (let l = k + 1; l < n; l++) {
						const a = points[i], b = points[j], c = points[k], d = points[l];
						const sphere = computeCircumsphere(a, b, c, d);
						if (!sphere) continue; // Degenerate tetrahedron.
						if (sphere.radius > alpha) continue;
						// Check if any other point is inside the circumsphere.
						let empty = true;
						for (let m = 0; m < n; m++) {
							if (m === i || m === j || m === k || m === l) continue;
							if (points[m].distanceTo(sphere.center) < sphere.radius - eps) {
								empty = false;
								break;
							}
						}
						if (empty) {
							tetrahedra.push({ indices: [i, j, k, l], sphere: sphere });
						}
					}
				}
			}
		}

		// Extract boundary faces from the tetrahedra.
		// A face is defined by 3 point indices; if a face appears only once across all tetrahedra,
		// it lies on the boundary of the alpha shape.
		const faceMap = new Map();
		function addFace(i1, i2, i3) {
			const indices = [i1, i2, i3].sort((a, b) => a - b);
			const key = indices.join('_');
			if (faceMap.has(key)) {
				faceMap.set(key, faceMap.get(key) + 1);
			} else {
				faceMap.set(key, 1);
			}
		}
		tetrahedra.forEach(tet => {
			const [i, j, k, l] = tet.indices;
			addFace(i, j, k);
			addFace(i, j, l);
			addFace(i, k, l);
			addFace(j, k, l);
		});

		// Collect faces that appear only once.
		const boundaryFaces = [];
		faceMap.forEach((count, key) => {
			if (count === 1) {
				const indices = key.split('_').map(Number);
				boundaryFaces.push(indices);
			}
		});

		// Build geometry from boundary faces.
		// Each boundary face is a triangle; vertices are taken from the original points.
		const vertices = [];
		boundaryFaces.forEach(face => {
			face.forEach(idx => {
				const p = points[idx];
				vertices.push(p.x, p.y, p.z);
			});
		});

		this.setAttribute('position', new Float32BufferAttribute(vertices, 3));
		// Create sequential indices.
		const indices = [];
		for (let i = 0; i < vertices.length / 3; i += 3) {
			indices.push(i, i + 1, i + 2);
		}
		this.setIndex(indices);
		this.computeVertexNormals();
	}

}

// Computes the circumsphere of the tetrahedron defined by points a, b, c, and d.
// Returns an object { center: Vector3, radius: number } or null if the tetrahedron is degenerate.
function computeCircumsphere(a, b, c, d) {
	// Translate points so that a becomes the origin.
	const U = new Vector3().subVectors(b, a);
	const V = new Vector3().subVectors(c, a);
	const W = new Vector3().subVectors(d, a);

	// Set up the linear system: 2*(p - a)·x = |p|^2 - |a|^2 for p = b, c, d.
	const b1 = b.x * b.x + b.y * b.y + b.z * b.z - (a.x * a.x + a.y * a.y + a.z * a.z);
	const b2 = c.x * c.x + c.y * c.y + c.z * c.z - (a.x * a.x + a.y * a.y + a.z * a.z);
	const b3 = d.x * d.x + d.y * d.y + d.z * d.z - (a.x * a.x + a.y * a.y + a.z * a.z);

	const M = [
		[2 * U.x, 2 * U.y, 2 * U.z],
		[2 * V.x, 2 * V.y, 2 * V.z],
		[2 * W.x, 2 * W.y, 2 * W.z]
	];
	const B = [b1, b2, b3];

	const sol = solveLinearSystem(M, B);
	if (!sol) return null;
	const center = new Vector3(a.x + sol[0], a.y + sol[1], a.z + sol[2]);
	const radius = center.distanceTo(a);
	return { center, radius };
}

// Solves a 3x3 linear system M * x = B using Cramer's rule.
// M is a 3x3 array and B is an array of 3 numbers.
// Returns an array [x, y, z] or null if the system is singular.
function solveLinearSystem(M, B) {
	const detM = determinant3x3(M);
	if (Math.abs(detM) < 1e-12) return null;

	const Mx = [
		[B[0], M[0][1], M[0][2]],
		[B[1], M[1][1], M[1][2]],
		[B[2], M[2][1], M[2][2]]
	];
	const My = [
		[M[0][0], B[0], M[0][2]],
		[M[1][0], B[1], M[1][2]],
		[M[2][0], B[2], M[2][2]]
	];
	const Mz = [
		[M[0][0], M[0][1], B[0]],
		[M[1][0], M[1][1], B[1]],
		[M[2][0], M[2][1], B[2]]
	];

	const x = determinant3x3(Mx) / detM;
	const y = determinant3x3(My) / detM;
	const z = determinant3x3(Mz) / detM;
	return [x, y, z];
}

function determinant3x3(m) {
	return m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1])
		- m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0])
		+ m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
}

export { ConcaveGeometry };
