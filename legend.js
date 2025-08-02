import { dustCloudColors } from './filters/dustCloudColors.js';

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

async function initLegend() {
  const container = document.getElementById('legend-content');
  if (!container) return;

  await addStarSection(container);
  addLineSection(container);
  addLabelSection(container);
  addDustCloudSection(container);
  addOverlaySection(container);
}

async function addStarSection(container) {
  const section = document.createElement('div');
  section.classList.add('legend-section');
  const heading = document.createElement('h3');
  heading.textContent = 'Stellar Classes';
  section.appendChild(heading);
  const list = document.createElement('ul');

  try {
    const resp = await fetch('./stellar_class.json');
    const data = await resp.json();
    Object.entries(data).forEach(([cls, info]) => {
      const li = document.createElement('li');
      li.classList.add('legend-item');
      const icon = document.createElement('span');
      icon.classList.add('legend-icon', 'star-class-icon');
      const gradient = `radial-gradient(circle, ${hexToRgba(info.color, 1)} 0%, ${hexToRgba(info.color, 0.9)} 30%, ${hexToRgba(info.color, 0.4)} 60%, ${hexToRgba(info.color, 0)} 100%)`;
      icon.style.background = gradient;
      const size = info.size * 2; // scale for visibility
      icon.style.width = `${size}px`;
      icon.style.height = `${size}px`;
      li.appendChild(icon);
      li.appendChild(document.createTextNode(`Class ${cls}`));
      list.appendChild(li);
    });
  } catch (err) {
    console.error('Failed to load stellar class data', err);
  }
  section.appendChild(list);
  container.appendChild(section);
}

function addLineSection(container) {
  const section = document.createElement('div');
  section.classList.add('legend-section');
  const heading = document.createElement('h3');
  heading.textContent = 'Lines';
  section.appendChild(heading);
  const list = document.createElement('ul');

  const connLi = document.createElement('li');
  connLi.classList.add('legend-item');
  const connIcon = document.createElement('span');
  connIcon.classList.add('legend-icon', 'connection-line-icon');
  connLi.appendChild(connIcon);
  connLi.appendChild(document.createTextNode('Connection Lines (thickness varies with distance)'));
  list.appendChild(connLi);

  const constLi = document.createElement('li');
  constLi.classList.add('legend-item');
  const constIcon = document.createElement('span');
  constIcon.classList.add('legend-icon', 'constellation-line-icon');
  constLi.appendChild(constIcon);
  constLi.appendChild(document.createTextNode('Constellation Boundaries'));
  list.appendChild(constLi);

  section.appendChild(list);
  container.appendChild(section);
}

function addLabelSection(container) {
  const section = document.createElement('div');
  section.classList.add('legend-section');
  const heading = document.createElement('h3');
  heading.textContent = 'Labels';
  section.appendChild(heading);
  const list = document.createElement('ul');

  const starLabelLi = document.createElement('li');
  starLabelLi.classList.add('legend-item');
  const starLabelIcon = document.createElement('span');
  starLabelIcon.classList.add('legend-icon', 'star-label-icon');
  starLabelIcon.textContent = 'Sol';
  starLabelLi.appendChild(starLabelIcon);
  starLabelLi.appendChild(document.createTextNode('Star Labels'));
  list.appendChild(starLabelLi);

  const constLabelLi = document.createElement('li');
  constLabelLi.classList.add('legend-item');
  const constLabelIcon = document.createElement('span');
  constLabelIcon.classList.add('legend-icon', 'constellation-label-icon');
  constLabelIcon.textContent = 'Orion';
  constLabelLi.appendChild(constLabelIcon);
  constLabelLi.appendChild(document.createTextNode('Constellation Labels'));
  list.appendChild(constLabelLi);

  section.appendChild(list);
  container.appendChild(section);
}

function addDustCloudSection(container) {
  const section = document.createElement('div');
  section.classList.add('legend-section');
  const heading = document.createElement('h3');
  heading.textContent = 'Dust Clouds';
  section.appendChild(heading);
  const list = document.createElement('ul');

  Object.entries(dustCloudColors).forEach(([name, color]) => {
    const li = document.createElement('li');
    li.classList.add('legend-item');
    const icon = document.createElement('span');
    icon.classList.add('legend-icon', 'dust-cloud-icon');
    icon.style.background = color;
    li.appendChild(icon);
    li.appendChild(document.createTextNode(name));
    list.appendChild(li);
  });

  section.appendChild(list);
  container.appendChild(section);
}

function addOverlaySection(container) {
  const section = document.createElement('div');
  section.classList.add('legend-section');
  const heading = document.createElement('h3');
  heading.textContent = 'Overlays';
  section.appendChild(heading);
  const list = document.createElement('ul');

  const densityLi = document.createElement('li');
  densityLi.classList.add('legend-item');
  const densityIcon = document.createElement('span');
  densityIcon.classList.add('legend-icon', 'density-overlay-icon');
  densityLi.appendChild(densityIcon);
  densityLi.appendChild(document.createTextNode('Density (low→high)'));
  list.appendChild(densityLi);

  const isolationLi = document.createElement('li');
  isolationLi.classList.add('legend-item');
  const isolationIcon = document.createElement('span');
  isolationIcon.classList.add('legend-icon', 'isolation-cell-icon');
  isolationLi.appendChild(isolationIcon);
  isolationLi.appendChild(document.createTextNode('Isolation Cells'));
  list.appendChild(isolationLi);

  const overlayLi = document.createElement('li');
  overlayLi.classList.add('legend-item');
  const overlayIcon = document.createElement('span');
  overlayIcon.classList.add('legend-icon', 'constellation-overlay-icon');
  overlayLi.appendChild(overlayIcon);
  overlayLi.appendChild(document.createTextNode('Constellation Overlay'));
  list.appendChild(overlayLi);

  section.appendChild(list);
  container.appendChild(section);
}

document.addEventListener('DOMContentLoaded', initLegend);
