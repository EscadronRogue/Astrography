export const FACET_DEPTH_FACTOR = 0.3;
export const FACET_BOX_HALF_DEPTH_FACTOR = 1.5;
export const FACET_BOX_HALF_EXTENT_FACTOR = 2.2;

export function getFacetDepth(sphereRadius) {
  return sphereRadius * FACET_DEPTH_FACTOR;
}

export function getFacetPlaneOffset(sphereRadius, facetDepth = getFacetDepth(sphereRadius)) {
  return sphereRadius - facetDepth;
}

export function getFacetDiameter(sphereRadius, facetDepth = getFacetDepth(sphereRadius)) {
  const planeOffset = getFacetPlaneOffset(sphereRadius, facetDepth);
  return 2 * Math.sqrt(Math.max(0, sphereRadius * sphereRadius - planeOffset * planeOffset));
}

export function getFacetBoxHalfDepth(sphereRadius) {
  return sphereRadius * FACET_BOX_HALF_DEPTH_FACTOR;
}

export function getFacetBoxHalfExtent(sphereRadius) {
  return sphereRadius * FACET_BOX_HALF_EXTENT_FACTOR;
}

export function makePointOnFacet(right, up, forward, x, y, forwardOffset) {
  return [
    right[0] * x + up[0] * y + forward[0] * forwardOffset,
    right[1] * x + up[1] * y + forward[1] * forwardOffset,
    right[2] * x + up[2] * y + forward[2] * forwardOffset
  ];
}
