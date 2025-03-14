// File: /filters/ConcaveGeometry.js
import {
	BufferGeometry,
	Float32BufferAttribute,
	Vector3
} from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';

/**
 * ConcaveGeometry builds a geometry by iterating over each input point and,
 * for each point, identifying the three closest points in terms of real 3D distance.
 * It then creates a quadrilateral (which is triangulated into two triangles)
 * with the four corners being the original point and its three nearest neighbors.
 *
 * Note: This algorithm is designed for small point sets and produces overlapping quadrilaterals.
 */
class ConcaveGeometry extends BufferGeometry {

	constructor(points, alpha) {
		super();
		if (!points || points.length < 4) {
			console.error("ConcaveGeometry: Need at least four points.");
			return;
		}

		// This array will hold all vertex positions (each group of three numbers is one vertex).
		const vertices = [];
		// This array will hold the indices that define triangles.
		const indices = [];

		// For each point in the list, find the three closest neighbors.
		for (let i = 0; i < points.length; i++) {
			const p = points[i];
			const neighbors = [];
			// Compute distances from point p to all other points.
			for (let j = 0; j < points.length; j++) {
				if (j === i) continue;
				const q = points[j];
				const d = p.distanceTo(q);
				neighbors.push({ point: q, distance: d });
			}
			// Sort neighbors by ascending distance.
			neighbors.sort((a, b) => a.distance - b.distance);

			// If for some reason there are less than three neighbors, skip this point.
			if (neighbors.length < 3) continue;

			// Gather the four points: the current point and its three nearest neighbors.
			const quadPoints = [p, neighbors[0].point, neighbors[1].point, neighbors[2].point];

			// Compute the centroid of the four points.
			const centroid = new Vector3(0, 0, 0);
			quadPoints.forEach(pt => centroid.add(pt));
			centroid.divideScalar(quadPoints.length);

			// Compute an approximate normal for the plane.
			// Use the first three points to define the plane.
			const vecA = new Vector3().subVectors(quadPoints[1], quadPoints[0]);
			const vecB = new Vector3().subVectors(quadPoints[2], quadPoints[0]);
			const normal = new Vector3().crossVectors(vecA, vecB).normalize();
			if (normal.length() < 1e-6) {
				normal.set(0, 0, 1);
			}

			// Establish a tangent basis for the plane.
			// Use the vector from the current point to its nearest neighbor as the tangent.
			let tangent = new Vector3().subVectors(quadPoints[1], p).normalize();
			if (Math.abs(tangent.dot(normal)) > 0.99) {
				// If tangent is nearly parallel to the normal, choose an arbitrary tangent.
				tangent.set(1, 0, 0);
			}
			const bitangent = new Vector3().crossVectors(normal, tangent).normalize();

			// Project each of the 4 points onto the plane and compute its angle relative to the centroid.
			const ptsWithAngle = quadPoints.map(pt => {
				const vec = new Vector3().subVectors(pt, centroid);
				const x = vec.dot(tangent);
				const y = vec.dot(bitangent);
				const angle = Math.atan2(y, x);
				return { pt, angle };
			});

			// Sort the points by angle in ascending order.
			ptsWithAngle.sort((a, b) => a.angle - b.angle);
			const sortedPoints = ptsWithAngle.map(item => item.pt);

			// Store the current base index (number of vertices already added).
			const baseIndex = vertices.length / 3;
			// Add the sorted points to the vertices array.
			sortedPoints.forEach(pt => {
				vertices.push(pt.x, pt.y, pt.z);
			});

			// Triangulate the quadrilateral into two triangles:
			// First triangle: (v0, v1, v2) and second triangle: (v0, v2, v3)
			indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
			indices.push(baseIndex, baseIndex + 2, baseIndex + 3);
		}

		// Set the attributes of the geometry.
		this.setAttribute('position', new Float32BufferAttribute(vertices, 3));
		this.setIndex(indices);
		this.computeVertexNormals();
	}

}

export { ConcaveGeometry };
