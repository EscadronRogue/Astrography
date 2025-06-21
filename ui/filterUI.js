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
  enableConnectionsChk.addEventListener('change', function () {
    const enabled = this.checked;
    connectionSlider.disabled = !enabled;
    connectionNumber.disabled = !enabled;
    connectionOpacitySlider.disabled = !enabled;
    connectionOpacityNumber.disabled = !enabled;
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
  const densityStyleBtn = document.getElementById('density-style-btn');
  if (densityStyleBtn) densityStyleBtn.dataset.style = 'default';
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

  densityStyleBtn.addEventListener('click', function () {
    const old = this.dataset.style === 'old';
    const newStyle = old ? 'default' : 'old';
    this.dataset.style = newStyle;
    this.textContent = newStyle === 'old' ? 'Switch to Default Style' : 'Switch to Old Map Style';
    if (window.densityOverlay && typeof window.densityOverlay.setStyle === 'function') {
      window.densityOverlay.setStyle(newStyle);
      if (window.cachedStars) {
        window.densityOverlay.update(window.cachedStars, window.trueCoordinatesMap.scene, window.globeMap.scene, window.mollweideMap.scene);
      }
    }
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
