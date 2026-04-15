/**
 * @file Handles stellar class visibility logic and builds the UI subcategories.
 * Each spectral class (O, B, A, D, F, G, K, M, L, T, Y, Other) gets a collapsible
 * section with class-level and individual star visibility controls.
 */
import { getStellarClassData } from './stellarClassData.js';
import { getPrimaryClass, groupStarsByClass } from '../../../shared/stellarClassUtils.js';
import { STELLAR_CLASSES, STELLAR_CLASS_NAMES, STELLAR_CLASS_SET, STELLAR_SIZE_SLIDER, SUBCATEGORY_MAX_HEIGHT } from '../../../shared/constants.js';
import { createRangeControl, createCheckbox, createSubcategoryHeader, sanitizeName } from '../../../shared/uiFactory.js';

/**
 * Applies stellar class visibility logic to filter stars and set display names.
 * @param {Array} stars - Array of star objects.
 * @param {HTMLFormElement} form - The filters form element.
 * @returns {Array} Filtered array of visible stars.
 */
export function applyStellarClassLogic(stars, form) {
  const stellarClassShowName = {};
  const stellarClassShowStar = {};

  form.querySelectorAll('input[name="stellar-class-show-name"]').forEach(cb => {
    stellarClassShowName[cb.value] = cb.checked;
  });
  form.querySelectorAll('input[name="stellar-class-show-star"]').forEach(cb => {
    stellarClassShowStar[cb.value] = cb.checked;
  });

  const individualShowName = {};
  const individualShowStar = {};

  form.querySelectorAll('input[name="star-show-name"]').forEach(cb => {
    individualShowName[cb.value] = cb.checked;
  });
  form.querySelectorAll('input[name="star-show-star"]').forEach(cb => {
    individualShowStar[cb.value] = cb.checked;
  });

  stars.forEach(star => {
    const primaryClass = getPrimaryClass(star);
    const starName = star.Common_name_of_the_star || '';

    const classShowStar = Object.hasOwn(stellarClassShowStar, primaryClass)
      ? stellarClassShowStar[primaryClass]
      : true;
    const starShowStar = Object.hasOwn(individualShowStar, starName)
      ? individualShowStar[starName]
      : true;

    star.displayVisible = classShowStar && starShowStar;

    if (!star.displayVisible) {
      star.displayName = '';
      return;
    }

    const classShowName = Object.hasOwn(stellarClassShowName, primaryClass)
      ? stellarClassShowName[primaryClass]
      : true;
    const starShowName = Object.hasOwn(individualShowName, starName)
      ? individualShowName[starName]
      : true;

    if (classShowName && starShowName) {
      star.displayName = starName || star.Common_name_of_the_star_system || '';
    } else {
      star.displayName = '';
    }
  });

  return stars.filter(st => st.displayVisible);
}

// ---------------------------------------------------------------------------
// UI Generation
// ---------------------------------------------------------------------------

/**
 * Builds the UI for a single stellar class subcategory.
 * @param {string} cls - Class letter (e.g. 'O', 'D') or 'Other'.
 * @param {string} commonName - Human-readable name.
 * @param {Array} starsInClass - Stars belonging to this class.
 * @param {number} defaultSize - Default star/label size from stellar class data.
 * @param {HTMLElement} container - Parent DOM element to append to.
 */
