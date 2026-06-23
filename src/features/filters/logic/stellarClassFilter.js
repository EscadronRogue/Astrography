/**
 * @file Handles stellar class visibility logic and builds the UI subcategories.
 * Star-selection controls render in the main Stars section, while name and
 * class-scale controls render in Preferences / Stars.
 */
import { getPrimaryClass, groupStarsByClass } from '../../../shared/stellarClassUtils.js';
import { getStarId } from '../../../shared/starUtils.js';
import {
  STELLAR_CLASSES,
  STELLAR_CLASS_NAMES,
  STELLAR_CLASS_SET,
  STELLAR_SIZE_SLIDER,
  SUBCATEGORY_MAX_HEIGHT
} from '../../../shared/constants.js';
import {
  createRangeControl,
  createCheckbox,
  createSubcategoryHeader,
  sanitizeName
} from '../../../shared/uiFactory.js';
import { getStellarClassData } from './stellarClassData.js';

function formatLabelDistance(distance) {
  if (!Number.isFinite(distance)) return '';
  const precision = distance >= 100 ? 0 : 1;
  const formatted = distance.toFixed(precision);
  return formatted.endsWith('.0') ? formatted.slice(0, -2) : formatted;
}

function buildDisplayName(star, showDistanceInLabels) {
  const baseName = star.Common_name_of_the_star || star.Common_name_of_the_star_system || '';
  if (!baseName) return '';
  const distance = star.viewpointDistance ?? star.distance;
  if (!showDistanceInLabels || !Number.isFinite(distance)) return baseName;
  return `${baseName} (${formatLabelDistance(distance)})`;
}

export function applyStellarClassLogic(stars, form, filters = {}) {
  const stellarClassShowName = {};
  const stellarClassShowStar = {};
  const showDistanceInLabels = filters.showDistanceInLabels !== false;

  form.querySelectorAll('input[name="stellar-class-show-name"]').forEach(checkbox => {
    stellarClassShowName[checkbox.value] = checkbox.checked;
  });
  form.querySelectorAll('input[name="stellar-class-show-star"]').forEach(checkbox => {
    stellarClassShowStar[checkbox.value] = checkbox.checked;
  });

  const individualShowName = {};
  const individualShowStar = {};

  form.querySelectorAll('input[name="star-show-name"]').forEach(checkbox => {
    individualShowName[checkbox.value] = checkbox.checked;
  });
  form.querySelectorAll('input[name="star-show-star"]').forEach(checkbox => {
    individualShowStar[checkbox.value] = checkbox.checked;
  });

  stars.forEach(star => {
    const primaryClass = getPrimaryClass(star);
    const starKey = getStarId(star);

    const classShowStar = Object.hasOwn(stellarClassShowStar, primaryClass)
      ? stellarClassShowStar[primaryClass]
      : true;
    const starShowStar = Object.hasOwn(individualShowStar, starKey)
      ? individualShowStar[starKey]
      : true;

    star.displayVisible = classShowStar && starShowStar;

    if (!star.displayVisible) {
      star.displayName = '';
      return;
    }

    const classShowName = Object.hasOwn(stellarClassShowName, primaryClass)
      ? stellarClassShowName[primaryClass]
      : true;
    const starShowName = Object.hasOwn(individualShowName, starKey)
      ? individualShowName[starKey]
      : true;

    star.displayName = classShowName && starShowName
      ? buildDisplayName(star, showDistanceInLabels)
      : '';
  });

  return stars.filter(star => star.displayVisible);
}

function createSubcategoryShell(title) {
  const subcategory = document.createElement('div');
  subcategory.classList.add('stellar-class-subcategory');

  const subcontent = document.createElement('div');
  subcontent.classList.add('filter-subcontent', 'subcategory-content');
  subcontent.style.maxHeight = '0';
  subcontent.style.overflowY = 'hidden';

  const header = createSubcategoryHeader(title, subcontent, SUBCATEGORY_MAX_HEIGHT);
  subcategory.appendChild(header);
  return { subcategory, subcontent };
}

function createStarRow(starName, checkboxConfig) {
  const starContainer = document.createElement('div');
  starContainer.classList.add('star-container');

  const starNameLabel = document.createElement('span');
  starNameLabel.textContent = starName;
  starNameLabel.classList.add('star-name');
  starContainer.appendChild(starNameLabel);

  const checkboxRow = document.createElement('div');
  checkboxRow.classList.add('star-checkboxes');

  const { container } = createCheckbox(
    checkboxConfig.id,
    checkboxConfig.name,
    checkboxConfig.label,
    true,
    checkboxConfig.value
  );
  checkboxRow.appendChild(container);
  starContainer.appendChild(checkboxRow);

  return starContainer;
}

function buildSelectionSubcategory(cls, commonName, starsInClass, container) {
  const title = commonName
    ? `${cls} (${commonName}) - ${starsInClass.length}`
    : `${cls} - ${starsInClass.length}`;
  const { subcategory, subcontent } = createSubcategoryShell(title);

  const classControls = document.createElement('div');
  classControls.classList.add('class-level-checkboxes');
  classControls.appendChild(
    createCheckbox(
      `class-${cls}-star`,
      'stellar-class-show-star',
      'Show Stars',
      true,
      cls
    ).container
  );
  subcategory.appendChild(classControls);

  const individualStars = document.createElement('div');
  individualStars.classList.add('individual-stars');

  starsInClass.forEach(star => {
    const starId = getStarId(star);
    const starName = star.Common_name_of_the_star || star.Common_name_of_the_star_system || starId;
    const safeName = sanitizeName(starId);
    individualStars.appendChild(
      createStarRow(starName, {
        id: `star-${safeName}-star`,
        name: 'star-show-star',
        label: 'Show Star',
        value: starId
      })
    );
  });

  subcontent.appendChild(individualStars);
  subcategory.appendChild(subcontent);
  container.appendChild(subcategory);
}

