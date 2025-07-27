// /ui/filterUI.js
// Manages the UI for the filter form.

export function initFilterUI() {
  // Toggle sidebar menu on mobile.
  document.getElementById('menu-toggle').addEventListener('click', function () {
    document.querySelector('.sidebar').classList.toggle('open');
  });

  // Enable/disable connection slider.
  const enableConnectionsChk = document.getElementById('enable-connections');
  const connectionSlider = document.getElementById('connection-slider');
  const connectionNumber = document.getElementById('connection-number');
  const connectionOpacitySlider = document.getElementById('connection-opacity-slider');
  const connectionOpacityNumber = document.getElementById('connection-opacity-number');
  const connectionWidthSlider = document.getElementById('connection-width-slider');
  const connectionWidthNumber = document.getElementById('connection-width-number');
  const connectionFadeSlider = document.getElementById('connection-fade-slider');
  const connectionFadeNumber = document.getElementById('connection-fade-number');
  enableConnectionsChk.addEventListener('change', function () {
    const enabled = this.checked;
    connectionSlider.disabled = !enabled;
    connectionNumber.disabled = !enabled;
    connectionOpacitySlider.disabled = !enabled;
    connectionOpacityNumber.disabled = !enabled;
    connectionWidthSlider.disabled = !enabled;
    connectionWidthNumber.disabled = !enabled;
    connectionFadeSlider.disabled = !enabled;
    connectionFadeNumber.disabled = !enabled;
  });
  connectionSlider.addEventListener('input', function () {
    connectionNumber.value = this.value;
  });
  connectionNumber.addEventListener('input', function () {
    connectionSlider.value = this.value;
  });
  connectionOpacitySlider.addEventListener('input', function () {
    connectionOpacityNumber.value = this.value;
    document.getElementById('connection-opacity-value').textContent = this.value;
  });
  connectionOpacityNumber.addEventListener('input', function () {
    connectionOpacitySlider.value = this.value;
    document.getElementById('connection-opacity-value').textContent = this.value;
  });
  connectionWidthSlider.addEventListener('input', function () {
    connectionWidthNumber.value = this.value;
  });
  connectionWidthNumber.addEventListener('input', function () {
    connectionWidthSlider.value = this.value;
  });
  connectionFadeSlider.addEventListener('input', function () {
    connectionFadeNumber.value = this.value;
  });
  connectionFadeNumber.addEventListener('input', function () {
    connectionFadeSlider.value = this.value;
  });

  // Isolation Filter UI controls.
  const enableIsolationChk = document.getElementById('enable-isolation-filter');
  const isolationSlider = document.getElementById('isolation-slider');
  const isolationNumber = document.getElementById('isolation-number');
  const isolationToleranceSlider = document.getElementById('isolation-tolerance-slider');
  const isolationGridSlider = document.getElementById('isolation-grid-slider');
  const isolationGridNumber = document.getElementById('isolation-grid-number');
  enableIsolationChk.addEventListener('change', function () {
    const enabled = this.checked;
    isolationSlider.disabled = !enabled;
    isolationNumber.disabled = !enabled;
    isolationToleranceSlider.disabled = !enabled;
    isolationGridSlider.disabled = !enabled;
    isolationGridNumber.disabled = !enabled;
  });
  isolationSlider.addEventListener('input', function () {
    isolationNumber.value = this.value;
    document.getElementById('isolation-value').textContent = this.value;
  });
  isolationNumber.addEventListener('input', function () {
    isolationSlider.value = this.value;
    document.getElementById('isolation-value').textContent = this.value;
  });
  isolationToleranceSlider.addEventListener('input', function () {
    document.getElementById('isolation-tolerance-value').textContent = this.value;
  });
  isolationGridSlider.addEventListener('input', function () {
    isolationGridNumber.value = this.value;
  });
  isolationGridNumber.addEventListener('input', function () {
    isolationGridSlider.value = this.value;
  });

  // Density Filter UI controls (mirrors Isolation Filter configuration).
  const enableDensityChk = document.getElementById('enable-density-filter');
  const densitySlider = document.getElementById('density-slider');
  const densityNumber = document.getElementById('density-number');
  const densityToleranceSlider = document.getElementById('density-tolerance-slider');
  const densityBottomSlider = document.getElementById('density-bottom-slider');
  const densityBottomNumber = document.getElementById('density-bottom-number');
  const densityTopSlider = document.getElementById('density-top-slider');
  const densityTopNumber = document.getElementById('density-top-number');
  const densityGridSlider = document.getElementById('density-grid-slider');
  const densityGridNumber = document.getElementById('density-grid-number');
  const densityOpacitySlider = document.getElementById('density-opacity-slider');
  const densityOpacityNumber = document.getElementById('density-opacity-number');
  const densityLineWidthSlider = document.getElementById('density-line-width-slider');
  const densityLineWidthNumber = document.getElementById('density-line-width-number');
  const densityFadeSlider = document.getElementById('density-fade-slider');
  const densityFadeNumber = document.getElementById('density-fade-number');
  const starOpacitySlider = document.getElementById('star-opacity-slider');
  const starOpacityNumber = document.getElementById('star-opacity-number');
  const starNameOpacitySlider = document.getElementById('star-name-opacity-slider');
  const starNameOpacityNumber = document.getElementById('star-name-opacity-number');
  enableDensityChk.addEventListener('change', function () {
    const enabled = this.checked;
    densitySlider.disabled = !enabled;
    densityNumber.disabled = !enabled;
    densityToleranceSlider.disabled = !enabled;
    densityBottomSlider.disabled = !enabled;
    densityBottomNumber.disabled = !enabled;
    densityTopSlider.disabled = !enabled;
    densityTopNumber.disabled = !enabled;
    densityGridSlider.disabled = !enabled;
    densityGridNumber.disabled = !enabled;
    densityOpacitySlider.disabled = !enabled;
    densityOpacityNumber.disabled = !enabled;
    densityLineWidthSlider.disabled = !enabled;
    densityLineWidthNumber.disabled = !enabled;
    densityFadeSlider.disabled = !enabled;
    densityFadeNumber.disabled = !enabled;
  });
  densitySlider.addEventListener('input', function () {
    densityNumber.value = this.value;
    document.getElementById('density-value').textContent = this.value;
  });
  densityNumber.addEventListener('input', function () {
    densitySlider.value = this.value;
    document.getElementById('density-value').textContent = this.value;
  });
  densityToleranceSlider.addEventListener('input', function () {
    document.getElementById('density-tolerance-value').textContent = this.value;
  });
  densityBottomSlider.addEventListener('input', function () {
    densityBottomNumber.value = this.value;
    document.getElementById('density-bottom-value').textContent = this.value;
  });
  densityBottomNumber.addEventListener('input', function () {
    densityBottomSlider.value = this.value;
    document.getElementById('density-bottom-value').textContent = this.value;
  });
  densityTopSlider.addEventListener('input', function () {
    densityTopNumber.value = this.value;
    document.getElementById('density-top-value').textContent = this.value;
  });
  densityTopNumber.addEventListener('input', function () {
    densityTopSlider.value = this.value;
    document.getElementById('density-top-value').textContent = this.value;
  });
  densityGridSlider.addEventListener('input', function () {
    densityGridNumber.value = this.value;
  });
  densityGridNumber.addEventListener('input', function () {
    densityGridSlider.value = this.value;
  });
  densityOpacitySlider.addEventListener('input', function () {
    densityOpacityNumber.value = this.value;
    document.getElementById('density-opacity-value').textContent = this.value;
  });
  densityOpacityNumber.addEventListener('input', function () {
    densityOpacitySlider.value = this.value;
    document.getElementById('density-opacity-value').textContent = this.value;
  });
  densityLineWidthSlider.addEventListener('input', function () {
    densityLineWidthNumber.value = this.value;
  });
  densityLineWidthNumber.addEventListener('input', function () {
    densityLineWidthSlider.value = this.value;
  });
  densityFadeSlider.addEventListener('input', function () {
    densityFadeNumber.value = this.value;
  });
  densityFadeNumber.addEventListener('input', function () {
    densityFadeSlider.value = this.value;
  });

  starOpacitySlider.addEventListener('input', function () {
    starOpacityNumber.value = this.value;
    document.getElementById('star-opacity-value').textContent = this.value;
  });
  starOpacityNumber.addEventListener('input', function () {
    starOpacitySlider.value = this.value;
    document.getElementById('star-opacity-value').textContent = this.value;
  });
  starNameOpacitySlider.addEventListener('input', function () {
    starNameOpacityNumber.value = this.value;
    document.getElementById('star-name-opacity-value').textContent = this.value;
  });
  starNameOpacityNumber.addEventListener('input', function () {
    starNameOpacitySlider.value = this.value;
    document.getElementById('star-name-opacity-value').textContent = this.value;
  });


  // Distance slider sync.
  const minDistanceSlider = document.getElementById('min-distance-slider');
  const minDistanceNumber = document.getElementById('min-distance-number');
  minDistanceSlider.addEventListener('input', function () {
    minDistanceNumber.value = this.value;
  });
  minDistanceNumber.addEventListener('input', function () {
    minDistanceSlider.value = this.value;
  });
  const maxDistanceSlider = document.getElementById('max-distance-slider');
  const maxDistanceNumber = document.getElementById('max-distance-number');
  maxDistanceSlider.addEventListener('input', function () {
    maxDistanceNumber.value = this.value;
  });
  maxDistanceNumber.addEventListener('input', function () {
    maxDistanceSlider.value = this.value;
  });

  // Add Dust Clouds fieldset.
  addCloudsFieldset();
  addCloudDensityFieldset();

  // Fullscreen button listeners.
  document.querySelectorAll('.fullscreen-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      const mapContainer = this.parentElement;
      const canvas = mapContainer.querySelector('canvas');
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        canvas.requestFullscreen().catch(err => {
          console.error("Error attempting to enable full-screen mode:", err);
        });
      }
    });
  });

  document.addEventListener("fullscreenchange", function () {
    if (!document.fullscreenElement) {
      document.querySelectorAll('.map-container canvas').forEach(canvas => {
        canvas.style.width = "";
        canvas.style.height = "";
      });
      window.dispatchEvent(new Event('resize'));
    }
  });

  console.log("[filterUI] Filter UI initialized.");
}

