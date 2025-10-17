// /filters/index.js

import { loadStellarClassData } from './stellarClassData.js';
import { applySizeFilter } from './sizeFilter.js';
import { applyColorFilter } from './colorFilter.js';
import { applyOpacityFilter } from './opacityFilter.js';
import { applyStarsShownFilter } from './starsShownFilter.js';
import { computeConnectionPairs } from './connectionsFilter.js';
import { applyStellarClassLogic, generateStellarClassFilters as scGenerate } from './stellarClassFilter.js';
import { loadConstellationBoundaries, loadConstellationCenters } from './constellationFilter.js';
import { applyGlobeSurfaceFilter } from './globeSurfaceFilter.js';
import { createConstellationOverlayForGlobe } from './constellationOverlayFilter.js';
import { applyDistanceFilter } from './distanceFilter.js';

// Import the new Isolation and Density Filter modules.
import { initIsolationFilter, updateIsolationFilter } from './isolationFilter.js';
import { initDensityFilter, updateDensityFilter } from './densityFilter.js';
import { createCloudDensityOverlay, updateCloudDensityOverlay } from './cloudDensityFilter.js';
import { bindAdditionalOpacitySliders } from '../ui/filterUI.js';

let filterForm = null;
let isolationOverlay = null;
let densityOverlay = null;
let cloudDensityOverlays = [];

// Helper to compute a grid size from the isolationGridSize slider value.
function computeIsolationGridSize(sliderValue) {
  // Example: if sliderValue >= 0, use 2 + sliderValue; if negative, use 2 / (|sliderValue|+1)
  if (sliderValue >= 0) {
    return 2 + sliderValue;
  } else {
    return 2 / (Math.abs(sliderValue) + 1);
  }
}

export async function setupFilterUI(allStars) {
  filterForm = document.getElementById('filters-form');
  if (!filterForm) {
    console.warn('[setupFilterUI] No #filters-form found in DOM!');
    return;
  }
  await loadStellarClassData();
  scGenerate(allStars);
  const mainLegends = filterForm.querySelectorAll('legend.collapsible');
  mainLegends.forEach(legend => {
    const fc = legend.nextElementSibling;
    if (fc) fc.style.maxHeight = '0px';
    legend.addEventListener('click', () => {
      legend.classList.toggle('active');
      const isActive = legend.classList.contains('active');
      legend.setAttribute('aria-expanded', isActive);
      if (fc) fc.style.maxHeight = isActive ? fc.scrollHeight + 'px' : '0px';
    });
  });
  addConstellationsFieldset();
  addGlobeSurfaceFieldset();
  addPlanesFieldset();
  bindAdditionalOpacitySliders();
  // Clouds fieldset is added in the UI file.
  await loadConstellationBoundaries();
  await loadConstellationCenters();
}

