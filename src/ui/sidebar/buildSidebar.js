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
import { logError, logWarn } from '../../shared/logger.js';

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

function getFullscreenElement() {
  return document.fullscreenElement
    || document.webkitFullscreenElement
    || document.webkitCurrentFullScreenElement
    || document.mozFullScreenElement
    || document.msFullscreenElement
    || null;
}

function isFullscreenSupported(element) {
  return Boolean(
    element?.requestFullscreen
    || element?.webkitRequestFullscreen
    || element?.webkitRequestFullScreen
    || element?.mozRequestFullScreen
    || element?.msRequestFullscreen
  );
}

function requestElementFullscreen(element) {
  const request = element?.requestFullscreen
    || element?.webkitRequestFullscreen
    || element?.webkitRequestFullScreen
    || element?.mozRequestFullScreen
    || element?.msRequestFullscreen;
  if (!request) {
    return Promise.reject(new Error('Fullscreen is not supported by this browser.'));
  }
  return Promise.resolve(request.call(element));
}

function exitDocumentFullscreen() {
  const exit = document.exitFullscreen
    || document.webkitExitFullscreen
    || document.webkitCancelFullScreen
    || document.mozCancelFullScreen
    || document.msExitFullscreen;
  if (!exit) {
    return Promise.reject(new Error('Fullscreen exit is not supported by this browser.'));
  }
  return Promise.resolve(exit.call(document));
}

function bindFullscreenControls() {
  const buttonBindings = Array.from(document.querySelectorAll('.fullscreen-btn')).map(button => {
    const canvas = button.parentElement?.querySelector('canvas');
    if (!canvas || !isFullscreenSupported(canvas)) {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
      button.title = 'Fullscreen is not supported by this browser.';
      return null;
    }

    button.setAttribute('aria-disabled', 'false');
    button.setAttribute('aria-pressed', 'false');
    const handler = () => {
      const activeElement = getFullscreenElement();
      const action = activeElement ? exitDocumentFullscreen() : requestElementFullscreen(canvas);
      action.catch(error => {
        logError('Error toggling fullscreen:', error);
      });
    };
    button.addEventListener('click', handler);
    return { button, canvas, handler };
  }).filter(Boolean);

  const syncFullscreenButtonState = () => {
    const activeElement = getFullscreenElement();
    buttonBindings.forEach(({ button, canvas }) => {
      button.setAttribute('aria-pressed', String(activeElement === canvas));
    });
    if (!activeElement) {
      document.querySelectorAll('.map-container canvas').forEach(canvas => {
        canvas.style.width = '';
        canvas.style.height = '';
      });
      window.dispatchEvent(new Event('resize'));
    }
  };

  const eventNames = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
  eventNames.forEach(eventName => {
    document.addEventListener(eventName, syncFullscreenButtonState);
  });

  return {
    dispose() {
      buttonBindings.forEach(({ button, handler }) => {
        button.removeEventListener('click', handler);
      });
      eventNames.forEach(eventName => {
        document.removeEventListener(eventName, syncFullscreenButtonState);
      });
    }
  };
}

function initSliderSync() {
  const menuToggle = document.getElementById('menu-toggle');
  if (menuToggle) {
    const sidebar = document.getElementById(menuToggle.getAttribute('aria-controls')) || document.querySelector('.sidebar');
    const syncMenuToggleState = () => {
      menuToggle.setAttribute('aria-expanded', String(sidebar?.classList.contains('open') ?? false));
    };
    menuToggle.addEventListener('click', () => {
      sidebar?.classList.toggle('open');
      syncMenuToggleState();
    });
    syncMenuToggleState();
  }

  bindEnableGroup('enable-connections', [
    'connection-opacity-slider', 'connection-opacity-number',
    'connection-width-slider', 'connection-width-number',
    'connection-fade-slider', 'connection-fade-number',
    'connection-label-size-slider', 'connection-label-size-number'
  ]);
  syncSliderPair('connection-slider', 'connection-number');
  syncSliderPair('connection-k-slider', 'connection-k-number');

  // Connection mode: mutual exclusivity of distance vs k-nearest sliders.
  // When connections are enabled, only the active mode's controls are enabled.
  function syncConnectionModeControls() {
    const enabled = document.getElementById('enable-connections')?.checked ?? false;
    const modeRadios = document.querySelectorAll('input[name="connection-mode"]');
    const isKNearest = document.querySelector('input[name="connection-mode"][value="k-nearest"]')?.checked ?? false;

    // Enable/disable radios themselves
    modeRadios.forEach(r => { r.disabled = !enabled; });

    // Distance controls: enabled only in distance mode
    const distEls = ['connection-slider', 'connection-number'];
    distEls.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = !enabled || isKNearest;
    });

    // K-nearest controls: enabled only in k-nearest mode
    const kEls = ['connection-k-slider', 'connection-k-number'];
    kEls.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.disabled = !enabled || !isKNearest;
    });
  }

  document.getElementById('enable-connections')?.addEventListener('change', syncConnectionModeControls);
  document.querySelectorAll('input[name="connection-mode"]').forEach(r => {
    r.addEventListener('change', syncConnectionModeControls);
  });
  syncConnectionModeControls();
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
    'density-opacity-slider', 'density-opacity-number'
  ]);
  syncSliderPair('density-slider', 'density-number', 'density-value');
  bindDisplayOnlySlider('density-tolerance-slider', 'density-tolerance-value');
  syncSliderPair('density-bottom-slider', 'density-bottom-number', 'density-bottom-value');
  syncSliderPair('density-top-slider', 'density-top-number', 'density-top-value');
  syncSliderPair('density-grid-slider', 'density-grid-number');
  syncSliderPair('density-opacity-slider', 'density-opacity-number', 'density-opacity-value');

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

  const fullscreenControls = bindFullscreenControls();

  return {
    dispose() {
      fullscreenControls.dispose();
    }
  };
}

export async function setupFilterUI(allStars) {
  const filterForm = document.getElementById('filters-form');
  if (!filterForm) {
    logWarn('[setupFilterUI] No #filters-form found in DOM.');
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
    document.dispatchEvent(new Event('astrography:filters-ready'));
  } catch (error) {
    logError('[setupFilterUI] Failed to initialize filter UI:', error);
    throw error;
  }
}

export { scGenerate as generateStellarClassFilters };
