/**
 * @file Consolidated filter UI initialization.
 * Owns all dynamic filter UI: slider sync, enable/disable groups, fieldset generation,
 * stellar class filters, constellation/globe/plane sections, cloud fieldsets, and fullscreen.
 *
 * Merges former filters/filterUISetup.js into this single file to eliminate UI fragmentation.
 */
import {
  syncSliderPair,
  createCollapsibleFieldset,
  createCheckbox,
  createRangeControl,
  bindCollapsibleTrigger
} from '../../shared/uiFactory.js';
import { loadStellarClassData } from '../../features/filters/logic/stellarClassData.js';
import { generateStellarClassFilters as scGenerate } from '../../features/filters/logic/stellarClassFilter.js';
import { loadConstellationBoundaries, loadConstellationCenters } from '../../features/constellations/constellationRenderer.js';
import { DUST_CLOUDS } from '../../shared/constants.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bindCollapsibleLegend(legend) {
  const content = legend?.nextElementSibling;
  bindCollapsibleTrigger(legend, content);
}

function bindEnableGroup(checkboxId, controlIds) {
  const checkbox = document.getElementById(checkboxId);
  if (!checkbox) return;
  const controls = controlIds.map(id => document.getElementById(id)).filter(Boolean);
  checkbox.addEventListener('change', () => {
    const enabled = checkbox.checked;
    controls.forEach(el => { el.disabled = !enabled; });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Full filter UI setup — called once at startup.
 * Loads stellar class data, generates stellar class UI, builds dynamic fieldsets,
 * wires slider sync, and preloads constellation data.
 */
export async function setupFilterUI(allStars) {
  const filterForm = document.getElementById('filters-form');
  if (!filterForm) {
    console.warn('[setupFilterUI] No #filters-form found in DOM.');
    return;
  }

  try {
    await loadStellarClassData();
    scGenerate(allStars);
    filterForm.querySelectorAll('legend.collapsible').forEach(bindCollapsibleLegend);

    // Dynamic fieldsets
    addConstellationsFieldset(filterForm);
    addGlobeSurfaceFieldset(filterForm);
    addPlanesFieldset(filterForm);
    addCloudsFieldset(filterForm);
    addCloudDensityFieldset(filterForm);

    // Wire all slider sync & enable groups
    initSliderSync();

    await Promise.all([
      loadConstellationBoundaries(),
      loadConstellationCenters()
    ]);
  } catch (error) {
    console.error('[setupFilterUI] Failed to initialize filter UI:', error);
    throw error;
  }
}

/** Re-export so filters/index.js can still reach it. */
export { scGenerate as generateStellarClassFilters };

// ---------------------------------------------------------------------------
// Slider sync & enable/disable wiring
// ---------------------------------------------------------------------------

function initSliderSync() {
  // Mobile sidebar toggle
  const menuToggle = document.getElementById('menu-toggle');
  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      document.querySelector('.sidebar')?.classList.toggle('open');
    });
  }

  // --- Connection controls ---
  bindEnableGroup('enable-connections', [
    'connection-slider', 'connection-number',
    'connection-opacity-slider', 'connection-opacity-number',
    'connection-width-slider', 'connection-width-number',
    'connection-fade-slider', 'connection-fade-number',
    'connection-label-size-slider', 'connection-label-size-number'
  ]);
  syncSliderPair('connection-slider', 'connection-number');
  syncSliderPair('connection-opacity-slider', 'connection-opacity-number', 'connection-opacity-value');
  syncSliderPair('connection-width-slider', 'connection-width-number');
  syncSliderPair('connection-fade-slider', 'connection-fade-number');
  syncSliderPair('connection-label-size-slider', 'connection-label-size-number');

  // --- Isolation filter controls ---
  bindEnableGroup('enable-isolation-filter', [
    'isolation-slider', 'isolation-number',
    'isolation-tolerance-slider',
    'isolation-grid-slider', 'isolation-grid-number'
  ]);
  syncSliderPair('isolation-slider', 'isolation-number', 'isolation-value');
  const isoTolSlider = document.getElementById('isolation-tolerance-slider');
  if (isoTolSlider) {
    isoTolSlider.addEventListener('input', () => {
      const display = document.getElementById('isolation-tolerance-value');
      if (display) display.textContent = isoTolSlider.value;
    });
  }
  syncSliderPair('isolation-grid-slider', 'isolation-grid-number');

  // --- Density filter controls ---
  bindEnableGroup('enable-density-filter', [
    'density-slider', 'density-number',
    'density-tolerance-slider',
    'density-bottom-slider', 'density-bottom-number',
    'density-top-slider', 'density-top-number',
    'density-grid-slider', 'density-grid-number',
    'density-opacity-slider', 'density-opacity-number',
    'density-line-width-slider', 'density-line-width-number',
    'density-fade-slider', 'density-fade-number'
  ]);
  syncSliderPair('density-slider', 'density-number', 'density-value');
  const densTolSlider = document.getElementById('density-tolerance-slider');
  if (densTolSlider) {
    densTolSlider.addEventListener('input', () => {
      const display = document.getElementById('density-tolerance-value');
      if (display) display.textContent = densTolSlider.value;
    });
  }
  syncSliderPair('density-bottom-slider', 'density-bottom-number', 'density-bottom-value');
  syncSliderPair('density-top-slider', 'density-top-number', 'density-top-value');
  syncSliderPair('density-grid-slider', 'density-grid-number');
  syncSliderPair('density-opacity-slider', 'density-opacity-number', 'density-opacity-value');
  syncSliderPair('density-line-width-slider', 'density-line-width-number');
  syncSliderPair('density-fade-slider', 'density-fade-number');

  // --- Star opacity controls ---
  syncSliderPair('star-opacity-slider', 'star-opacity-number', 'star-opacity-value');
  syncSliderPair('star-name-opacity-slider', 'star-name-opacity-number', 'star-name-opacity-value');

  // --- Distance sliders ---
  syncSliderPair('min-distance-slider', 'min-distance-number');
  syncSliderPair('max-distance-slider', 'max-distance-number');

  // --- Constellation additional sliders ---
  syncSliderPair('constellation-line-opacity-slider', 'constellation-line-opacity-number', 'constellation-line-opacity-value');
  bindClampedSlider('constellation-line-width-slider', 'constellation-line-width-number', 'constellation-line-width-value', 0.1, 5);
  syncSliderPair('constellation-name-opacity-slider', 'constellation-name-opacity-number', 'constellation-name-opacity-value');
  bindClampedSlider('mollweide-border-width-slider', 'mollweide-border-width-number', 'mollweide-border-width-value', 0.1, 10);
  syncSliderPair('mollweide-border-opacity-slider', 'mollweide-border-opacity-number', 'mollweide-border-opacity-value');
  syncSliderPair('plane-opacity-slider', 'plane-opacity-number', 'plane-opacity-value');

  // --- Fullscreen ---
  document.querySelectorAll('.fullscreen-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      const canvas = this.parentElement?.querySelector('canvas');
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        canvas?.requestFullscreen().catch(err => {
          console.error('Error enabling fullscreen:', err);
        });
      }
    });
  });

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
      document.querySelectorAll('.map-container canvas').forEach(canvas => {
        canvas.style.width = '';
        canvas.style.height = '';
      });
      window.dispatchEvent(new Event('resize'));
    }
  });
}

