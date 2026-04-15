/**
 * @file Predefined colors for known dust clouds.
 * Uses a pre-built Map with lowercase keys for O(1) case-insensitive lookups.
 */

/** @type {Object<string, string>} Canonical cloud name → hex color. */
export const dustCloudColors = {
  'Local interstellar cloud': '#ff0000',
  Ophiuchus: '#00ff00',
  Microscopi: '#ff8c00',
  Blue: '#0000ff',
  Galactic: '#ffff00',
  Aquila: '#00ffff',
  Eridani: '#8a2be2',
  'North Galactic Pole': '#7fffd4',
  Leo: '#cd5c5c',
  Auriga: '#ff1493',
  Gemini: '#f08080',
  Dorado: '#00ff7f',
  Ceti: '#ff69b4',
  Hyades: '#dda0dd',
  Vela: '#ff00ff'
};

/** Pre-built lowercase lookup map for O(1) access. */
const colorLookup = new Map(
  Object.entries(dustCloudColors).map(([key, val]) => [key.toLowerCase(), val])
);

/**
 * Returns the predefined hex color for a dust cloud name (case-insensitive).
 * @param {string} name - Cloud name.
 * @returns {string|null} Hex color string or null if not found.
 */
export function getDustCloudColor(name) {
  return colorLookup.get(String(name ?? '').toLowerCase()) ?? null;
}
