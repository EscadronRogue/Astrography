/**
 * @file Sets up the dynamically-generated filter UI sections
 * (Constellations, Globe Surface, Planes).
 */
import { loadStellarClassData } from './stellarClassData.js';
import { generateStellarClassFilters as scGenerate } from './stellarClassFilter.js';
import { loadConstellationBoundaries, loadConstellationCenters } from './constellationFilter.js';
import { bindAdditionalOpacitySliders } from '../ui/filterUI.js';
import {
  createCollapsibleFieldset,
  createCheckbox,
  createRangeControl
} from '../shared/uiFactory.js';

let filterForm = null;

/**
 * Initializes the complete filter UI: stellar classes, constellations, globe, planes.
 * @param {Array} allStars - All loaded star objects.
 */
export async function setupFilterUI(allStars) {
  filterForm = document.getElementById('filters-form');
  if (!filterForm) {
    console.warn('[setupFilterUI] No #filters-form found in DOM!');
    return;
  }

  await loadStellarClassData();
  scGenerate(allStars);

  // Collapse all existing fieldset legends
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

  await loadConstellationBoundaries();
  await loadConstellationCenters();
}

function addConstellationsFieldset() {
  const { fieldset, contentDiv } = createCollapsibleFieldset('Constellations', {
    contentClasses: ['scrollable-category']
  });

  // Checkboxes
  const { container: boundaryDiv } = createCheckbox('show-constellation-boundaries', 'show-constellation-boundaries', 'Show Constellation Boundaries', true);
  contentDiv.appendChild(boundaryDiv);

  const { container: namesDiv } = createCheckbox('show-constellation-names', 'show-constellation-names', 'Show Constellation Names', true);
  contentDiv.appendChild(namesDiv);

  const { container: overlayDiv } = createCheckbox('show-constellation-overlay', 'show-constellation-overlay', 'Show Constellation Overlays', false);
  contentDiv.appendChild(overlayDiv);

  // Range controls
  const { container: lineOpDiv } = createRangeControl({
    id: 'constellation-line-opacity-slider', name: 'constellation-line-opacity',
    label: 'Line Opacity:', min: 0, max: 100, value: 40, unit: '%'
  });
  contentDiv.appendChild(lineOpDiv);

  const { container: lineWidthDiv } = createRangeControl({
    id: 'constellation-line-width-slider', name: 'constellation-line-width',
    label: 'Line Width:', min: 0.1, max: 5, value: 1.0, step: 0.1, unit: 'px'
  });
  contentDiv.appendChild(lineWidthDiv);

  const { container: nameOpDiv } = createRangeControl({
    id: 'constellation-name-opacity-slider', name: 'constellation-name-opacity',
    label: 'Name Opacity:', min: 0, max: 100, value: 80, unit: '%'
  });
  contentDiv.appendChild(nameOpDiv);

  const { container: borderWidthDiv } = createRangeControl({
    id: 'mollweide-border-width-slider', name: 'mollweide-border-width',
    label: 'Border Width:', min: 0.1, max: 10, value: 1.0, step: 0.1, unit: 'px'
  });
  contentDiv.appendChild(borderWidthDiv);

  const { container: borderOpDiv } = createRangeControl({
    id: 'mollweide-border-opacity-slider', name: 'mollweide-border-opacity',
    label: 'Border Opacity:', min: 0, max: 100, value: 100, unit: '%'
  });
  contentDiv.appendChild(borderOpDiv);

  filterForm.appendChild(fieldset);
}

function addGlobeSurfaceFieldset() {
  const { fieldset, contentDiv } = createCollapsibleFieldset('Globe Surface');

  const { container: surfDiv } = createCheckbox('globe-opaque-surface', 'globe-opaque-surface', 'Opaque Globe Surface', true);
  contentDiv.appendChild(surfDiv);

  filterForm.appendChild(fieldset);
}

function addPlanesFieldset() {
  const { fieldset, contentDiv } = createCollapsibleFieldset('Planes');

  const { container: galDiv } = createCheckbox('show-galactic-plane', 'show-galactic-plane', 'Show Galactic Plane', false);
  contentDiv.appendChild(galDiv);

  const { container: eclDiv } = createCheckbox('show-ecliptic-plane', 'show-ecliptic-plane', 'Show Ecliptic Plane', false);
  contentDiv.appendChild(eclDiv);

  const { container: eqDiv } = createCheckbox('show-celestial-equator', 'show-celestial-equator', 'Show Celestial Equator', false);
  contentDiv.appendChild(eqDiv);

  const { container: planeOpDiv } = createRangeControl({
    id: 'plane-opacity-slider', name: 'plane-opacity',
    label: 'Plane Opacity:', min: 0, max: 100, value: 50, unit: '%'
  });
  contentDiv.appendChild(planeOpDiv);

  filterForm.appendChild(fieldset);
}

export { scGenerate as generateStellarClassFilters };