/**
 * Binds a slider/number pair with clamped value display.
 */
function bindClampedSlider(sliderId, numberId, spanId, min, max) {
  const slider = document.getElementById(sliderId);
  const number = document.getElementById(numberId);
  const span = document.getElementById(spanId);
  if (!slider || !number || !span) return;
  const update = val => {
    const clamped = Math.min(max, Math.max(min, val));
    const display = clamped.toFixed(1);
    number.value = display;
    span.textContent = display;
    return clamped;
  };
  slider.addEventListener('input', () => {
    const v = parseFloat(slider.value);
    slider.value = update(Number.isFinite(v) ? v : 1).toString();
  });
  number.addEventListener('input', () => {
    const v = parseFloat(number.value);
    slider.value = update(Number.isFinite(v) ? v : 1).toString();
  });
}

// ---------------------------------------------------------------------------
// Dynamic fieldset builders
// ---------------------------------------------------------------------------

function addConstellationsFieldset(filterForm) {
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

function addGlobeSurfaceFieldset(filterForm) {
  const { fieldset, contentDiv } = createCollapsibleFieldset('Globe Surface');
  contentDiv.appendChild(createCheckbox('globe-opaque-surface', 'globe-opaque-surface', 'Opaque Globe Surface', true).container);
  filterForm.appendChild(fieldset);
}

function addPlanesFieldset(filterForm) {
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

function addCloudsFieldset(filterForm) {
  const { fieldset, contentDiv } = createCollapsibleFieldset('Dust Clouds', {
    contentClasses: ['scrollable-category']
  });

  DUST_CLOUDS.forEach(cloud => {
    const { container } = createCheckbox(
      'dust-cloud-' + cloud.name.replace(/\s+/g, '-').toLowerCase(),
      'dust-clouds', cloud.name, false, cloud.file
    );
    contentDiv.appendChild(container);
  });

  const { container: opDiv } = createRangeControl({
    id: 'cloud-opacity-slider', name: 'cloud-opacity',
    label: 'Overlay Opacity:', min: 0, max: 100, value: 100, unit: '%'
  });
  contentDiv.appendChild(opDiv);

  filterForm.appendChild(fieldset);
}

function addCloudDensityFieldset(filterForm) {
  const { fieldset, contentDiv } = createCollapsibleFieldset('Dust Cloud Density', {
    contentClasses: ['scrollable-category']
  });

  // Toggle all button
  const toggleDiv = document.createElement('div');
  toggleDiv.classList.add('filter-item');
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.textContent = 'Toggle All Clouds';
  toggleBtn.addEventListener('click', () => {
    const chks = contentDiv.querySelectorAll("input[name='dust-density-clouds']");
    const allChecked = Array.from(chks).every(c => c.checked);
    chks.forEach(c => {
      c.checked = !allChecked;
      c.dispatchEvent(new Event('change'));
    });
  });
  toggleDiv.appendChild(toggleBtn);
  contentDiv.appendChild(toggleDiv);

  DUST_CLOUDS.forEach(cloud => {
    const { container } = createCheckbox(
      'dust-density-' + cloud.name.replace(/\s+/g, '-').toLowerCase(),
      'dust-density-clouds', cloud.name, false, cloud.file
    );
    contentDiv.appendChild(container);
  });

  const { container: rDiv } = createRangeControl({
    id: 'cloud-density-radius-slider', name: 'cloud-density-radius',
    label: 'Radius:', min: 1, max: 20, value: 5, unit: ' LY'
  });
  contentDiv.appendChild(rDiv);

  const { container: opDiv } = createRangeControl({
    id: 'cloud-density-opacity-slider', name: 'cloud-density-opacity',
    label: 'Overlay Opacity:', min: 0, max: 100, value: 100, unit: '%'
  });
  contentDiv.appendChild(opDiv);

  filterForm.appendChild(fieldset);
}