function addConstellationsFieldset() {
  const fs = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.classList.add('collapsible');
  legend.textContent = 'Constellations';
  fs.appendChild(legend);
  const contentDiv = document.createElement('div');
  contentDiv.classList.add('filter-content', 'scrollable-category');
  contentDiv.style.maxHeight = '0px';
  legend.addEventListener('click', () => {
    legend.classList.toggle('active');
    const isActive = legend.classList.contains('active');
    legend.setAttribute('aria-expanded', isActive);
    contentDiv.style.maxHeight = isActive ? contentDiv.scrollHeight + 'px' : '0px';
  });
  const boundaryDiv = document.createElement('div');
  boundaryDiv.classList.add('filter-item');
  const boundaryChk = document.createElement('input');
  boundaryChk.type = 'checkbox';
  boundaryChk.id = 'show-constellation-boundaries';
  boundaryChk.name = 'show-constellation-boundaries';
  boundaryChk.checked = true;
  const boundaryLbl = document.createElement('label');
  boundaryLbl.htmlFor = 'show-constellation-boundaries';
  boundaryLbl.textContent = 'Show Constellation Boundaries';
  boundaryDiv.appendChild(boundaryChk);
  boundaryDiv.appendChild(boundaryLbl);
  contentDiv.appendChild(boundaryDiv);
  const namesDiv = document.createElement('div');
  namesDiv.classList.add('filter-item');
  const namesChk = document.createElement('input');
  namesChk.type = 'checkbox';
  namesChk.id = 'show-constellation-names';
  namesChk.name = 'show-constellation-names';
  namesChk.checked = true;
  const namesLbl = document.createElement('label');
  namesLbl.htmlFor = 'show-constellation-names';
  namesLbl.textContent = 'Show Constellation Names';
  namesDiv.appendChild(namesChk);
  namesDiv.appendChild(namesLbl);
  contentDiv.appendChild(namesDiv);
  const overlayDiv = document.createElement('div');
  overlayDiv.classList.add('filter-item');
  const overlayChk = document.createElement('input');
  overlayChk.type = 'checkbox';
  overlayChk.id = 'show-constellation-overlay';
  overlayChk.name = 'show-constellation-overlay';
  overlayChk.checked = false;
  const overlayLbl = document.createElement('label');
  overlayLbl.htmlFor = 'show-constellation-overlay';
  overlayLbl.textContent = 'Show Constellation Overlays';
  overlayDiv.appendChild(overlayChk);
  overlayDiv.appendChild(overlayLbl);
  contentDiv.appendChild(overlayDiv);

  const lineOpDiv = document.createElement('div');
  lineOpDiv.classList.add('filter-item');
  const lineOpLabel = document.createElement('label');
  lineOpLabel.htmlFor = 'constellation-line-opacity-slider';
  lineOpLabel.textContent = 'Line Opacity:';
  const lineOpSlider = document.createElement('input');
  lineOpSlider.type = 'range';
  lineOpSlider.id = 'constellation-line-opacity-slider';
  lineOpSlider.name = 'constellation-line-opacity';
  lineOpSlider.min = '0';
  lineOpSlider.max = '100';
  lineOpSlider.value = '40';
  lineOpSlider.step = '1';
  const lineOpNumber = document.createElement('input');
  lineOpNumber.type = 'number';
  lineOpNumber.id = 'constellation-line-opacity-number';
  lineOpNumber.name = 'constellation-line-opacity';
  lineOpNumber.min = '0';
  lineOpNumber.max = '100';
  lineOpNumber.value = '40';
  lineOpNumber.step = '1';
  const lineOpSpan = document.createElement('span');
  lineOpSpan.id = 'constellation-line-opacity-value';
  lineOpSpan.textContent = '40';
  lineOpDiv.appendChild(lineOpLabel);
  lineOpDiv.appendChild(lineOpSlider);
  lineOpDiv.appendChild(lineOpNumber);
  lineOpDiv.appendChild(lineOpSpan);
  lineOpDiv.appendChild(document.createTextNode('%'));
  contentDiv.appendChild(lineOpDiv);

  const lineWidthDiv = document.createElement('div');
  lineWidthDiv.classList.add('filter-item');
  const lineWidthLabel = document.createElement('label');
  lineWidthLabel.htmlFor = 'constellation-line-width-slider';
  lineWidthLabel.textContent = 'Line Width:';
  const lineWidthSlider = document.createElement('input');
  lineWidthSlider.type = 'range';
  lineWidthSlider.id = 'constellation-line-width-slider';
  lineWidthSlider.name = 'constellation-line-width';
  lineWidthSlider.min = '0.1';
  lineWidthSlider.max = '5';
  lineWidthSlider.value = '1';
  lineWidthSlider.step = '0.1';
  const lineWidthNumber = document.createElement('input');
  lineWidthNumber.type = 'number';
  lineWidthNumber.id = 'constellation-line-width-number';
  lineWidthNumber.name = 'constellation-line-width';
  lineWidthNumber.min = '0.1';
  lineWidthNumber.max = '5';
  lineWidthNumber.value = '1.0';
  lineWidthNumber.step = '0.1';
  const lineWidthSpan = document.createElement('span');
  lineWidthSpan.id = 'constellation-line-width-value';
  lineWidthSpan.textContent = '1.0';
  lineWidthDiv.appendChild(lineWidthLabel);
  lineWidthDiv.appendChild(lineWidthSlider);
  lineWidthDiv.appendChild(lineWidthNumber);
  lineWidthDiv.appendChild(lineWidthSpan);
  lineWidthDiv.appendChild(document.createTextNode('px'));
  contentDiv.appendChild(lineWidthDiv);

  const nameOpDiv = document.createElement('div');
  nameOpDiv.classList.add('filter-item');
  const nameOpLabel = document.createElement('label');
  nameOpLabel.htmlFor = 'constellation-name-opacity-slider';
  nameOpLabel.textContent = 'Name Opacity:';
  const nameOpSlider = document.createElement('input');
  nameOpSlider.type = 'range';
  nameOpSlider.id = 'constellation-name-opacity-slider';
  nameOpSlider.name = 'constellation-name-opacity';
  nameOpSlider.min = '0';
  nameOpSlider.max = '100';
  nameOpSlider.value = '80';
  nameOpSlider.step = '1';
  const nameOpNumber = document.createElement('input');
  nameOpNumber.type = 'number';
  nameOpNumber.id = 'constellation-name-opacity-number';
  nameOpNumber.name = 'constellation-name-opacity';
  nameOpNumber.min = '0';
  nameOpNumber.max = '100';
  nameOpNumber.value = '80';
  nameOpNumber.step = '1';
  const nameOpSpan = document.createElement('span');
  nameOpSpan.id = 'constellation-name-opacity-value';
  nameOpSpan.textContent = '80';
  nameOpDiv.appendChild(nameOpLabel);
  nameOpDiv.appendChild(nameOpSlider);
  nameOpDiv.appendChild(nameOpNumber);
  nameOpDiv.appendChild(nameOpSpan);
  nameOpDiv.appendChild(document.createTextNode('%'));
  contentDiv.appendChild(nameOpDiv);

  const borderWidthDiv = document.createElement('div');
  borderWidthDiv.classList.add('filter-item');
  const borderWidthLabel = document.createElement('label');
  borderWidthLabel.htmlFor = 'mollweide-border-width-slider';
  borderWidthLabel.textContent = 'Border Width:';
  const borderWidthSlider = document.createElement('input');
  borderWidthSlider.type = 'range';
  borderWidthSlider.id = 'mollweide-border-width-slider';
  borderWidthSlider.name = 'mollweide-border-width';
  borderWidthSlider.min = '0.1';
  borderWidthSlider.max = '10';
  borderWidthSlider.value = '1';
  borderWidthSlider.step = '0.1';
  const borderWidthNumber = document.createElement('input');
  borderWidthNumber.type = 'number';
  borderWidthNumber.id = 'mollweide-border-width-number';
  borderWidthNumber.name = 'mollweide-border-width';
  borderWidthNumber.min = '0.1';
  borderWidthNumber.max = '10';
  borderWidthNumber.value = '1.0';
  borderWidthNumber.step = '0.1';
  const borderWidthSpan = document.createElement('span');
  borderWidthSpan.id = 'mollweide-border-width-value';
  borderWidthSpan.textContent = '1.0';
  borderWidthDiv.appendChild(borderWidthLabel);
  borderWidthDiv.appendChild(borderWidthSlider);
  borderWidthDiv.appendChild(borderWidthNumber);
  borderWidthDiv.appendChild(borderWidthSpan);
  borderWidthDiv.appendChild(document.createTextNode('px'));
  contentDiv.appendChild(borderWidthDiv);

  const borderOpacityDiv = document.createElement('div');
  borderOpacityDiv.classList.add('filter-item');
  const borderOpacityLabel = document.createElement('label');
  borderOpacityLabel.htmlFor = 'mollweide-border-opacity-slider';
  borderOpacityLabel.textContent = 'Border Opacity:';
  const borderOpacitySlider = document.createElement('input');
  borderOpacitySlider.type = 'range';
  borderOpacitySlider.id = 'mollweide-border-opacity-slider';
  borderOpacitySlider.name = 'mollweide-border-opacity';
  borderOpacitySlider.min = '0';
  borderOpacitySlider.max = '100';
  borderOpacitySlider.value = '100';
  borderOpacitySlider.step = '1';
  const borderOpacityNumber = document.createElement('input');
  borderOpacityNumber.type = 'number';
  borderOpacityNumber.id = 'mollweide-border-opacity-number';
  borderOpacityNumber.name = 'mollweide-border-opacity';
  borderOpacityNumber.min = '0';
  borderOpacityNumber.max = '100';
  borderOpacityNumber.value = '100';
  borderOpacityNumber.step = '1';
  const borderOpacitySpan = document.createElement('span');
  borderOpacitySpan.id = 'mollweide-border-opacity-value';
  borderOpacitySpan.textContent = '100';
  borderOpacityDiv.appendChild(borderOpacityLabel);
  borderOpacityDiv.appendChild(borderOpacitySlider);
  borderOpacityDiv.appendChild(borderOpacityNumber);
  borderOpacityDiv.appendChild(borderOpacitySpan);
  borderOpacityDiv.appendChild(document.createTextNode('%'));
  contentDiv.appendChild(borderOpacityDiv);

  fs.appendChild(contentDiv);
  filterForm.appendChild(fs);
}

