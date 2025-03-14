// /ui/filterUI.js
// Manages the UI for the filter form.

export function initFilterUI() {
  // Toggle sidebar menu on mobile.
  document.getElementById('menu-toggle').addEventListener('click', function() {
    document.querySelector('.sidebar').classList.toggle('open');
  });

  // Enable/disable connection slider.
  const enableConnectionsChk = document.getElementById('enable-connections');
  const connectionSlider = document.getElementById('connection-slider');
  const connectionNumber = document.getElementById('connection-number');
  enableConnectionsChk.addEventListener('change', function() {
    const enabled = this.checked;
    connectionSlider.disabled = !enabled;
    connectionNumber.disabled = !enabled;
  });
  connectionSlider.addEventListener('input', function() {
    connectionNumber.value = this.value;
  });
  connectionNumber.addEventListener('input', function() {
    connectionSlider.value = this.value;
  });

  // Isolation Filter UI controls.
  const enableIsolationChk = document.getElementById('enable-isolation-filter');
  const isolationSlider = document.getElementById('isolation-slider');
  const isolationNumber = document.getElementById('isolation-number');
  const isolationToleranceSlider = document.getElementById('isolation-tolerance-slider');
  const isolationGridSlider = document.getElementById('isolation-grid-slider');
  const isolationGridNumber = document.getElementById('isolation-grid-number');
  enableIsolationChk.addEventListener('change', function() {
    const enabled = this.checked;
    isolationSlider.disabled = !enabled;
    isolationNumber.disabled = !enabled;
    isolationToleranceSlider.disabled = !enabled;
    isolationGridSlider.disabled = !enabled;
    isolationGridNumber.disabled = !enabled;
  });
  isolationSlider.addEventListener('input', function() {
    isolationNumber.value = this.value;
    document.getElementById('isolation-value').textContent = this.value;
  });
  isolationNumber.addEventListener('input', function() {
    isolationSlider.value = this.value;
    document.getElementById('isolation-value').textContent = this.value;
  });
  isolationToleranceSlider.addEventListener('input', function() {
    document.getElementById('isolation-tolerance-value').textContent = this.value;
  });
  isolationGridSlider.addEventListener('input', function() {
    isolationGridNumber.value = this.value;
  });
  isolationGridNumber.addEventListener('input', function() {
    isolationGridSlider.value = this.value;
  });

  // Density Filter UI controls – now only the Subdivision Threshold control.
  const enableDensityChk = document.getElementById('enable-density-filter');
  const densitySubdivisionSlider = document.getElementById('density-subdivision-percent-slider');
  const densitySubdivisionNumber = document.getElementById('density-subdivision-percent-number');
  enableDensityChk.addEventListener('change', function() {
    const enabled = this.checked;
    densitySubdivisionSlider.disabled = !enabled;
    densitySubdivisionNumber.disabled = !enabled;
  });
  densitySubdivisionSlider.addEventListener('input', function() {
    densitySubdivisionNumber.value = this.value;
    document.getElementById('density-subdivision-percent-value').textContent = this.value;
  });
  densitySubdivisionNumber.addEventListener('input', function() {
    densitySubdivisionSlider.value = this.value;
    document.getElementById('density-subdivision-percent-value').textContent = this.value;
  });

  // Distance slider sync.
  const minDistanceSlider = document.getElementById('min-distance-slider');
  const minDistanceNumber = document.getElementById('min-distance-number');
  minDistanceSlider.addEventListener('input', function() {
    minDistanceNumber.value = this.value;
  });
  minDistanceNumber.addEventListener('input', function() {
    minDistanceSlider.value = this.value;
  });
  const maxDistanceSlider = document.getElementById('max-distance-slider');
  const maxDistanceNumber = document.getElementById('max-distance-number');
  maxDistanceSlider.addEventListener('input', function() {
    maxDistanceNumber.value = this.value;
  });
  maxDistanceNumber.addEventListener('input', function() {
    maxDistanceSlider.value = this.value;
  });

  // Add Dust Clouds fieldset.
  addCloudsFieldset();

  // Fullscreen button listeners.
  document.querySelectorAll('.fullscreen-btn').forEach(btn => {
    btn.addEventListener('click', function() {
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

  document.addEventListener("fullscreenchange", function() {
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
  
  // Create content container without extra classes to avoid conflicts.
  const contentDiv = document.createElement('div');
  contentDiv.classList.add('filter-content');
  contentDiv.style.maxHeight = '0px';
  contentDiv.style.overflow = 'hidden';
  
  // Toggle open/closed state on legend click.
  legend.addEventListener('click', () => {
    legend.classList.toggle('active');
    const isActive = legend.classList.contains('active');
    legend.setAttribute('aria-expanded', isActive);
    if (isActive) {
      contentDiv.style.maxHeight = contentDiv.scrollHeight + "px";
      contentDiv.style.overflow = 'visible';
    } else {
      contentDiv.style.maxHeight = "0px";
      contentDiv.style.overflow = 'hidden';
    }
  });
  
  // List of dust clouds with unique id and display name.
  const dustClouds = [
    { id: "Aquila_cloud_data", display: "Aquila" },
    { id: "Auriga_cloud_data", display: "Auriga" },
    { id: "Blue_cloud_data", display: "Blue" },
    { id: "Ceti_cloud_data", display: "Ceti" },
    { id: "Dorado_cloud_data", display: "Dorado" },
    { id: "Eridani_cloud_data", display: "Eridani" },
    { id: "Galactic_cloud_data", display: "Galactic" },
    { id: "Gemini_cloud_data", display: "Gemini" },
    { id: "Hyades_cloud_data", display: "Hyades" },
    { id: "Leo_cloud_data", display: "Leo" },
    { id: "Local_interstellar_cloud", display: "Local Interstellar" },
    { id: "Microscopi_cloud_data", display: "Microscopi" },
    { id: "North_Galactic_Pole_cloud_data", display: "North Galactic Pole" },
    { id: "Ophiucus_cloud_data", display: "Ophiucus" },
    { id: "Vela_cloud_data", display: "Vela" }
  ];
  
  // Create a checkbox for each dust cloud (all off by default)
  dustClouds.forEach(cloud => {
    const cloudDiv = document.createElement('div');
    cloudDiv.classList.add('filter-item');
    const cloudChk = document.createElement('input');
    cloudChk.type = 'checkbox';
    cloudChk.id = `dust-cloud-${cloud.id}`;
    cloudChk.name = 'dust-cloud';
    cloudChk.value = cloud.id;
    cloudChk.checked = false;
    const cloudLbl = document.createElement('label');
    cloudLbl.htmlFor = `dust-cloud-${cloud.id}`;
    cloudLbl.textContent = cloud.display;
    cloudDiv.appendChild(cloudChk);
    cloudDiv.appendChild(cloudLbl);
    contentDiv.appendChild(cloudDiv);
  });
  
  fs.appendChild(contentDiv);
  filterForm.appendChild(fs);
}
