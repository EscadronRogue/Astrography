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

function bindCollapsibleLegend(legend) {
  const content = legend?.nextElementSibling;
  if (!legend || !content) return;
  content.style.maxHeight = '0px';
  legend.addEventListener('click', () => {
    legend.classList.toggle('active');
    const isActive = legend.classList.contains('active');
    legend.setAttribute('aria-expanded', String(isActive));
    content.style.maxHeight = isActive ? content.scrollHeight + 'px' : '0px';
  });
}

export async function setupFilterUI(allStars) {
  filterForm = document.getElementById('filters-form');
  if (!filterForm) {
    console.warn('[setupFilterUI] No #filters-form found in DOM.');
    return;
  }

  try {
    await loadStellarClassData();
    scGenerate(allStars);
    filterForm.querySelectorAll('legend.collapsible').forEach(bindCollapsibleLegend);

    addConstellationsFieldset();
    addGlobeSurfaceFieldset();
    addPlanesFieldset();
    bindAdditionalOpacitySliders();

    await Promise.all([
      loadConstellationBoundaries(),
      loadConstellationCenters()
    ]);
  } catch (error) {
    console.error('[setupFilterUI] Failed to initialize filter UI:', error);
    throw error;
  }
}

function addConstellationsFieldset() {
  const { fieldset, contentDiv } = createCollapsibleFieldset('Constellations', {
    contentClasses: ['scrollable-category']
  });

  contentDiv.appendChild(createCheckbox('show-constellation-boundaries', 'show-constellation-boundaries', 'Show Constellation Boundaries', true).container);
  contentDiv.appendChild(createCheckbox('show-constellation-names', 'show-constellation-names', 'Show Constellation Names', true).container);
  contentDiv.appendChild(createCheckbox('show-constellation-overlay', 'show-constellation-overlay', 'Show Constellation Overlays', false).container);

  contentDiv.appendChild(createRangeControl({
    id: 'constellation-line-opacity-slider', name: 'constellation-line-opacity',
    label: 'Line Opacity:', min: 0, max: 100, value: 40, unit: '%'
  }).container);

  contentDiv.appendChild(createRangeControl({
    id: 'constellation-line-width-slider', name: 'constellation-line-width',
    label: 'Line Width:', min: 0.1, max: 5, value: 1.0, step: 0.1, unit: 'px'
  }).container);

  contentDiv.appendChild(createRangeControl({
    id: 'constellation-name-opacity-slider', name: 'constellation-name-opacity',
    label: 'Name Opacity:', min: 0, max: 100, value: 80, unit: '%'
  }).container);

  contentDiv.appendChild(createRangeControl({
    id: 'mollweide-border-width-slider', name: 'mollweide-border-width',
    label: 'Border Width:', min: 0.1, max: 10, value: 1.0, step: 0.1, unit: 'px'
  }).container);

  contentDiv.appendChild(createRangeControl({
    id: 'mollweide-border-opacity-slider', name: 'mollweide-border-opacity',
    label: 'Border Opacity:', min: 0, max: 100, value: 100, unit: '%'
  }).container);

  filterForm.appendChild(fieldset);
}

function addGlobeSurfaceFieldset() {
  const { fieldset, contentDiv } = createCollapsibleFieldset('Globe Surface');
  contentDiv.appendChild(createCheckbox('globe-opaque-surface', 'globe-opaque-surface', 'Opaque Globe Surface', true).container);
  filterForm.appendChild(fieldset);
}

function addPlanesFieldset() {
  const { fieldset, contentDiv } = createCollapsibleFieldset('Planes');

  contentDiv.appendChild(createCheckbox('show-galactic-plane', 'show-galactic-plane', 'Show Galactic Plane', false).container);
  contentDiv.appendChild(createCheckbox('show-ecliptic-plane', 'show-ecliptic-plane', 'Show Ecliptic Plane', false).container);
  contentDiv.appendChild(createCheckbox('show-celestial-equator', 'show-celestial-equator', 'Show Celestial Equator', false).container);

  contentDiv.appendChild(createRangeControl({
    id: 'plane-opacity-slider', name: 'plane-opacity',
    label: 'Plane Opacity:', min: 0, max: 100, value: 50, unit: '%'
  }).container);

  filterForm.appendChild(fieldset);
}

export { scGenerate as generateStellarClassFilters };
