// File: /filters/ConcaveGeometry.js
import {
	BufferGeometry,
	Float32BufferAttribute,
	Vector3
} from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';

/**
 * ConcaveGeometry builds a geometry by creating a quadrilateral for each star
 * by finding its three nearest neighbors in 3D space.
 *
 * For each star in the provided points list, the algorithm:
 *   1. Finds the three closest neighbors (based on Euclidean distance).
 *   2. Constructs a quadrilateral using the star and its three neighbors.
 *   3. Orders the four vertices in a consistent (counterclockwise) order on their best‑fit plane.
 *   4. Triangulates the quadrilateral into two triangles.
 *   5. Combines all triangles into one BufferGeometry.
 *
 * Note: This approach may produce overlapping polygons if stars are close together.
 * It is intended for visualizing cloud overlays without breaking established functionalities.
 */
class ConcaveGeometry extends BufferGeometry {

	constructor(points) {
		super();
		if (!points || points.length < 4) {
			console.error("ConcaveGeometry: Need at least four points.");
			return;
		}
		const vertices = [];
		const indices = [];

		// For each point, find its three nearest neighbors and form a quadrilateral.
		for (let i = 0; i < points.length; i++) {
			const p = points[i];
			const distances = [];
			for (let j = 0; j < points.length; j++) {
				if (i === j) continue;
				const d = p.distanceTo(points[j]);
				distances.push({ index: j, distance: d });
			}
			distances.sort((a, b) => a.distance - b.distance);
			if (distances.length < 3) continue;
			// Get the indices of the three closest neighbors.
			const neighborIndices = distances.slice(0, 3).map(obj => obj.index);
			const quadPoints = [p, points[neighborIndices[0]], points[neighborIndices[1]], points[neighborIndices[2]]];

			// Order the quadrilateral's vertices.
			const orderedPoints = orderPoints(quadPoints);

			// Add vertices for this quadrilateral.
			const startIndex = vertices.length / 3;
			orderedPoints.forEach(pt => {
				vertices.push(pt.x, pt.y, pt.z);
			});

			// Triangulate the quadrilateral: two triangles: (0,1,2) and (0,2,3)
			indices.push(startIndex, startIndex + 1, startIndex + 2);
			indices.push(startIndex, startIndex + 2, startIndex + 3);
		}

		if (vertices.length === 0) {
			console.error("ConcaveGeometry: No valid quadrilaterals could be formed.");
			return;
		}

		this.setAttribute('position', new Float32BufferAttribute(vertices, 3));
		this.setIndex(indices);
		this.computeVertexNormals();
	}
}

/**
 * Orders an array of points in a consistent counterclockwise order on the best-fit plane.
 * @param {Vector3[]} pts - Array of THREE.Vector3 points (assumed to be 4).
 * @returns {Vector3[]} - Ordered array of points.
 */
function orderPoints(pts) {
	// Compute centroid.
	const centroid = new Vector3(0, 0, 0);
	pts.forEach(pt => {
		centroid.add(pt);
	});
	centroid.divideScalar(pts.length);

	// Compute a normal for the best-fit plane using the first two vectors.
	const v1 = new Vector3().subVectors(pts[0], centroid);
	const v2 = new Vector3().subVectors(pts[1], centroid);
	const normal = new Vector3().crossVectors(v1, v2).normalize();

	// Create basis vectors for the plane.
	const tangent = new Vector3().subVectors(pts[0], centroid).normalize();
	const bitangent = new Vector3().crossVectors(normal, tangent).normalize();

	// Map each point to an angle relative to the tangent and bitangent.
	const pointsWithAngle = pts.map(pt => {
		const v = new Vector3().subVectors(pt, centroid);
		const x = v.dot(tangent);
		const y = v.dot(bitangent);
		let angle = Math.atan2(y, x);
		// Ensure angle is in [0, 2π]
		if (angle < 0) angle += 2 * Math.PI;
		return { pt, angle };
	});

	// Sort points by angle.
	pointsWithAngle.sort((a, b) => a.angle - b.angle);
	return pointsWithAngle.map(item => item.pt);
}

export { ConcaveGeometry };
