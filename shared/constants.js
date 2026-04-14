/**
 * @file Shared constants used across the Astrography project.
 * Centralizes magic numbers and strings to improve maintainability.
 */

/** Radius of the globe projection sphere in scene units. */
export const GLOBE_RADIUS = 100;

/** Number of segments used when drawing circles/arcs on the sphere. */
export const CIRCLE_SEGMENTS = 32;

/** Canvas texture dimensions for Mollweide heatmaps. */
export const HEATMAP_CANVAS_WIDTH = 1024;
export const HEATMAP_CANVAS_HEIGHT = 512;

/** Mollweide heatmap plane dimensions in scene units. */
export const HEATMAP_PLANE_WIDTH = 400;
export const HEATMAP_PLANE_HEIGHT = 200;

/** Default color for constellation boundary lines (grey). */
export const CONSTELLATION_LINE_COLOR = 0x888888;

/** Default star color when no classification is available. */
export const DEFAULT_STAR_COLOR = '#FFFFFF';

/** Small epsilon to prevent division by zero in floating-point math. */
export const EPSILON = 1e-10;

/** The name used to filter out the Sun from projected maps. */
export const SOL_STAR_NAME = 'Sol';

/** Recognized Morgan-Keenan stellar spectral classes. */
export const STELLAR_CLASSES = Object.freeze(['O', 'B', 'A', 'F', 'G', 'K', 'M', 'L', 'T', 'Y']);

/** Set version of STELLAR_CLASSES for O(1) lookups. */
export const STELLAR_CLASS_SET = new Set(STELLAR_CLASSES);

/** Human-readable names for each stellar class. */
export const STELLAR_CLASS_NAMES = Object.freeze({
  O: 'Blue',
  B: 'Blue-White',
  A: 'White',
  F: 'Yellow-White',
  G: 'Yellow',
  K: 'Orange',
  M: 'Red',
  L: 'Brown',
  T: 'Cool Brown',
  Y: 'Ultra-Cool Brown'
});

/** Newton-Raphson iteration limit for Mollweide theta convergence. */
export const MOLLWEIDE_MAX_ITERATIONS = 10;

/** Slider range defaults for stellar class star/label size. */
export const STELLAR_SIZE_SLIDER = Object.freeze({
  min: 0.1,
  max: 15,
  step: 0.1
});

/** Maximum height (px) for scrollable subcategory content. */
export const SUBCATEGORY_MAX_HEIGHT = 300;

/** Distance scaling multiplier for size-by-distance filter. */
export const DISTANCE_SIZE_SCALE = 5;

/** Naked-eye visibility limit (apparent magnitude). */
export const NAKED_EYE_MAGNITUDE_LIMIT = 6;

/** Minimum opacity floor for magnitude-based opacity. */
export const MIN_MAGNITUDE_OPACITY = 0.1;

/** Regex pattern to extract cloud name from data file URL. */
export const CLOUD_FILE_REGEX = /_cloud_data\.json$/i;

/** Default connection count for nearest-neighbor connections. */
export const DEFAULT_CONNECTION_COUNT = 7;

/** Data directory path prefix. */
export const DATA_BASE_PATH = 'data';


/** Size in pixels for the generated star sprite texture. */
export const STAR_TEXTURE_SIZE = 64;

/** Default radius for true-coordinate/ecliptic/galactic guide meshes. */
export const GUIDE_SPHERE_RADIUS = 200;

/** Segment count for Mollweide ellipse geometry. */
export const MOLLWEIDE_ELLIPSE_SEGMENTS = 1024;