function addCloudsFieldset() {
  const filterForm = document.getElementById('filters-form');
  const fs = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.classList.add('collapsible');
  legend.textContent = 'Dust Clouds';
  fs.appendChild(legend);
  
  // Create content container with classes matching the constellation category.
  const contentDiv = document.createElement('div');
  contentDiv.classList.add('filter-content', 'scrollable-category');
  contentDiv.style.maxHeight = '0px';
  
  // Toggle open/closed state on legend click (consistent with other filter categories).
  legend.addEventListener('click', () => {
    legend.classList.toggle('active');
    const isActive = legend.classList.contains('active');
    legend.setAttribute('aria-expanded', isActive);
    if (isActive) {
      // Use a timeout to ensure scrollHeight is computed after render.
      setTimeout(() => {
        contentDiv.style.maxHeight = contentDiv.scrollHeight + "px";
      }, 0);
      contentDiv.style.overflowY = 'auto';
    } else {
      contentDiv.style.maxHeight = "0px";
      contentDiv.style.overflowY = 'hidden';
    }
  });
  
  // List of dust clouds and corresponding data file paths.
  const dustClouds = [
    { name: "Aquila", file: "data/Aquila_cloud_data.json" },
    { name: "Auriga", file: "data/Auriga_cloud_data.json" },
    { name: "Blue", file: "data/Blue_cloud_data.json" },
    { name: "Ceti", file: "data/Ceti_cloud_data.json" },
    { name: "Dorado", file: "data/Dorado_cloud_data.json" },
    { name: "Eridani", file: "data/Eridani_cloud_data.json" },
    { name: "Galactic", file: "data/Galactic_cloud_data.json" },
    { name: "Gemini", file: "data/Gemini_cloud_data.json" },
    { name: "Hyades", file: "data/Hyades_cloud_data.json" },
    { name: "Leo", file: "data/Leo_cloud_data.json" },
    { name: "Local Interstellar", file: "data/Local_interstellar_cloud.json" },
    { name: "Microscopi", file: "data/Microscopi_cloud_data.json" },
    { name: "North Galactic Pole", file: "data/North_Galactic_Pole_cloud_data.json" },
    { name: "Ophiucus", file: "data/Ophiucus_cloud_data.json" },
    { name: "Vela", file: "data/Vela_cloud_data.json" }
  ];
  
  // Create a checkbox for each dust cloud.
  dustClouds.forEach(cloud => {
    const cloudDiv = document.createElement('div');
    cloudDiv.classList.add('filter-item');
    const cloudChk = document.createElement('input');
    cloudChk.type = 'checkbox';
    cloudChk.id = 'dust-cloud-' + cloud.name.replace(/\s+/g, '-').toLowerCase();
    cloudChk.name = 'dust-clouds'; // All checkboxes share this name.
    cloudChk.value = cloud.file;
    // All clouds are off by default.
    cloudChk.checked = false;
    const cloudLbl = document.createElement('label');
    cloudLbl.htmlFor = cloudChk.id;
    cloudLbl.textContent = cloud.name;
    cloudDiv.appendChild(cloudChk);
    cloudDiv.appendChild(cloudLbl);
    contentDiv.appendChild(cloudDiv);
  });

  const opDiv = document.createElement('div');
  opDiv.classList.add('filter-item');
  const opLabel = document.createElement('label');
  opLabel.htmlFor = 'cloud-opacity-slider';
  opLabel.textContent = 'Overlay Opacity:';
  const opSlider = document.createElement('input');
  opSlider.type = 'range';
  opSlider.id = 'cloud-opacity-slider';
  opSlider.name = 'cloud-opacity';
  opSlider.min = '0';
  opSlider.max = '100';
  opSlider.value = '100';
  opSlider.step = '1';
  const opNumber = document.createElement('input');
  opNumber.type = 'number';
  opNumber.id = 'cloud-opacity-number';
  opNumber.name = 'cloud-opacity';
  opNumber.min = '0';
  opNumber.max = '100';
  opNumber.value = '100';
  opNumber.step = '1';
  const opSpan = document.createElement('span');
  opSpan.id = 'cloud-opacity-value';
  opSpan.textContent = '100';
  opDiv.appendChild(opLabel);
  opDiv.appendChild(opSlider);
  opDiv.appendChild(opNumber);
  opDiv.appendChild(opSpan);
  opDiv.appendChild(document.createTextNode('%'));
  contentDiv.appendChild(opDiv);

  opSlider.addEventListener('input', () => {
    opNumber.value = opSlider.value;
    opSpan.textContent = opSlider.value;
  });
  opNumber.addEventListener('input', () => {
    opSlider.value = opNumber.value;
    opSpan.textContent = opNumber.value;
  });
  
  fs.appendChild(contentDiv);
  filterForm.appendChild(fs);
}

