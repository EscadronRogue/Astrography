// File: /filters/ConcaveGeometry.js
import { BufferGeometry, Float32BufferAttribute, Vector3, MathUtils } from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';

/**
 * ConcaveGeometry builds a 3D geometry based on local quadrilaterals.
 * For each input point it finds the three closest neighbors (by Euclidean distance)
 * and constructs a quadrilateral by ordering the four points (using a centroid and polar angles).
 * Each quadrilateral is split into two triangles.
 *
 * Note: If no quadrilaterals can be formed, the geometry will be empty.
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
    let indexOffset = 0;
    const n = points.length;

    // Loop through each point in the list.
    for (let i = 0; i < n; i++) {
      const p = points[i];
      let distances = [];
      // Compute distance from p to every other point.
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const d = p.distanceTo(points[j]);
        distances.push({ index: j, distance: d });
      }
      // Sort by distance (ascending).
      distances.sort((a, b) => a.distance - b.distance);
      if (distances.length < 3) continue; // Skip if fewer than 3 neighbors.

      // Get the three closest neighbors.
      const neighborIndices = distances.slice(0, 3).map(obj => obj.index);
      const quadPoints = [p, points[neighborIndices[0]], points[neighborIndices[1]], points[neighborIndices[2]]];

      // Compute the centroid of the four points.
      const centroid = new Vector3(0, 0, 0);
      quadPoints.forEach(pt => centroid.add(pt));
      centroid.divideScalar(quadPoints.length);

      // Compute an approximate local normal using two edges.
      let normal = new Vector3();
      {
        const v1 = new Vector3().subVectors(quadPoints[1], quadPoints[0]);
        const v2 = new Vector3().subVectors(quadPoints[2], quadPoints[0]);
        normal = new Vector3().crossVectors(v1, v2).normalize();
        if (normal.length() === 0) {
          normal.set(0, 0, 1);
        }
      }

      // Compute angles for each of the 4 points relative to the centroid.
      // Use the vector from centroid to the first point as the reference.
      const refDir = new Vector3().subVectors(quadPoints[0], centroid).normalize();
      const pointAngles = quadPoints.map(pt => {
        const vec = new Vector3().subVectors(pt, centroid).normalize();
        // Angle between refDir and vec.
        let angle = Math.acos(MathUtils.clamp(refDir.dot(vec), -1, 1));
        // Use cross product with the normal to decide on sign.
        const cross = new Vector3().crossVectors(refDir, vec);
        if (cross.dot(normal) < 0) {
          angle = -angle;
        }
        return { pt, angle };
      });
      // Sort points in ascending order of angle.
      pointAngles.sort((a, b) => a.angle - b.angle);
      const ordered = pointAngles.map(pa => pa.pt);

      // Create two triangles for the quadrilateral: (0,1,2) and (0,2,3).
      vertices.push(
        ordered[0].x, ordered[0].y, ordered[0].z,
        ordered[1].x, ordered[1].y, ordered[1].z,
        ordered[2].x, ordered[2].y, ordered[2].z,
        ordered[3].x, ordered[3].y, ordered[3].z
      );
      indices.push(indexOffset, indexOffset + 1, indexOffset + 2);
      indices.push(indexOffset, indexOffset + 2, indexOffset + 3);
      indexOffset += 4;
    }

    if (vertices.length === 0) {
      console.error("ConcaveGeometry: No quadrilaterals could be formed from the given points.");
      return;
    }
    this.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    this.setIndex(indices);
    this.computeVertexNormals();
  }
}

export { ConcaveGeometry };
