/**
 * @file UI factory functions for creating common filter controls.
 * Eliminates duplication across filterUISetup.js, filterUI.js, and stellarClassFilter.js.
 */

/**
 * Creates a collapsible fieldset with legend and content container.
 * @param {string} title - Legend text.
 * @param {Object} [options]
 * @param {string[]} [options.contentClasses] - Extra CSS classes for the content div.
 * @returns {{ fieldset: HTMLFieldSetElement, contentDiv: HTMLDivElement, legend: HTMLLegendElement }}
 */
export function createCollapsibleFieldset(title, { contentClasses = [] } = {}) {
  const fieldset = document.createElement('fieldset');
  const legend = document.createElement('legend');
  legend.classList.add('collapsible');
  legend.textContent = title;
  legend.setAttribute('aria-expanded', 'false');
  fieldset.appendChild(legend);

  const contentDiv = document.createElement('div');
  contentDiv.classList.add('filter-content', ...contentClasses);
  contentDiv.style.maxHeight = '0px';

  legend.addEventListener('click', () => {
    legend.classList.toggle('active');
    const isActive = legend.classList.contains('active');
    legend.setAttribute('aria-expanded', String(isActive));
    contentDiv.style.maxHeight = isActive ? contentDiv.scrollHeight + 'px' : '0px';
  });

  fieldset.appendChild(contentDiv);
  return { fieldset, contentDiv, legend };
}

/**
 * Creates a checkbox control inside a .filter-item div.
 * @param {string} id - Element ID.
 * @param {string} name - Form name attribute.
 * @param {string} labelText - Label text.
 * @param {boolean} [checked=false] - Initial checked state.
 * @param {string} [value] - Optional value attribute.
 * @returns {{ container: HTMLDivElement, checkbox: HTMLInputElement }}
 */
export function createCheckbox(id, name, labelText, checked = false, value) {
  const container = document.createElement('div');
  container.classList.add('filter-item');

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.id = id;
  checkbox.name = name;
  checkbox.checked = checked;
  if (value !== undefined) checkbox.value = value;

  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = labelText;

  container.appendChild(checkbox);
  container.appendChild(label);
  return { container, checkbox };
}

/**
 * Creates a synchronized slider + number input control with optional display span.
 * @param {Object} config
 * @param {string} config.id - Base ID (slider gets this, number gets id + '-number').
 * @param {string} config.name - Form name attribute.
 * @param {string} config.label - Label text.
 * @param {number|string} config.min - Minimum value.
 * @param {number|string} config.max - Maximum value.
 * @param {number|string} config.value - Default value.
 * @param {number|string} [config.step='1'] - Step increment.
 * @param {string} [config.unit=''] - Unit suffix (e.g. '%', 'px', ' LY').
 * @returns {{ container: HTMLDivElement, slider: HTMLInputElement, number: HTMLInputElement, span: HTMLSpanElement|null }}
 */
export function createRangeControl({ id, name, label, min, max, value, step = '1', unit = '' }) {
  const container = document.createElement('div');
  container.classList.add('filter-item');

  const lbl = document.createElement('label');
  lbl.htmlFor = id;
  lbl.textContent = label;
  container.appendChild(lbl);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.id = id;
  slider.name = name;
  slider.min = String(min);
  slider.max = String(max);
  slider.value = String(value);
  slider.step = String(step);
  container.appendChild(slider);

  const number = document.createElement('input');
  number.type = 'number';
  number.id = id + '-number';
  number.name = name;
  number.min = String(min);
  number.max = String(max);
  number.value = String(value);
  number.step = String(step);
  container.appendChild(number);

  let span = null;
  if (unit) {
    span = document.createElement('span');
    span.id = id + '-value';
    span.textContent = String(value);
    container.appendChild(span);
    container.appendChild(document.createTextNode(unit));
  }

  // Synchronize slider <-> number (and optional display span)
  slider.addEventListener('input', () => {
    number.value = slider.value;
    if (span) span.textContent = slider.value;
  });
  number.addEventListener('input', () => {
    slider.value = number.value;
    if (span) span.textContent = number.value;
  });

  return { container, slider, number, span };
}

/**
 * Synchronizes a slider and number input pair by their IDs.
 * Optionally updates a display span element.
 * @param {string} sliderId - ID of the range input.
 * @param {string} numberId - ID of the number input.
 * @param {string} [displayId] - Optional ID of a span to update with the value.
 */
export function syncSliderPair(sliderId, numberId, displayId) {
  const slider = document.getElementById(sliderId);
  const number = document.getElementById(numberId);
  const display = displayId ? document.getElementById(displayId) : null;
  if (!slider || !number) return;

  slider.addEventListener('input', () => {
    number.value = slider.value;
    if (display) display.textContent = slider.value;
  });
  number.addEventListener('input', () => {
    slider.value = number.value;
    if (display) display.textContent = number.value;
  });
}

/**
 * Creates a collapsible subcategory header that expands/collapses its content.
 * @param {string} text - Header text.
 * @param {HTMLElement} subcontentDiv - The content div to toggle.
 * @param {number} [maxScrollHeight=300] - Max height before scrolling.
 * @returns {HTMLHeadingElement}
 */
export function createSubcategoryHeader(text, subcontentDiv, maxScrollHeight = 300) {
  const header = document.createElement('h3');
  header.classList.add('collapsible-subcategory', 'subcategory-header');
  header.textContent = text;
  header.setAttribute('aria-expanded', 'false');

  header.addEventListener('click', () => {
    header.classList.toggle('active');
    const isActive = header.classList.contains('active');
    header.setAttribute('aria-expanded', String(isActive));

    if (isActive) {
      const contentHeight = subcontentDiv.scrollHeight;
      if (contentHeight > maxScrollHeight) {
        subcontentDiv.style.maxHeight = maxScrollHeight + 'px';
        subcontentDiv.style.overflowY = 'auto';
      } else {
        subcontentDiv.style.maxHeight = contentHeight + 'px';
        subcontentDiv.style.overflowY = 'visible';
      }
    } else {
      subcontentDiv.style.maxHeight = '0';
      subcontentDiv.style.overflowY = 'hidden';
    }
  });

  return header;
}

/**
 * Sanitizes a name string for use as an HTML element ID.
 * @param {string} name
 * @returns {string}
 */
export function sanitizeName(name) {
  return (name || '').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-]/g, '');
}