function addCloudDensityFieldset() {
  const filterForm = document.getElementById('filters-form');
  const fs = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.classList.add('collapsible');
  legend.textContent = 'Dust Cloud Density';
  fs.appendChild(legend);

  const contentDiv = document.createElement('div');
  contentDiv.classList.add('filter-content', 'scrollable-category');
  contentDiv.style.maxHeight = '0px';

  legend.addEventListener('click', () => {
    legend.classList.toggle('active');
    const isActive = legend.classList.contains('active');
    legend.setAttribute('aria-expanded', isActive);
    if (isActive) {
      setTimeout(() => {
        contentDiv.style.maxHeight = contentDiv.scrollHeight + 'px';
      }, 0);
      contentDiv.style.overflowY = 'auto';
    } else {
      contentDiv.style.maxHeight = '0px';
      contentDiv.style.overflowY = 'hidden';
    }
  });

  const dustClouds = [
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

  dustClouds.forEach(cloud => {
    const div = document.createElement('div');
    div.classList.add('filter-item');
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.id = 'dust-density-' + cloud.name.replace(/\s+/g, '-').toLowerCase();
    chk.name = 'dust-density-clouds';
    chk.value = cloud.file;
    chk.checked = false;
    const lbl = document.createElement('label');
    lbl.htmlFor = chk.id;
    lbl.textContent = cloud.name;
    div.appendChild(chk);
    div.appendChild(lbl);
    contentDiv.appendChild(div);
  });

  const rDiv = document.createElement('div');
  rDiv.classList.add('filter-item');
  const rLabel = document.createElement('label');
  rLabel.htmlFor = 'cloud-density-radius-slider';
  rLabel.textContent = 'Radius:';
  const rSlider = document.createElement('input');
  rSlider.type = 'range';
  rSlider.id = 'cloud-density-radius-slider';
  rSlider.name = 'cloud-density-radius';
  rSlider.min = '1';
  rSlider.max = '20';
  rSlider.value = '5';
  rSlider.step = '1';
  const rNumber = document.createElement('input');
  rNumber.type = 'number';
  rNumber.id = 'cloud-density-radius-number';
  rNumber.name = 'cloud-density-radius';
  rNumber.min = '1';
  rNumber.max = '20';
  rNumber.value = '5';
  rNumber.step = '1';
  const rSpan = document.createElement('span');
  rSpan.id = 'cloud-density-radius-value';
  rSpan.textContent = '5';
  rDiv.appendChild(rLabel);
  rDiv.appendChild(rSlider);
  rDiv.appendChild(rNumber);
  rDiv.appendChild(rSpan);
  rDiv.appendChild(document.createTextNode(' LY'));
  contentDiv.appendChild(rDiv);

  rSlider.addEventListener('input', () => {
    rNumber.value = rSlider.value;
    rSpan.textContent = rSlider.value;
  });
  rNumber.addEventListener('input', () => {
    rSlider.value = rNumber.value;
    rSpan.textContent = rNumber.value;
  });

  fs.appendChild(contentDiv);
  filterForm.appendChild(fs);
}

export function bindAdditionalOpacitySliders() {
  const lineOpSlider = document.getElementById('constellation-line-opacity-slider');
  const lineOpNumber = document.getElementById('constellation-line-opacity-number');
  const lineOpSpan = document.getElementById('constellation-line-opacity-value');
  if (lineOpSlider && lineOpNumber && lineOpSpan) {
    lineOpSlider.addEventListener('input', () => {
      lineOpNumber.value = lineOpSlider.value;
      lineOpSpan.textContent = lineOpSlider.value;
    });
    lineOpNumber.addEventListener('input', () => {
      lineOpSlider.value = lineOpNumber.value;
      lineOpSpan.textContent = lineOpNumber.value;
    });
  }

  const nameOpSlider = document.getElementById('constellation-name-opacity-slider');
  const nameOpNumber = document.getElementById('constellation-name-opacity-number');
  const nameOpSpan = document.getElementById('constellation-name-opacity-value');
  if (nameOpSlider && nameOpNumber && nameOpSpan) {
    nameOpSlider.addEventListener('input', () => {
      nameOpNumber.value = nameOpSlider.value;
      nameOpSpan.textContent = nameOpSlider.value;
    });
    nameOpNumber.addEventListener('input', () => {
      nameOpSlider.value = nameOpNumber.value;
      nameOpSpan.textContent = nameOpNumber.value;
    });
  }

  const planeOpSlider = document.getElementById('plane-opacity-slider');
  const planeOpNumber = document.getElementById('plane-opacity-number');
  const planeOpSpan = document.getElementById('plane-opacity-value');
  if (planeOpSlider && planeOpNumber && planeOpSpan) {
    planeOpSlider.addEventListener('input', () => {
      planeOpNumber.value = planeOpSlider.value;
      planeOpSpan.textContent = planeOpSlider.value;
    });
    planeOpNumber.addEventListener('input', () => {
      planeOpSlider.value = planeOpNumber.value;
      planeOpSpan.textContent = planeOpNumber.value;
    });
  }
}
