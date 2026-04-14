/**
 * @file Manages the filter form UI: slider/number synchronization,
 * enable/disable groups, clouds fieldsets, and fullscreen controls.
 */
import { syncSliderPair, createCollapsibleFieldset, createCheckbox, createRangeControl } from '../shared/uiFactory.js';

/**
 * Binds a master checkbox to enable/disable a group of input elements.
 * @param {string} checkboxId - ID of the master enable/disable checkbox.
 * @param {string[]} controlIds - IDs of inputs to toggle.
 */
function bindEnableGroup(checkboxId, controlIds) {
  const checkbox = document.getElementById(checkboxId);
  if (!checkbox) return;
  const controls = controlIds.map(id => document.getElementById(id)).filter(Boolean);
  checkbox.addEventListener('change', () => {
    const enabled = checkbox.checked;
    controls.forEach(el => { el.disabled = !enabled; });
  });
}

export function initFilterUI() {
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

  // --- Dynamic fieldsets ---
  addCloudsFieldset();
  addCloudDensityFieldset();

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

// --- Dust Clouds fieldset ---

const DUST_CLOUDS = [
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
];

function addCloudsFieldset() {
  const filterForm = document.getElementById('filters-form');
  if (!filterForm) return;

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

function addCloudDensityFieldset() {
  const filterForm = document.getElementById('filters-form');
  if (!filterForm) return;

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

export function bindAdditionalOpacitySliders() {
  syncSliderPair('constellation-line-opacity-slider', 'constellation-line-opacity-number', 'constellation-line-opacity-value');

  // Line width with clamping
  const lineWidthSlider = document.getElementById('constellation-line-width-slider');
  const lineWidthNumber = document.getElementById('constellation-line-width-number');
  const lineWidthSpan = document.getElementById('constellation-line-width-value');
  if (lineWidthSlider && lineWidthNumber && lineWidthSpan) {
    const updateWidth = val => {
      const clamped = Math.min(5, Math.max(0.1, val));
      const display = clamped.toFixed(1);
      lineWidthNumber.value = display;
      lineWidthSpan.textContent = display;
      return clamped;
    };
    lineWidthSlider.addEventListener('input', () => {
      const v = parseFloat(lineWidthSlider.value);
      lineWidthSlider.value = updateWidth(Number.isFinite(v) ? v : 1).toString();
    });
    lineWidthNumber.addEventListener('input', () => {
      const v = parseFloat(lineWidthNumber.value);
      lineWidthSlider.value = updateWidth(Number.isFinite(v) ? v : 1).toString();
    });
  }

  syncSliderPair('constellation-name-opacity-slider', 'constellation-name-opacity-number', 'constellation-name-opacity-value');

  // Border width with clamping
  const borderWidthSlider = document.getElementById('mollweide-border-width-slider');
  const borderWidthNumber = document.getElementById('mollweide-border-width-number');
  const borderWidthSpan = document.getElementById('mollweide-border-width-value');
  if (borderWidthSlider && borderWidthNumber && borderWidthSpan) {
    const updateBorderWidth = val => {
      const clamped = Math.min(10, Math.max(0.1, val));
      const display = clamped.toFixed(1);
      borderWidthNumber.value = display;
      borderWidthSpan.textContent = display;
      return clamped;
    };
    borderWidthSlider.addEventListener('input', () => {
      const v = parseFloat(borderWidthSlider.value);
      borderWidthSlider.value = updateBorderWidth(Number.isFinite(v) ? v : 1).toString();
    });
    borderWidthNumber.addEventListener('input', () => {
      const v = parseFloat(borderWidthNumber.value);
      borderWidthSlider.value = updateBorderWidth(Number.isFinite(v) ? v : 1).toString();
    });
  }

  syncSliderPair('mollweide-border-opacity-slider', 'mollweide-border-opacity-number', 'mollweide-border-opacity-value');
  syncSliderPair('plane-opacity-slider', 'plane-opacity-number', 'plane-opacity-value');
}
