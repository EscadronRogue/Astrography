// File: /filters/GroupedConcaveGeometry.js
import {
  BufferGeometry,
  Float32BufferAttribute,
  Vector3
} from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';

export class GroupedConcaveGeometry extends BufferGeometry {
  constructor(points) {
    super();
    if (!points || points.length < 4) {
      console.error("GroupedConcaveGeometry: Need at least four points.");
      return;
    }

    // Helper: Group the points in groups of four, wrapping if needed.
    function groupPoints(arr, groupSize = 4) {
      const groups = [];
      const n = arr.length;
      for (let i = 0; i < n; i += groupSize) {
        const group = [];
        for (let j = 0; j < groupSize; j++) {
          group.push(arr[(i + j) % n]);
        }
        groups.push(group);
      }
      return groups;
    }

    // First pass: Sequential groups of four.
    const sequentialGroups = groupPoints(points, 4);

    // Second pass: Interleaved groups.
    const evenPoints = [];
    const oddPoints = [];
    for (let i = 0; i < points.length; i++) {
      if (i % 2 === 0) evenPoints.push(points[i]);
      else oddPoints.push(points[i]);
    }
    // If a group has less than 4 points, wrap around to ensure four corners.
    function ensureFour(group) {
      while (group.length < 4) {
        // Here we simply repeat from the beginning of the same group.
        group.push(group[group.length % group.length]);
      }
      return group;
    }
    const interleavedGroups = [];
    if (evenPoints.length > 0) {
      interleavedGroups.push(ensureFour(evenPoints));
    }
    if (oddPoints.length > 0) {
      interleavedGroups.push(ensureFour(oddPoints));
    }

    // Combine all groups.
    const allGroups = sequentialGroups.concat(interleavedGroups);

    // Build the final geometry by creating two triangles for each group.
    const vertices = [];
    const indices = [];
    let vertexOffset = 0;

    allGroups.forEach(group => {
      // Add the four vertices.
      group.forEach(p => {
        vertices.push(p.x, p.y, p.z);
      });
      // Triangulate the quadrilateral.
      indices.push(vertexOffset, vertexOffset + 1, vertexOffset + 2);
      indices.push(vertexOffset, vertexOffset + 2, vertexOffset + 3);
      vertexOffset += group.length;
    });

    this.setAttribute('position', new Float32BufferAttribute(vertices, 3));
    this.setIndex(indices);
    this.computeVertexNormals();
  }
}