function addGlobeSurfaceFieldset() {
  const fs = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.classList.add('collapsible');
  legend.textContent = 'Globe Surface';
  fs.appendChild(legend);
  const contentDiv = document.createElement('div');
  contentDiv.classList.add('filter-content');
  contentDiv.style.maxHeight = '0px';
  legend.addEventListener('click', () => {
    legend.classList.toggle('active');
    const isActive = legend.classList.contains('active');
    legend.setAttribute('aria-expanded', isActive);
    contentDiv.style.maxHeight = isActive ? contentDiv.scrollHeight + 'px' : '0px';
  });
  const surfDiv = document.createElement('div');
  surfDiv.classList.add('filter-item');
  const surfChk = document.createElement('input');
  surfChk.type = 'checkbox';
  surfChk.id = 'globe-opaque-surface';
  surfChk.name = 'globe-opaque-surface';
  surfChk.checked = true;
  const surfLbl = document.createElement('label');
  surfLbl.htmlFor = 'globe-opaque-surface';
  surfLbl.textContent = 'Opaque Globe Surface';
  surfDiv.appendChild(surfChk);
  surfDiv.appendChild(surfLbl);
  contentDiv.appendChild(surfDiv);
  fs.appendChild(contentDiv);
  filterForm.appendChild(fs);
}

