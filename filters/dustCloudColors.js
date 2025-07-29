export const dustCloudColors = {
  // Explicit colors for user-specified clouds
  'Local interstellar cloud': '#ff0000', // red
  Ophiuchus: '#00ff00', // green
  Microscopi: '#ff8c00', // orange
  Blue: '#0000ff', // blue
  Galactic: '#ffff00', // yellow
  Aquila: '#00ffff', // cyan
  Eridani: '#8a2be2', // violet

  // Unique colors for remaining clouds
  'North Galactic Pole': '#7fffd4', // aquamarine
  Leo: '#cd5c5c', // indian red
  Auriga: '#ff1493', // deep pink
  Gemini: '#f08080', // light coral
  Dorado: '#00ff7f', // spring green
  Ceti: '#ff69b4', // hot pink
  Hyades: '#dda0dd', // plum
  Vela: '#ff00ff' // magenta
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
