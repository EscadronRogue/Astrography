export const dustCloudColors = {
  'Local interstellar cloud': '#ff0000', // red
  'Ophiuchus': '#32cd32', // lime
  'Microscopi': '#00008b', // dark blue
  'Gemini': '#008000', // green
  'North Galactic Pole': '#ee82ee', // violet
  'Leo': '#006400', // dark green
  'Auriga': '#800080', // purple/dark red
  'Blue': '#00bfff', // bright blue
  'Galactic': '#f5f5dc', // beige
  'Dorado': '#00ffff', // light blue/cyan
  'Ceti': '#ffa500', // orange
  'Vela': '#ff69b4', // pink
  'Aquila': '#00ff00', // bright green
  'Eridani': '#9400d3', // dark violet
  'Hyades': '#6699cc' // grey blue
};

export function getDustCloudColor(name) {
  const lower = name.toLowerCase();
  for (const key of Object.keys(dustCloudColors)) {
    if (key.toLowerCase() === lower) {
      return dustCloudColors[key];
    }
  }
  return null;
}