function buildPreferencesSubcategory(cls, commonName, starsInClass, defaultSize, container) {
  const title = commonName
    ? `${cls} (${commonName}) - ${starsInClass.length}`
    : `${cls} - ${starsInClass.length}`;
  const { subcategory, subcontent } = createSubcategoryShell(title);

  const classControls = document.createElement('div');
  classControls.classList.add('class-level-checkboxes');
  classControls.appendChild(
    createCheckbox(
      `class-${cls}-name`,
      'stellar-class-show-name',
      'Show Names',
      true,
      cls
    ).container
  );

  classControls.appendChild(
    createRangeControl({
      id: `class-${cls}-star-size-slider`,
      name: `class-${cls}-star-size`,
      label: 'Star Size:',
      min: STELLAR_SIZE_SLIDER.min,
      max: STELLAR_SIZE_SLIDER.max,
      step: STELLAR_SIZE_SLIDER.step,
      value: defaultSize
    }).container
  );

  classControls.appendChild(
    createRangeControl({
      id: `class-${cls}-label-size-slider`,
      name: `class-${cls}-label-size`,
      label: 'Label Size:',
      min: STELLAR_SIZE_SLIDER.min,
      max: STELLAR_SIZE_SLIDER.max,
      step: STELLAR_SIZE_SLIDER.step,
      value: defaultSize
    }).container
  );

  subcategory.appendChild(classControls);

  const individualStars = document.createElement('div');
  individualStars.classList.add('individual-stars');

  starsInClass.forEach(star => {
    const starId = getStarId(star);
    const starName = star.Common_name_of_the_star || star.Common_name_of_the_star_system || starId;
    const safeName = sanitizeName(starId);
    individualStars.appendChild(
      createStarRow(starName, {
        id: `star-${safeName}-name`,
        name: 'star-show-name',
        label: 'Show Name',
        value: starId
      })
    );
  });

  subcontent.appendChild(individualStars);
  subcategory.appendChild(subcontent);
  container.appendChild(subcategory);
}

function appendGlobalToggle(container, id, name, label) {
  if (!container) return null;

  const controls = document.createElement('div');
  controls.classList.add('class-level-checkboxes');

  const { container: checkboxContainer, checkbox } = createCheckbox(id, name, label, true);
  controls.appendChild(checkboxContainer);
  container.appendChild(controls);
  return checkbox;
}

function appendClassSubcategories(classMap, stellarClassData, selectionContainer, preferencesContainer) {
  STELLAR_CLASSES.forEach(cls => {
    const starsInClass = classMap[cls] || [];
    const defaultSize = stellarClassData[cls]?.size || 1;

    if (selectionContainer) {
      buildSelectionSubcategory(cls, STELLAR_CLASS_NAMES[cls], starsInClass, selectionContainer);
    }
    if (preferencesContainer) {
      buildPreferencesSubcategory(cls, STELLAR_CLASS_NAMES[cls], starsInClass, defaultSize, preferencesContainer);
    }
  });

  const otherStars = [];
  Object.keys(classMap).forEach(key => {
    if (!STELLAR_CLASS_SET.has(key)) {
      otherStars.push(...classMap[key]);
    }
  });

  if (!otherStars.length) return;

  if (selectionContainer) {
    buildSelectionSubcategory('Other', 'Miscellaneous', otherStars, selectionContainer);
  }
  if (preferencesContainer) {
    buildPreferencesSubcategory('Other', 'Miscellaneous', otherStars, 1, preferencesContainer);
  }
}

export function generateStellarClassFilters(stars) {
  const selectionContainer = document.getElementById('stellar-class-selection-container');
  const preferencesContainer = document.getElementById('stellar-class-preferences-container');
  if (!selectionContainer && !preferencesContainer) return;

  if (selectionContainer) {
    selectionContainer.innerHTML = '';
    selectionContainer.classList.add('scrollable-category');
  }
  if (preferencesContainer) {
    preferencesContainer.innerHTML = '';
    preferencesContainer.classList.add('scrollable-category');
  }

  const stellarClassData = getStellarClassData();
  const classMap = groupStarsByClass(stars);

  const allStarsCheckbox = appendGlobalToggle(
    selectionContainer,
    'all-stellar-stars',
    'all-stellar-stars',
    'Show All Stars'
  );
  const allNamesCheckbox = appendGlobalToggle(
    preferencesContainer,
    'all-stellar-names',
    'all-stellar-names',
    'Show All Names'
  );

  appendClassSubcategories(classMap, stellarClassData, selectionContainer, preferencesContainer);

  const form = document.getElementById('filters-form');

  if (allStarsCheckbox) {
    allStarsCheckbox.addEventListener('change', () => {
      const checked = allStarsCheckbox.checked;
      document
        .querySelectorAll('input[name="stellar-class-show-star"], input[name="star-show-star"]')
        .forEach(checkbox => {
          checkbox.checked = checked;
        });

      if (form) {
        form.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }

  if (allNamesCheckbox) {
    allNamesCheckbox.addEventListener('change', () => {
      const checked = allNamesCheckbox.checked;
      document
        .querySelectorAll('input[name="stellar-class-show-name"], input[name="star-show-name"]')
        .forEach(checkbox => {
          checkbox.checked = checked;
        });

      if (form) {
        form.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
  }
}
