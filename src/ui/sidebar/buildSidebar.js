/**
 * @file Consolidated filter UI initialization.
 * Owns dynamic sidebar population for stellar class controls and dust cloud
 * selections, plus slider sync and enable/disable wiring for the static form.
 */
import {
  syncSliderPair,
  createCheckbox,
  bindCollapsibleTrigger
} from '../../shared/uiFactory.js';
import { loadStellarClassData } from '../../features/filters/logic/stellarClassData.js';
import { generateStellarClassFilters as scGenerate } from '../../features/filters/logic/stellarClassFilter.js';
import {
  loadConstellationBoundaries,
  loadConstellationCenters,
  loadConstellationFullNames
} from '../../features/constellations/constellationRenderer.js';
import { DUST_CLOUDS } from '../../shared/constants.js';

function bindCollapsibleLegend(legend) {
  const content = legend?.nextElementSibling;
  bindCollapsibleTrigger(legend, content);
}

function bindEnableGroup(checkboxId, controlIds) {
  const checkbox = document.getElementById(checkboxId);
  if (!checkbox) return;

  const controls = controlIds
    .map(id => document.getElementById(id))
    .filter(Boolean);

  const syncState = () => {
    const enabled = checkbox.checked;
    controls.forEach(el => {
      el.disabled = !enabled;
    });
  };

  checkbox.addEventListener('change', syncState);
  syncState();
}

function bindDisplayOnlySlider(sliderId, displayId) {
  const slider = document.getElementById(sliderId);
  const display = document.getElementById(displayId);
  if (!slider || !display) return;

  const sync = () => {
    display.textContent = slider.value;
  };

  slider.addEventListener('input', sync);
  sync();
}

function bindClampedSlider(sliderId, numberId, spanId, min, max) {
  const slider = document.getElementById(sliderId);
  const number = document.getElementById(numberId);
  const span = document.getElementById(spanId);
  if (!slider || !number || !span) return;

  const update = value => {
    const clamped = Math.min(max, Math.max(min, value));
    const display = clamped.toFixed(1);
    slider.value = display;
    number.value = display;
    span.textContent = display;
  };

  slider.addEventListener('input', () => {
    const parsed = Number.parseFloat(slider.value);
    update(Number.isFinite(parsed) ? parsed : min);
  });

  number.addEventListener('input', () => {
    const parsed = Number.parseFloat(number.value);
    update(Number.isFinite(parsed) ? parsed : min);
  });

  update(Number.parseFloat(slider.value));
}

function populateDustCloudSelection() {
  const container = document.getElementById('dust-cloud-selection-container');
  if (!container) return;

  container.innerHTML = '';
  container.classList.add('scrollable-category');

  DUST_CLOUDS.forEach(cloud => {
    const { container: checkboxRow } = createCheckbox(
      `dust-cloud-${cloud.name.replace(/\s+/g, '-').toLowerCase()}`,
      'dust-clouds',
      cloud.name,
      false,
      cloud.file
    );
    container.appendChild(checkboxRow);
  });
}

