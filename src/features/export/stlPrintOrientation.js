import { vecCross, vecDot, vecNormalise } from './stlVectorMath.js';

export function buildFeatureBasis(forward) {
  let worldUp = [0, 1, 0];
  if (Math.abs(vecDot(forward, worldUp)) > 0.9) worldUp = [1, 0, 0];

  const lookDir = [-forward[0], -forward[1], -forward[2]];
  const right = vecNormalise(...vecCross(lookDir, worldUp));
  const up = vecNormalise(...vecCross(right, lookDir));

  return { right, up, forward };
}

export function rotatePointIntoBasis(point, basis) {
  return [
    vecDot(point, basis.right),
    vecDot(point, basis.up),
    vecDot(point, basis.forward)
  ];
}

export function placeTrianglesOnBuildPlate(triangles) {
  let minZ = Infinity;
  for (const tri of triangles) {
    minZ = Math.min(minZ, tri.a[2], tri.b[2], tri.c[2]);
  }
  if (!Number.isFinite(minZ)) return triangles;

  const zOffset = -minZ;
  return triangles.map(tri => ({
    a: [tri.a[0], tri.a[1], tri.a[2] + zOffset],
    b: [tri.b[0], tri.b[1], tri.b[2] + zOffset],
    c: [tri.c[0], tri.c[1], tri.c[2] + zOffset]
  }));
}

export function orientStarForPrint(triangles, faceDirection) {
  const basis = buildFeatureBasis(faceDirection);
  const rotated = triangles.map(tri => ({
    a: rotatePointIntoBasis(tri.a, basis),
    b: rotatePointIntoBasis(tri.b, basis),
    c: rotatePointIntoBasis(tri.c, basis)
  }));
  return placeTrianglesOnBuildPlate(rotated);
}
