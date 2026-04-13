// /ui/filterUI.js
// Manages the UI for the filter form.

import { DUST_CLOUDS } from '../app/config.js';
import { bindRangeNumberPair, bindToggleDisabled, makeCollapsibleSection } from '../app/uiHelpers.js';

function setupSidebarToggle() {
  const menuToggle = document.getElementById('menu-toggle');
  const sidebar = document.querySelector('.sidebar');
  if (!menuToggle || !sidebar) return;
  menuToggle.addEventListener('click', function () {
    sidebar.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(sidebar.classList.contains('open')));
  });
}

function setupFullscreenButtons() {
  document.querySelectorAll('.fullscreen-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      const mapContainer = this.closest('.map-container');
      if (!mapContainer) return;
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        mapContainer.requestFullscreen().catch(err => {
          console.error('Error attempting to enable full-screen mode:', err);
        });
      }
    });
  });

  document.addEventListener('fullscreenchange', function () {
    if (!document.fullscreenElement) {
      document.querySelectorAll('.map-container canvas').forEach(canvas => {
        canvas.style.width = '';
        canvas.style.height = '';
      });
      window.dispatchEvent(new Event('resize'));
    }
  });
}

function setupCoreBindings() {
  bindToggleDisabled('enable-connections', [
    'connection-slider', 'connection-number',
    'connection-opacity-slider', 'connection-opacity-number',
    'connection-width-slider', 'connection-width-number',
    'connection-fade-slider', 'connection-fade-number',
    'connection-label-size-slider', 'connection-label-size-number'
  ]);
  bindToggleDisabled('enable-isolation-filter', [
    'isolation-slider', 'isolation-number',
    'isolation-tolerance-slider',
    'isolation-grid-slider', 'isolation-grid-number'
  ]);
  bindToggleDisabled('enable-density-filter', [
    'density-slider', 'density-number',
    'density-tolerance-slider',
    'density-bottom-slider', 'density-bottom-number',
    'density-top-slider', 'density-top-number',
    'density-grid-slider', 'density-grid-number',
    'density-opacity-slider', 'density-opacity-number',
    'density-line-width-slider', 'density-line-width-number',
    'density-fade-slider', 'density-fade-number'
  ]);

  [
    ['connection-slider', 'connection-number'],
    ['connection-width-slider', 'connection-width-number'],
    ['connection-fade-slider', 'connection-fade-number'],
    ['connection-label-size-slider', 'connection-label-size-number'],
    ['isolation-grid-slider', 'isolation-grid-number'],
    ['density-grid-slider', 'density-grid-number'],
    ['density-line-width-slider', 'density-line-width-number'],
    ['density-fade-slider', 'density-fade-number'],
    ['min-distance-slider', 'min-distance-number'],
    ['max-distance-slider', 'max-distance-number']
  ].forEach(([rangeId, numberId]) => bindRangeNumberPair({ rangeId, numberId }));

  [
    ['connection-opacity-slider', 'connection-opacity-number', 'connection-opacity-value'],
    ['isolation-slider', 'isolation-number', 'isolation-value'],
    ['density-slider', 'density-number', 'density-value'],
    ['density-bottom-slider', 'density-bottom-number', 'density-bottom-value'],
    ['density-top-slider', 'density-top-number', 'density-top-value'],
    ['density-opacity-slider', 'density-opacity-number', 'density-opacity-value'],
    ['star-opacity-slider', 'star-opacity-number', 'star-opacity-value'],
    ['star-name-opacity-slider', 'star-name-opacity-number', 'star-name-opacity-value']
  ].forEach(([rangeId, numberId, valueId]) => bindRangeNumberPair({ rangeId, numberId, valueId }));

  const isolationTolerance = document.getElementById('isolation-tolerance-slider');
  if (isolationTolerance) {
    isolationTolerance.addEventListener('input', function () {
      document.getElementById('isolation-tolerance-value').textContent = this.value;
    });
    document.getElementById('isolation-tolerance-value').textContent = isolationTolerance.value;
  }

  const densityTolerance = document.getElementById('density-tolerance-slider');
  if (densityTolerance) {
    densityTolerance.addEventListener('input', function () {
      document.getElementById('density-tolerance-value').textContent = this.value;
    });
    document.getElementById('density-tolerance-value').textContent = densityTolerance.value;
  }
}

function createCloudCheckboxItem(prefix, cloud) {
  const div = document.createElement('div');
  div.classList.add('filter-item');
  const chk = document.createElement('input');
  chk.type = 'checkbox';
  chk.id = `${prefix}-${cloud.name.replace(/\s+/g, '-').toLowerCase()}`;
  chk.name = prefix === 'dust-cloud' ? 'dust-clouds' : 'dust-density-clouds';
  chk.value = cloud.file;
  chk.checked = false;
  const lbl = document.createElement('label');
  lbl.htmlFor = chk.id;
  lbl.textContent = cloud.name;
  div.appendChild(chk);
  div.appendChild(lbl);
  return div;
}