function bindToggleAllDustClouds() {
  const button = document.getElementById('toggle-all-dust-clouds');
  if (!button || button.dataset.bound === 'true') return;

  button.dataset.bound = 'true';
  button.addEventListener('click', () => {
    const checkboxes = Array.from(
      document.querySelectorAll("input[name='dust-clouds']")
    );
    const allChecked = checkboxes.length > 0 && checkboxes.every(checkbox => checkbox.checked);

    checkboxes.forEach(checkbox => {
      checkbox.checked = !allChecked;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });
}

function bindDustCloudModeControls() {
  const densityRadio = document.getElementById('dust-cloud-mode-density');
  const legacyRadio = document.getElementById('dust-cloud-mode-legacy');
  if (!densityRadio || !legacyRadio) return;

  const densityControlIds = [
    'cloud-density-radius-slider',
    'cloud-density-radius-number',
    'cloud-density-opacity-slider',
    'cloud-density-opacity-number'
  ];
  const legacyControlIds = [
    'cloud-opacity-slider',
    'cloud-opacity-number'
  ];

  const densityControls = densityControlIds.map(id => document.getElementById(id)).filter(Boolean);
  const legacyControls = legacyControlIds.map(id => document.getElementById(id)).filter(Boolean);

  const syncMode = () => {
    const useDensity = densityRadio.checked;
    densityControls.forEach(control => {
      control.disabled = !useDensity;
    });
    legacyControls.forEach(control => {
      control.disabled = useDensity;
    });
  };

  densityRadio.addEventListener('change', syncMode);
  legacyRadio.addEventListener('change', syncMode);
  syncMode();
}

function initSliderSync() {
  const menuToggle = document.getElementById('menu-toggle');
  if (menuToggle) {
    menuToggle.addEventListener('click', () => {
      document.querySelector('.sidebar')?.classList.toggle('open');
    });
  }

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

  bindEnableGroup('enable-isolation-filter', [
    'isolation-slider', 'isolation-number',
    'isolation-tolerance-slider',
    'isolation-grid-slider', 'isolation-grid-number'
  ]);
  syncSliderPair('isolation-slider', 'isolation-number', 'isolation-value');
  bindDisplayOnlySlider('isolation-tolerance-slider', 'isolation-tolerance-value');
  syncSliderPair('isolation-grid-slider', 'isolation-grid-number');

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
  bindDisplayOnlySlider('density-tolerance-slider', 'density-tolerance-value');
  syncSliderPair('density-bottom-slider', 'density-bottom-number', 'density-bottom-value');
  syncSliderPair('density-top-slider', 'density-top-number', 'density-top-value');
  syncSliderPair('density-grid-slider', 'density-grid-number');
  syncSliderPair('density-opacity-slider', 'density-opacity-number', 'density-opacity-value');
  syncSliderPair('density-line-width-slider', 'density-line-width-number');
  syncSliderPair('density-fade-slider', 'density-fade-number');

  syncSliderPair('star-opacity-slider', 'star-opacity-number', 'star-opacity-value');
  syncSliderPair('star-name-opacity-slider', 'star-name-opacity-number', 'star-name-opacity-value');
  syncSliderPair('min-distance-slider', 'min-distance-number');
  syncSliderPair('max-distance-slider', 'max-distance-number');

  syncSliderPair('cloud-density-radius-slider', 'cloud-density-radius-number');
  syncSliderPair('cloud-density-opacity-slider', 'cloud-density-opacity-number');
  syncSliderPair('cloud-opacity-slider', 'cloud-opacity-number');

  syncSliderPair('constellation-line-opacity-slider', 'constellation-line-opacity-number', 'constellation-line-opacity-value');
  bindClampedSlider('constellation-line-width-slider', 'constellation-line-width-number', 'constellation-line-width-value', 0.1, 5);
  syncSliderPair('constellation-name-opacity-slider', 'constellation-name-opacity-number', 'constellation-name-opacity-value');
  bindClampedSlider('mollweide-border-width-slider', 'mollweide-border-width-number', 'mollweide-border-width-value', 0.1, 10);
  syncSliderPair('mollweide-border-opacity-slider', 'mollweide-border-opacity-number', 'mollweide-border-opacity-value');
  syncSliderPair('plane-opacity-slider', 'plane-opacity-number', 'plane-opacity-value');

  bindToggleAllDustClouds();
  bindDustCloudModeControls();

  document.querySelectorAll('.fullscreen-btn').forEach(button => {
    button.addEventListener('click', function () {
      const canvas = this.parentElement?.querySelector('canvas');
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        canvas?.requestFullscreen().catch(error => {
          console.error('Error enabling fullscreen:', error);
        });
      }
    });
  });

  const onFullscreenChange = () => {
    if (!document.fullscreenElement) {
      document.querySelectorAll('.map-container canvas').forEach(canvas => {
        canvas.style.width = '';
        canvas.style.height = '';
      });
      window.dispatchEvent(new Event('resize'));
    }
  };
  document.addEventListener('fullscreenchange', onFullscreenChange);

  return {
    dispose() {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    }
  };
}

export async function setupFilterUI(allStars) {
  const filterForm = document.getElementById('filters-form');
  if (!filterForm) {
    console.warn('[setupFilterUI] No #filters-form found in DOM.');
    return;
  }

  try {
    await loadStellarClassData();
    populateDustCloudSelection();
    scGenerate(allStars);

    filterForm.querySelectorAll('legend.collapsible').forEach(bindCollapsibleLegend);
    initSliderSync();

    await Promise.all([
      loadConstellationBoundaries(),
      loadConstellationCenters(),
      loadConstellationFullNames()
    ]);
  } catch (error) {
    console.error('[setupFilterUI] Failed to initialize filter UI:', error);
    throw error;
  }
}

export { scGenerate as generateStellarClassFilters };
