/**
 * @file Shared constants used across the Astrography project.
 * Centralizes magic numbers and strings to improve maintainability.
 */

/** Radius of the globe projection sphere in scene units. */
export const GLOBE_RADIUS = 100;

/** Default color for constellation boundary lines (grey). */
export const CONSTELLATION_LINE_COLOR = 0x888888;

/** Default star color when no classification is available. */
export const DEFAULT_STAR_COLOR = '#FFFFFF';

/** Small epsilon to prevent division by zero in floating-point math. */
export const EPSILON = 1e-10;

/** The name used to filter out the Sun from projected maps. */
export const SOL_STAR_NAME = 'Sol';

/** Recognized Morgan-Keenan stellar spectral classes. */
export const STELLAR_CLASSES = Object.freeze(['O', 'B', 'A', 'D', 'F', 'G', 'K', 'M', 'L', 'T', 'Y']);

/** Set version of STELLAR_CLASSES for O(1) lookups. */
export const STELLAR_CLASS_SET = new Set(STELLAR_CLASSES);

/** Human-readable names for each stellar class. */
export const STELLAR_CLASS_NAMES = Object.freeze({
  O: 'Blue Giant',
  B: 'Blue-White',
  A: 'White',
  D: 'White Dwarf',
  F: 'Yellow-White',
  G: 'Yellow Dwarf',
  K: 'Orange Dwarf',
  M: 'Red Dwarf',
  L: 'Brown Dwarf',
  T: 'Cool Brown Dwarf',
  Y: 'Ultra Cool Brown Dwarf'
});

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

/** Known dust cloud data files (name + path). */
export const DUST_CLOUDS = Object.freeze([
  { name: 'Aquila', file: 'data/Aquila_cloud_data.json' },
  { name: 'Auriga', file: 'data/Auriga_cloud_data.json' },
  { name: 'Blue', file: 'data/Blue_cloud_data.json' },
  { name: 'Ceti', file: 'data/Ceti_cloud_data.json' },
  { name: 'Dorado', file: 'data/Dorado_cloud_data.json' },
  { name: 'Eridani', file: 'data/Eridani_cloud_data.json' },
  { name: 'Galactic', file: 'data/Galactic_cloud_data.json' },
  { name: 'Gemini', file: 'data/Gemini_cloud_data.json' },
  { name: 'Hyades', file: 'data/Hyades_cloud_data.json' },
  { name: 'Leo', file: 'data/Leo_cloud_data.json' },
  { name: 'Local Interstellar', file: 'data/Local_interstellar_cloud.json' },
  { name: 'Microscopi', file: 'data/Microscopi_cloud_data.json' },
  { name: 'North Galactic Pole', file: 'data/North_Galactic_Pole_cloud_data.json' },
  { name: 'Ophiucus', file: 'data/Ophiucus_cloud_data.json' },
  { name: 'Vela', file: 'data/Vela_cloud_data.json' }
]);

// ---------------------------------------------------------------------------
// Visual / Theme constants
// ---------------------------------------------------------------------------

/** UV atlas texture dimensions. */
export const ATLAS_WIDTH = 8192;
export const ATLAS_HEIGHT = 4096;

/** Export resolution target (8K). */
export const EXPORT_TARGET_WIDTH = 7680;
export const EXPORT_TARGET_HEIGHT = 4320;
export const EXPORT_MAX_TILE_SIZE = 8192;

/** Connection label base font size (px). */
export const CONNECTION_LABEL_BASE_FONT = 72;

/** HSL saturation and lightness for auto-generated colors. */
export const AUTO_COLOR_SATURATION = 70;
export const AUTO_COLOR_LIGHTNESS = 50;

/** Data loading timeout (ms). */
export const DATA_LOAD_TIMEOUT = 30000;