function addPlanesFieldset() {
  const fs = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.classList.add('collapsible');
  legend.textContent = 'Planes';
  fs.appendChild(legend);

  const contentDiv = document.createElement('div');
  contentDiv.classList.add('filter-content');
  contentDiv.style.maxHeight = '0px';
  legend.addEventListener('click', () => {
    legend.classList.toggle('active');
    const isActive = legend.classList.contains('active');
    legend.setAttribute('aria-expanded', isActive);
    contentDiv.style.maxHeight = isActive ? contentDiv.scrollHeight + 'px' : '0px';
  });

  const galDiv = document.createElement('div');
  galDiv.classList.add('filter-item');
  const galChk = document.createElement('input');
  galChk.type = 'checkbox';
  galChk.id = 'show-galactic-plane';
  galChk.name = 'show-galactic-plane';
  galChk.checked = false;
  const galLbl = document.createElement('label');
  galLbl.htmlFor = 'show-galactic-plane';
  galLbl.textContent = 'Show Galactic Plane';
  galDiv.appendChild(galChk);
  galDiv.appendChild(galLbl);
  contentDiv.appendChild(galDiv);

  const eclDiv = document.createElement('div');
  eclDiv.classList.add('filter-item');
  const eclChk = document.createElement('input');
  eclChk.type = 'checkbox';
  eclChk.id = 'show-ecliptic-plane';
  eclChk.name = 'show-ecliptic-plane';
  eclChk.checked = false;
  const eclLbl = document.createElement('label');
  eclLbl.htmlFor = 'show-ecliptic-plane';
  eclLbl.textContent = 'Show Ecliptic Plane';
  eclDiv.appendChild(eclChk);
  eclDiv.appendChild(eclLbl);
  contentDiv.appendChild(eclDiv);

  const eqDiv = document.createElement('div');
  eqDiv.classList.add('filter-item');
  const eqChk = document.createElement('input');
  eqChk.type = 'checkbox';
  eqChk.id = 'show-celestial-equator';
  eqChk.name = 'show-celestial-equator';
  eqChk.checked = false;
  const eqLbl = document.createElement('label');
  eqLbl.htmlFor = 'show-celestial-equator';
  eqLbl.textContent = 'Show Celestial Equator';
  eqDiv.appendChild(eqChk);
  eqDiv.appendChild(eqLbl);
  contentDiv.appendChild(eqDiv);

  const planeOpDiv = document.createElement('div');
  planeOpDiv.classList.add('filter-item');
  const planeOpLabel = document.createElement('label');
  planeOpLabel.htmlFor = 'plane-opacity-slider';
  planeOpLabel.textContent = 'Plane Opacity:';
  const planeOpSlider = document.createElement('input');
  planeOpSlider.type = 'range';
  planeOpSlider.id = 'plane-opacity-slider';
  planeOpSlider.name = 'plane-opacity';
  planeOpSlider.min = '0';
  planeOpSlider.max = '100';
  planeOpSlider.value = '50';
  planeOpSlider.step = '1';
  const planeOpNumber = document.createElement('input');
  planeOpNumber.type = 'number';
  planeOpNumber.id = 'plane-opacity-number';
  planeOpNumber.name = 'plane-opacity';
  planeOpNumber.min = '0';
  planeOpNumber.max = '100';
  planeOpNumber.value = '50';
  planeOpNumber.step = '1';
  const planeOpSpan = document.createElement('span');
  planeOpSpan.id = 'plane-opacity-value';
  planeOpSpan.textContent = '50';
  planeOpDiv.appendChild(planeOpLabel);
  planeOpDiv.appendChild(planeOpSlider);
  planeOpDiv.appendChild(planeOpNumber);
  planeOpDiv.appendChild(planeOpSpan);
  planeOpDiv.appendChild(document.createTextNode('%'));
  contentDiv.appendChild(planeOpDiv);

  fs.appendChild(contentDiv);
  filterForm.appendChild(fs);
}