function buildSubcategoryUI(cls, commonName, starsInClass, defaultSize, container) {
  const subcatDiv = document.createElement('div');
  subcatDiv.classList.add('stellar-class-subcategory');

  // Star list content (initially collapsed)
  const subcontentDiv = document.createElement('div');
  subcontentDiv.classList.add('filter-subcontent', 'subcategory-content');
  subcontentDiv.style.maxHeight = '0';
  subcontentDiv.style.overflowY = 'hidden';

  // Header
  const headerText = commonName
    ? `${cls} (${commonName}) - ${starsInClass.length}`
    : `${cls} - ${starsInClass.length}`;
  const header = createSubcategoryHeader(headerText, subcontentDiv, SUBCATEGORY_MAX_HEIGHT);
  subcatDiv.appendChild(header);

  // Class-level controls row
  const classControls = document.createElement('div');
  classControls.classList.add('class-level-checkboxes');

  // Show Name / Show Star checkboxes
  const { container: showNameDiv } = createCheckbox(
    `class-${cls}-name`, 'stellar-class-show-name', 'Show Name', true, cls
  );
  classControls.appendChild(showNameDiv);

  const { container: showStarDiv } = createCheckbox(
    `class-${cls}-star`, 'stellar-class-show-star', 'Show Star', true, cls
  );
  classControls.appendChild(showStarDiv);

  // Star size slider
  const { container: starSizeDiv } = createRangeControl({
    id: `class-${cls}-star-size-slider`,
    name: `class-${cls}-star-size`,
    label: 'Star Size:',
    min: STELLAR_SIZE_SLIDER.min,
    max: STELLAR_SIZE_SLIDER.max,
    step: STELLAR_SIZE_SLIDER.step,
    value: defaultSize
  });
  classControls.appendChild(starSizeDiv);

  // Label size slider
  const { container: labelSizeDiv } = createRangeControl({
    id: `class-${cls}-label-size-slider`,
    name: `class-${cls}-label-size`,
    label: 'Label Size:',
    min: STELLAR_SIZE_SLIDER.min,
    max: STELLAR_SIZE_SLIDER.max,
    step: STELLAR_SIZE_SLIDER.step,
    value: defaultSize
  });
  classControls.appendChild(labelSizeDiv);

  subcatDiv.appendChild(classControls);

  // Individual star list
  const individualStarsDiv = document.createElement('div');
  individualStarsDiv.classList.add('individual-stars');

  starsInClass.forEach(star => {
    const starContainer = document.createElement('div');
    starContainer.classList.add('star-container');

    const starNameLabel = document.createElement('span');
    starNameLabel.textContent = star.Common_name_of_the_star;
    starNameLabel.classList.add('star-name');
    starContainer.appendChild(starNameLabel);

    const checkboxesDiv = document.createElement('div');
    checkboxesDiv.classList.add('star-checkboxes');

    const safeName = sanitizeName(star.Common_name_of_the_star);

    const { container: showNameIndiv } = createCheckbox(
      `star-${safeName}-name`, 'star-show-name', 'Show Name', true, star.Common_name_of_the_star
    );
    checkboxesDiv.appendChild(showNameIndiv);

    const { container: showStarIndiv } = createCheckbox(
      `star-${safeName}-star`, 'star-show-star', 'Show Star', true, star.Common_name_of_the_star
    );
    checkboxesDiv.appendChild(showStarIndiv);

    starContainer.appendChild(checkboxesDiv);
    individualStarsDiv.appendChild(starContainer);
  });

  subcontentDiv.appendChild(individualStarsDiv);
  subcatDiv.appendChild(subcontentDiv);
  container.appendChild(subcatDiv);
}

/**
 * Builds the complete stellar class filter UI with subcategories.
 * @param {Array} stars - All loaded star objects.
 */
export function generateStellarClassFilters(stars) {
  const container = document.getElementById('stellar-class-container');
  if (!container) return;
  container.innerHTML = '';
  container.classList.add('scrollable-category');

  const stellarClassData = getStellarClassData();

  // Master toggle checkboxes
  const globalControls = document.createElement('div');
  globalControls.classList.add('class-level-checkboxes');

  const { container: allNamesDiv, checkbox: allNamesChk } = createCheckbox(
    'all-stellar-names', 'all-stellar-names', 'Show All Names', true
  );
  globalControls.appendChild(allNamesDiv);

  const { container: allStarsDiv, checkbox: allStarsChk } = createCheckbox(
    'all-stellar-stars', 'all-stellar-stars', 'Show All Stars', true
  );
  globalControls.appendChild(allStarsDiv);

  container.appendChild(globalControls);

  // Group stars by class
  const classMap = groupStarsByClass(stars);

  // Build UI for each recognized class
  STELLAR_CLASSES.forEach(cls => {
    const arr = classMap[cls] || [];
    const defaultSize = stellarClassData[cls]?.size || 1;
    buildSubcategoryUI(cls, STELLAR_CLASS_NAMES[cls], arr, defaultSize, container);
  });

  // Build UI for unrecognized classes under "Other"
  const otherStars = [];
  Object.keys(classMap).forEach(key => {
    if (!STELLAR_CLASS_SET.has(key)) {
      otherStars.push(...classMap[key]);
    }
  });
  if (otherStars.length) {
    buildSubcategoryUI('Other', 'Miscellaneous', otherStars, 1, container);
  }

  // Global checkbox listeners
  const form = document.getElementById('filters-form');
  allNamesChk.addEventListener('change', () => {
    const checked = allNamesChk.checked;
    container.querySelectorAll('input[name="stellar-class-show-name"], input[name="star-show-name"]').forEach(cb => {
      cb.checked = checked;
    });
    if (form) form.dispatchEvent(new Event('change'));
  });

  allStarsChk.addEventListener('change', () => {
    const checked = allStarsChk.checked;
    container.querySelectorAll('input[name="stellar-class-show-star"], input[name="star-show-star"]').forEach(cb => {
      cb.checked = checked;
    });
    if (form) form.dispatchEvent(new Event('change'));
  });
}