function addCloudsFieldset() {
  const filterForm = document.getElementById('filters-form');
  if (!filterForm) return;
  const fs = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.classList.add('collapsible');
  legend.textContent = 'Dust Clouds';
  fs.appendChild(legend);

  const contentDiv = document.createElement('div');
  contentDiv.classList.add('filter-content', 'scrollable-category');
  makeCollapsibleSection(legend, contentDiv);

  DUST_CLOUDS.forEach(cloud => contentDiv.appendChild(createCloudCheckboxItem('dust-cloud', cloud)));

  const opDiv = document.createElement('div');
  opDiv.classList.add('filter-item');
  opDiv.innerHTML = `
    <label for="cloud-opacity-slider">Overlay Opacity:</label>
    <input type="range" id="cloud-opacity-slider" name="cloud-opacity" min="0" max="100" value="100" step="1" />
    <input type="number" id="cloud-opacity-number" name="cloud-opacity" min="0" max="100" value="100" step="1" />
    <span id="cloud-opacity-value">100</span>%
  `;
  contentDiv.appendChild(opDiv);

  fs.appendChild(contentDiv);
  filterForm.appendChild(fs);
  bindRangeNumberPair({ rangeId: 'cloud-opacity-slider', numberId: 'cloud-opacity-number', valueId: 'cloud-opacity-value' });
}

function addCloudDensityFieldset() {
  const filterForm = document.getElementById('filters-form');
  if (!filterForm) return;
  const fs = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.classList.add('collapsible');
  legend.textContent = 'Dust Cloud Density';
  fs.appendChild(legend);

  const contentDiv = document.createElement('div');
  contentDiv.classList.add('filter-content', 'scrollable-category');
  makeCollapsibleSection(legend, contentDiv);

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

  DUST_CLOUDS.forEach(cloud => contentDiv.appendChild(createCloudCheckboxItem('dust-density', cloud)));

  const radiusDiv = document.createElement('div');
  radiusDiv.classList.add('filter-item');
  radiusDiv.innerHTML = `
    <label for="cloud-density-radius-slider">Radius:</label>
    <input type="range" id="cloud-density-radius-slider" name="cloud-density-radius" min="1" max="20" value="5" step="1" />
    <input type="number" id="cloud-density-radius-number" name="cloud-density-radius" min="1" max="20" value="5" step="1" />
    <span id="cloud-density-radius-value">5</span> LY
  `;
  contentDiv.appendChild(radiusDiv);

  const opacityDiv = document.createElement('div');
  opacityDiv.classList.add('filter-item');
  opacityDiv.innerHTML = `
    <label for="cloud-density-opacity-slider">Overlay Opacity:</label>
    <input type="range" id="cloud-density-opacity-slider" name="cloud-density-opacity" min="0" max="100" value="100" step="1" />
    <input type="number" id="cloud-density-opacity-number" name="cloud-density-opacity" min="0" max="100" value="100" step="1" />
    <span id="cloud-density-opacity-value">100</span>%
  `;
  contentDiv.appendChild(opacityDiv);

  fs.appendChild(contentDiv);
  filterForm.appendChild(fs);
  bindRangeNumberPair({ rangeId: 'cloud-density-radius-slider', numberId: 'cloud-density-radius-number', valueId: 'cloud-density-radius-value' });
  bindRangeNumberPair({ rangeId: 'cloud-density-opacity-slider', numberId: 'cloud-density-opacity-number', valueId: 'cloud-density-opacity-value' });
}

export function initFilterUI() {
  setupSidebarToggle();
  setupCoreBindings();
  addCloudsFieldset();
  addCloudDensityFieldset();
  setupFullscreenButtons();
  console.log('[filterUI] Filter UI initialized.');
}

export function bindAdditionalOpacitySliders() {
  [
    ['constellation-line-opacity-slider', 'constellation-line-opacity-number', 'constellation-line-opacity-value'],
    ['constellation-name-opacity-slider', 'constellation-name-opacity-number', 'constellation-name-opacity-value'],
    ['mollweide-border-opacity-slider', 'mollweide-border-opacity-number', 'mollweide-border-opacity-value'],
    ['plane-opacity-slider', 'plane-opacity-number', 'plane-opacity-value']
  ].forEach(([rangeId, numberId, valueId]) => bindRangeNumberPair({ rangeId, numberId, valueId }));

  bindRangeNumberPair({
    rangeId: 'constellation-line-width-slider',
    numberId: 'constellation-line-width-number',
    valueId: 'constellation-line-width-value',
    formatter: v => Number.parseFloat(v).toFixed(1),
    normalize: v => Math.min(5, Math.max(0.1, Number.parseFloat(v) || 1)).toFixed(1)
  });

  bindRangeNumberPair({
    rangeId: 'mollweide-border-width-slider',
    numberId: 'mollweide-border-width-number',
    valueId: 'mollweide-border-width-value',
    formatter: v => Number.parseFloat(v).toFixed(1),
    normalize: v => Math.min(10, Math.max(0.1, Number.parseFloat(v) || 1)).toFixed(1)
  });
}
