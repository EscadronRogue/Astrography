import { STELLAR_CLASSES } from '../../../shared/constants.js';


function readNumericValue(formData, name, fallback, parser = Number.parseFloat) {
  const rawValue = formData.get(name);
  if (rawValue === null || rawValue === '') return fallback;
  const parsedValue = parser(rawValue);
  return Number.isFinite(parsedValue) ? parsedValue : fallback;
}

function readCheckboxValue(formData, name) {
  return formData.get(name) !== null;
}

function readClassScaleMap(formData, suffix) {
  return [...STELLAR_CLASSES, 'Other'].reduce((accumulator, stellarClass) => {
    accumulator[stellarClass] = readNumericValue(
      formData,
      `class-${stellarClass}-${suffix}`,
      1
    );
    return accumulator;
  }, {});
}

export function computeAdaptiveGridSize(sliderValue) {
  if (sliderValue >= 0) {
    return 2 + sliderValue;
  }
  return 2 / (Math.abs(sliderValue) + 1);
}

export function readFilterState(filterForm) {
  const formData = new FormData(filterForm);

  return {
    size: formData.get('size'),
    color: formData.get('color'),
    opacity: formData.get('opacity'),
    starsShown: formData.get('stars-shown'),
    connections: readNumericValue(formData, 'connections', 7),
    showConstellationBoundaries: readCheckboxValue(formData, 'show-constellation-boundaries'),
    showConstellationNames: readCheckboxValue(formData, 'show-constellation-names'),
    showConstellationOverlay: readCheckboxValue(formData, 'show-constellation-overlay'),
    globeOpaqueSurface: readCheckboxValue(formData, 'globe-opaque-surface'),
    enableConnections: readCheckboxValue(formData, 'enable-connections'),
    enableIsolationFilter: readCheckboxValue(formData, 'enable-isolation-filter'),
    enableDensityFilter: readCheckboxValue(formData, 'enable-density-filter'),
    isolation: readNumericValue(formData, 'isolation', 5),
    isolationTolerance: readNumericValue(formData, 'isolation-tolerance', 0, Number.parseInt),
    density: readNumericValue(formData, 'density', 10),
    densityTopPercent: readNumericValue(formData, 'density-top-percent', 10),
    densityBottomPercent: readNumericValue(formData, 'density-bottom-percent', 10),
    densityTolerance: readNumericValue(formData, 'density-tolerance', 0, Number.parseInt),
    enableIsolationLabeling: readCheckboxValue(formData, 'enable-isolation-labeling'),
    enableDensityLabeling: readCheckboxValue(formData, 'enable-density-labeling'),
    minDistance: readNumericValue(formData, 'min-distance', 0),
    maxDistance: readNumericValue(formData, 'max-distance', 20),
    showDistanceInLabels: readCheckboxValue(formData, 'show-distance-in-labels'),
    isolationGridSize: readNumericValue(formData, 'isolation-grid-size', 1),
    densityGridSize: readNumericValue(formData, 'density-grid-size', 1),
    densityOpacity: readNumericValue(formData, 'density-opacity', 100) / 100,
    densityLineWidth: readNumericValue(formData, 'density-line-width', 30),
    densityFade: readNumericValue(formData, 'density-fade', 1),
    cloudOpacity: readNumericValue(formData, 'cloud-opacity', 100) / 100,
    cloudDensityRadius: readNumericValue(formData, 'cloud-density-radius', 5),
    cloudDensityOpacity: readNumericValue(formData, 'cloud-density-opacity', 100) / 100,
    starOpacity: readNumericValue(formData, 'star-opacity', 100) / 100,
    starNameOpacity: readNumericValue(formData, 'star-name-opacity', 100) / 100,
    connectionOpacity: readNumericValue(formData, 'connection-opacity', 50) / 100,
    connectionWidth: readNumericValue(formData, 'connection-width', 5),
    connectionFade: readNumericValue(formData, 'connection-fade', 1),
    connectionLabelSize: readNumericValue(formData, 'connection-label-size', 1),
    constellationLineOpacity: readNumericValue(formData, 'constellation-line-opacity', 40) / 100,
    constellationLineWidth: readNumericValue(formData, 'constellation-line-width', 1),
    constellationNameOpacity: readNumericValue(formData, 'constellation-name-opacity', 80) / 100,
    planeOpacity: readNumericValue(formData, 'plane-opacity', 50) / 100,
    mollweideBorderWidth: readNumericValue(formData, 'mollweide-border-width', 1),
    mollweideBorderOpacity: readNumericValue(formData, 'mollweide-border-opacity', 100) / 100,
    showClouds: formData.getAll('dust-clouds').length > 0,
    showCloudDensity: formData.getAll('dust-density-clouds').length > 0,
    showGalacticPlane: readCheckboxValue(formData, 'show-galactic-plane'),
    showEclipticPlane: readCheckboxValue(formData, 'show-ecliptic-plane'),
    showCelestialEquator: readCheckboxValue(formData, 'show-celestial-equator'),
    stellarClassStarSizes: readClassScaleMap(formData, 'star-size'),
    stellarClassLabelSizes: readClassScaleMap(formData, 'label-size')
  };
}