export function applyFilters(allStars) {
  if (!filterForm) {
    filterForm = document.getElementById('filters-form');
    if (!filterForm) {
      return {
        filteredStars: allStars,
        connections: [],
        globeFilteredStars: allStars,
        globeConnections: [],
        mollweideFilteredStars: allStars,
        mollweideConnections: [],
        showConstellationBoundaries: false,
        showConstellationNames: false,
        showConstellationOverlay: false,
        globeOpaqueSurface: false,
        enableConnections: false,
        enableIsolationFilter: false,
        enableDensityFilter: false,
        isolation: 5,
        isolationTolerance: 0,
        density: 10,
        densityTopPercent: 10,
        densityBottomPercent: 10,
        densityTolerance: 0,
        densityOpacity: 100,
        densityLineWidth: 30,
        densityFade: 1,
        cloudOpacity: 100,
        starOpacity: 100,
        starNameOpacity: 100,
        connectionOpacity: 50,
        connectionWidth: 5,
        connectionFade: 1,
        connectionLabelSize: 1,
        constellationLineOpacity: 40,
        constellationLineWidth: 1,
        constellationNameOpacity: 80,
        mollweideBorderWidth: 1,
        mollweideBorderOpacity: 100,
        planeOpacity: 50,
        enableIsolationLabeling: false,
        enableDensityLabeling: false,
        minDistance: 0,
        maxDistance: 20,
        isolationGridSize: 1,
        densityGridSize: 1,
        showClouds: false,
        showGalacticPlane: false,
        showEclipticPlane: false,
        showCelestialEquator: false
      };
    }
  }
  const formData = new FormData(filterForm);
  const rawConstellationLineWidth = parseFloat(formData.get('constellation-line-width'));
  const rawMollweideBorderWidth = parseFloat(formData.get('mollweide-border-width'));
  const rawMollweideBorderOpacity = parseFloat(formData.get('mollweide-border-opacity'));
  const filters = {
    size: formData.get('size'),
    color: formData.get('color'),
    opacity: formData.get('opacity'),
    starsShown: formData.get('stars-shown'),
    connections: parseFloat(formData.get('connections')) || 7,
    showConstellationBoundaries: (formData.get('show-constellation-boundaries') !== null),
    showConstellationNames: (formData.get('show-constellation-names') !== null),
    showConstellationOverlay: (formData.get('show-constellation-overlay') !== null),
    globeOpaqueSurface: (formData.get('globe-opaque-surface') !== null),
    enableConnections: (formData.get('enable-connections') !== null),
    enableIsolationFilter: (formData.get('enable-isolation-filter') !== null),
    enableDensityFilter: (formData.get('enable-density-filter') !== null),
    isolation: parseFloat(formData.get('isolation')) || 5,
    isolationTolerance: parseInt(formData.get('isolation-tolerance')) || 0,
    density: parseFloat(formData.get('density')) || 10,
    densityTopPercent: parseFloat(formData.get('density-top-percent')) || 10,
    densityBottomPercent: parseFloat(formData.get('density-bottom-percent')) || 10,
    densityTolerance: parseInt(formData.get('density-tolerance')) || 0,
    enableIsolationLabeling: (formData.get('enable-isolation-labeling') !== null),
    enableDensityLabeling: (formData.get('enable-density-labeling') !== null),
    minDistance: formData.get('min-distance'),
    maxDistance: formData.get('max-distance'),
    isolationGridSize: parseFloat(formData.get('isolation-grid-size')) || 1,
    densityGridSize: parseFloat(formData.get('density-grid-size')) || 1,
    densityOpacity: parseFloat(formData.get('density-opacity')) || 100,
    densityLineWidth: parseFloat(formData.get('density-line-width')) || 30,
    densityFade: parseFloat(formData.get('density-fade')) || 1,
    cloudOpacity: parseFloat(formData.get('cloud-opacity')) || 100,
    cloudDensityRadius: parseFloat(formData.get('cloud-density-radius')) || 5,
    cloudDensityOpacity: parseFloat(formData.get('cloud-density-opacity')) || 100,
    starOpacity: parseFloat(formData.get('star-opacity')) || 100,
    starNameOpacity: parseFloat(formData.get('star-name-opacity')) || 100,
    connectionOpacity: parseFloat(formData.get('connection-opacity')) || 50,
    connectionWidth: parseFloat(formData.get('connection-width')) || 5,
    connectionFade: parseFloat(formData.get('connection-fade')) || 1,
    connectionLabelSize: parseFloat(formData.get('connection-label-size')) || 1,
    constellationLineOpacity: parseFloat(formData.get('constellation-line-opacity')) || 40,
    constellationLineWidth: Number.isFinite(rawConstellationLineWidth) ? rawConstellationLineWidth : 1,
    constellationNameOpacity: parseFloat(formData.get('constellation-name-opacity')) || 80,
    planeOpacity: parseFloat(formData.get('plane-opacity')) || 50,
    mollweideBorderWidth: Number.isFinite(rawMollweideBorderWidth) ? rawMollweideBorderWidth : 1,
    mollweideBorderOpacity: Number.isFinite(rawMollweideBorderOpacity) ? rawMollweideBorderOpacity : 100,
    showClouds: (formData.getAll('dust-clouds').length > 0),
    showCloudDensity: (formData.getAll('dust-density-clouds').length > 0),
    showGalacticPlane: (formData.get('show-galactic-plane') !== null),
    showEclipticPlane: (formData.get('show-ecliptic-plane') !== null),
    showCelestialEquator: (formData.get('show-celestial-equator') !== null),
    stellarClassStarSizes: (() => {
      const out = {};
      ['O','B','A','F','G','K','M','L','T','Y','Other'].forEach(cls => {
        const val = parseFloat(formData.get(`class-${cls}-star-size`));
        out[cls] = isNaN(val) ? 1 : val;
      });
      return out;
    })(),
    stellarClassLabelSizes: (() => {
      const out = {};
      ['O','B','A','F','G','K','M','L','T','Y','Other'].forEach(cls => {
        const val = parseFloat(formData.get(`class-${cls}-label-size`));
        out[cls] = isNaN(val) ? 1 : val;
      });
      return out;
    })()
  };

  let filteredStars = applyDistanceFilter(allStars, filters);
  filteredStars = applyStarsShownFilter(filteredStars, filters);
  filteredStars = applyStellarClassLogic(filteredStars, filterForm);
  filteredStars = applySizeFilter(filteredStars, filters);
  filteredStars = applyColorFilter(filteredStars, filters);
  filteredStars = applyOpacityFilter(filteredStars, filters);

  const globeFiltered = filteredStars.filter(s => s.Common_name_of_the_star !== 'Sol');
  const mollweideFiltered = filteredStars.filter(s => s.Common_name_of_the_star !== 'Sol');
  let pairs = [];
  let globePairs = [];
  let mollweidePairs = [];
  if (filters.enableConnections) {
    pairs = computeConnectionPairs(filteredStars, filters.connections);
    globePairs = computeConnectionPairs(globeFiltered, filters.connections);
    mollweidePairs = computeConnectionPairs(mollweideFiltered, filters.connections);
  }

  applyGlobeSurfaceFilter(filters);

  if (filters.showConstellationOverlay) {
    const constellationOverlay = createConstellationOverlayForGlobe();
    constellationOverlay.forEach(mesh => {
      window.globeMap.scene.add(mesh);
    });
  }

  // --- Isolation Filter Handling ---
  if (filters.enableIsolationFilter) {
    // Compute the grid size from the slider value.
    const gridSize = computeIsolationGridSize(filters.isolationGridSize);
    // Reinitialize overlay if needed.
    if (
      !isolationOverlay ||
      isolationOverlay.minDistance !== parseFloat(filters.minDistance) ||
      isolationOverlay.maxDistance !== parseFloat(filters.maxDistance) ||
      isolationOverlay.gridSize !== gridSize
    ) {
      // Remove any existing meshes.
      if (isolationOverlay) {
        isolationOverlay.cubesData.forEach(cell => {
          if (window.trueCoordinatesMap.scene.children.includes(cell.tcMesh)) {
            window.trueCoordinatesMap.scene.remove(cell.tcMesh);
          }
          if (window.mollweideMap.scene.children.includes(cell.mollweideMesh)) {
            window.mollweideMap.scene.remove(cell.mollweideMesh);
          }
        });
        isolationOverlay.adjacentLines.forEach(obj => {
          if (window.globeMap.scene.children.includes(obj.line)) {
            window.globeMap.scene.remove(obj.line);
          }
          if (window.mollweideMap.scene.children.includes(obj.lineM)) {
            window.mollweideMap.scene.remove(obj.lineM);
          }
        });
      }
      isolationOverlay = initIsolationFilter(filters.minDistance, filters.maxDistance, allStars, gridSize);
      // Add new meshes.
      isolationOverlay.cubesData.forEach(cell => {
        window.trueCoordinatesMap.scene.add(cell.tcMesh);
      });
      isolationOverlay.adjacentLines.forEach(obj => {
        window.globeMap.scene.add(obj.line);
        window.mollweideMap.scene.add(obj.lineM);
      });
    }
    updateIsolationFilter(allStars, isolationOverlay, window.trueCoordinatesMap.scene, window.globeMap.scene, window.mollweideMap.scene);
  } else {
    if (isolationOverlay) {
      isolationOverlay.cubesData.forEach(cell => {
        window.trueCoordinatesMap.scene.remove(cell.tcMesh);
        window.mollweideMap.scene.remove(cell.mollweideMesh);
      });
      isolationOverlay.adjacentLines.forEach(obj => {
        window.globeMap.scene.remove(obj.line);
        window.mollweideMap.scene.remove(obj.lineM);
      });
      isolationOverlay = null;
    }
  }

  // --- Density Filter Handling ---
  if (filters.enableDensityFilter) {
    const gridSize = computeIsolationGridSize(filters.densityGridSize);
    if (
      !densityOverlay ||
      densityOverlay.minDistance !== parseFloat(filters.minDistance) ||
      densityOverlay.maxDistance !== parseFloat(filters.maxDistance) ||
      densityOverlay.gridSize !== gridSize
    ) {
      if (densityOverlay) {
        densityOverlay.cubesData.forEach(cell => {
          window.trueCoordinatesMap.scene.remove(cell.tcMesh);
        });
        densityOverlay.adjacentLines.forEach(obj => {
          window.globeMap.scene.remove(obj.line);
        });
        window.mollweideMap.scene.remove(densityOverlay.textureMesh);
      }
      densityOverlay = initDensityFilter(filters.minDistance, filters.maxDistance, allStars, gridSize);
      densityOverlay.cubesData.forEach(cell => {
        window.trueCoordinatesMap.scene.add(cell.tcMesh);
      });
      densityOverlay.adjacentLines.forEach(obj => {
        window.globeMap.scene.add(obj.line);
      });
      window.mollweideMap.scene.add(densityOverlay.textureMesh);
    }
    updateDensityFilter(allStars, densityOverlay, window.trueCoordinatesMap.scene, window.globeMap.scene, window.mollweideMap.scene);
  } else {
    if (densityOverlay) {
      densityOverlay.cubesData.forEach(cell => {
        window.trueCoordinatesMap.scene.remove(cell.tcMesh);
      });
      densityOverlay.adjacentLines.forEach(obj => {
        window.globeMap.scene.remove(obj.line);
      });
      window.mollweideMap.scene.remove(densityOverlay.textureMesh);
      densityOverlay = null;
    }
  }

  return {
    filteredStars,
    connections: pairs,
    globeFilteredStars: globeFiltered,
    globeConnections: globePairs,
    mollweideFilteredStars: mollweideFiltered,
    mollweideConnections: mollweidePairs,
    showConstellationBoundaries: filters.showConstellationBoundaries,
    showConstellationNames: filters.showConstellationNames,
    showConstellationOverlay: filters.showConstellationOverlay,
    globeOpaqueSurface: filters.globeOpaqueSurface,
    enableConnections: filters.enableConnections,
    enableIsolationFilter: filters.enableIsolationFilter,
    enableDensityFilter: filters.enableDensityFilter,
    isolation: filters.isolation,
    isolationTolerance: filters.isolationTolerance,
    density: filters.density,
    densityTopPercent: filters.densityTopPercent,
    densityBottomPercent: filters.densityBottomPercent,
    densityTolerance: filters.densityTolerance,
    enableIsolationLabeling: filters.enableIsolationLabeling,
    enableDensityLabeling: filters.enableDensityLabeling,
    minDistance: filters.minDistance,
    maxDistance: filters.maxDistance,
    isolationGridSize: filters.isolationGridSize,
    densityGridSize: filters.densityGridSize,
    densityOpacity: filters.densityOpacity,
    densityLineWidth: filters.densityLineWidth,
    densityFade: filters.densityFade,
    cloudOpacity: filters.cloudOpacity,
    cloudDensityRadius: filters.cloudDensityRadius,
    cloudDensityOpacity: filters.cloudDensityOpacity,
    starOpacity: filters.starOpacity,
    starNameOpacity: filters.starNameOpacity,
    connectionOpacity: filters.connectionOpacity,
    connectionWidth: filters.connectionWidth,
    connectionFade: filters.connectionFade,
    connectionLabelSize: filters.connectionLabelSize,
    constellationLineOpacity: filters.constellationLineOpacity,
    constellationLineWidth: filters.constellationLineWidth,
    constellationNameOpacity: filters.constellationNameOpacity,
    planeOpacity: filters.planeOpacity,
    mollweideBorderWidth: filters.mollweideBorderWidth,
    mollweideBorderOpacity: filters.mollweideBorderOpacity,
    showClouds: filters.showClouds,
    showCloudDensity: filters.showCloudDensity,
    showGalacticPlane: filters.showGalacticPlane,
    showEclipticPlane: filters.showEclipticPlane,
    showCelestialEquator: filters.showCelestialEquator,
    isolationOverlay,
    densityOverlay,
    cloudDensityOverlays
  };
}

export { scGenerate as generateStellarClassFilters };
