/**
 * Handles "Stellar Class" logic for showing/hiding star names and star objects themselves.
 * Also exports `generateStellarClassFilters` to build the UI subcategories (O,B,A,F,G,K,M,L,T,Y).
 */
import { getStellarClassData } from './stellarClassData.js';

export function applyStellarClassLogic(stars, form) {
  // Collect checkboxes from the form
  const stellarClassShowName = {};
  const stellarClassShowStar = {};

  // Class-level "Show Name" / "Show Star"
  const classNameCheckboxes = form.querySelectorAll(`input[name="stellar-class-show-name"]`);
  classNameCheckboxes.forEach(checkbox => {
    stellarClassShowName[checkbox.value] = checkbox.checked;
  });

  const classStarCheckboxes = form.querySelectorAll(`input[name="stellar-class-show-star"]`);
  classStarCheckboxes.forEach(checkbox => {
    stellarClassShowStar[checkbox.value] = checkbox.checked;
  });

  // Individual star-level "Show Name" / "Show Star"
  const individualShowName = {};
  const individualShowStar = {};

  const starNameCheckboxes = form.querySelectorAll(`input[name="star-show-name"]`);
  starNameCheckboxes.forEach(chk => {
    individualShowName[chk.value] = chk.checked;
  });

  const starStarCheckboxes = form.querySelectorAll(`input[name="star-show-star"]`);
  starStarCheckboxes.forEach(chk => {
    individualShowStar[chk.value] = chk.checked;
  });

  // Apply logic to each star
  const recognizedClasses = new Set(['O','B','A','F','G','K','M','L','T','Y']);

  stars.forEach(star => {
    let primaryClass = 'Other';
    if (star.Stellar_class && typeof star.Stellar_class === 'string') {
      const candidate = star.Stellar_class.charAt(0).toUpperCase();
      primaryClass = recognizedClasses.has(candidate) ? candidate : 'Other';
    }

    // Use only the common name of the individual star for display, ignoring the star system name.
    const starName = star.Common_name_of_the_star || '';
    // Determine visibility based on checkboxes
    const classShowStar = stellarClassShowStar.hasOwnProperty(primaryClass)
      ? stellarClassShowStar[primaryClass]
      : true;
    const starShowStar = individualShowStar.hasOwnProperty(starName)
      ? individualShowStar[starName]
      : true;

    star.displayVisible = classShowStar && starShowStar;

    if (!star.displayVisible) {
      star.displayName = '';
      return;
    }

    // Decide if star name is displayed based on checkboxes
    const classShowName = stellarClassShowName.hasOwnProperty(primaryClass)
      ? stellarClassShowName[primaryClass]
      : true;
    const starShowName = individualShowName.hasOwnProperty(starName)
      ? individualShowName[starName]
      : true;

    if (classShowName && starShowName) {
      if (starName) {
        star.displayName = starName;
      } else if (star.Common_name_of_the_star_system) {
        star.displayName = star.Common_name_of_the_star_system;
      } else {
        star.displayName = '';
      }
    } else {
      star.displayName = '';
    }
  });

  // Filter out invisible stars
  return stars.filter(st => st.displayVisible);
}

/**
 * Builds UI for the stellar class subcategories.
 *  - Each subcategory line has:
 *    -> A visually distinct header (subcategory title) that is clickable to expand/collapse the star list.
 *    -> The star list is wrapped in a scrollable sidebar if needed.
 */
export function generateStellarClassFilters(stars) {
  const container = document.getElementById('stellar-class-container');
  container.innerHTML = ''; // Clear previous
  // Wrap the whole category in a scrollable container (sidebar) if content exceeds a fixed height.
  container.classList.add('scrollable-category');
  const stellarClassData = getStellarClassData();

  // Master checkboxes to toggle visibility of all star names and stars.
  const globalControls = document.createElement('div');
  globalControls.classList.add('class-level-checkboxes');

  const allNamesDiv = document.createElement('div');
  allNamesDiv.classList.add('filter-item');
  const allNamesChk = document.createElement('input');
  allNamesChk.type = 'checkbox';
  allNamesChk.id = 'all-stellar-names';
  allNamesChk.checked = true;
  const allNamesLbl = document.createElement('label');
  allNamesLbl.htmlFor = 'all-stellar-names';
  allNamesLbl.textContent = 'Show All Names';
  allNamesDiv.appendChild(allNamesChk);
  allNamesDiv.appendChild(allNamesLbl);
  globalControls.appendChild(allNamesDiv);

  const allStarsDiv = document.createElement('div');
  allStarsDiv.classList.add('filter-item');
  const allStarsChk = document.createElement('input');
  allStarsChk.type = 'checkbox';
  allStarsChk.id = 'all-stellar-stars';
  allStarsChk.checked = true;
  const allStarsLbl = document.createElement('label');
  allStarsLbl.htmlFor = 'all-stellar-stars';
  allStarsLbl.textContent = 'Show All Stars';
  allStarsDiv.appendChild(allStarsChk);
  allStarsDiv.appendChild(allStarsLbl);
  globalControls.appendChild(allStarsDiv);

  container.appendChild(globalControls);

  // Group stars by class
  const classMap = {};
  stars.forEach(star => {
    const primaryClass = (star.Stellar_class && typeof star.Stellar_class === 'string')
      ? star.Stellar_class.charAt(0).toUpperCase()
      : 'Other';
    if (!classMap[primaryClass]) {
      classMap[primaryClass] = [];
    }
    classMap[primaryClass].push(star);
  });

  // List of known classes
  const stellarClasses = [
    { class: 'O', commonName: 'Blue Giant' },
    { class: 'B', commonName: 'Blue-White Dwarf' },
    { class: 'A', commonName: 'White Dwarf' },
    { class: 'F', commonName: 'Yellow-White Dwarf' },
    { class: 'G', commonName: 'Yellow Dwarf' },
    { class: 'K', commonName: 'Orange Dwarf' },
    { class: 'M', commonName: 'Red Dwarf' },
    { class: 'L', commonName: 'Brown Dwarf' },
    { class: 'T', commonName: 'Cool Brown Dwarf' },
    { class: 'Y', commonName: 'Ultra Cool Brown Dwarf' }
  ];

  const recognizedSet = new Set(stellarClasses.map(s => s.class));

  stellarClasses.forEach(clsObj => {
    const cls = clsObj.class;
    const cName = clsObj.commonName;
    const arr = classMap[cls] || [];
    const starCount = arr.length;
    const defaultSize = (stellarClassData[cls]?.size) || 1;

    // Outer container for this subcategory
    const subcatDiv = document.createElement('div');
    subcatDiv.classList.add('stellar-class-subcategory');

    // 1) The subcategory header (visually distinct)
    const header = document.createElement('h3');
    header.classList.add('collapsible-subcategory', 'subcategory-header');
    header.textContent = `${cls} (${cName}) - ${starCount}`;
    subcatDiv.appendChild(header);

    // 2) Class-level checkboxes row (always visible)
    const classCheckboxesDiv = document.createElement('div');
    classCheckboxesDiv.classList.add('class-level-checkboxes');

    // "Show Name" for the entire class
    const showNameDiv = document.createElement('div');
    showNameDiv.classList.add('filter-item');
    const showNameCheckbox = document.createElement('input');
    showNameCheckbox.type = 'checkbox';
    showNameCheckbox.id = `class-${cls}-name`;
    showNameCheckbox.name = 'stellar-class-show-name';
    showNameCheckbox.value = cls;
    showNameCheckbox.checked = true;
    const showNameLabel = document.createElement('label');
    showNameLabel.htmlFor = `class-${cls}-name`;
    showNameLabel.textContent = 'Show Name';
    showNameDiv.appendChild(showNameCheckbox);
    showNameDiv.appendChild(showNameLabel);
    classCheckboxesDiv.appendChild(showNameDiv);

    // "Show Star" for the entire class
    const showStarDiv = document.createElement('div');
    showStarDiv.classList.add('filter-item');
    const showStarCheckbox = document.createElement('input');
    showStarCheckbox.type = 'checkbox';
    showStarCheckbox.id = `class-${cls}-star`;
    showStarCheckbox.name = 'stellar-class-show-star';
    showStarCheckbox.value = cls;
    showStarCheckbox.checked = true;
    const showStarLabel = document.createElement('label');
    showStarLabel.htmlFor = `class-${cls}-star`;
    showStarLabel.textContent = 'Show Star';
    showStarDiv.appendChild(showStarCheckbox);
    showStarDiv.appendChild(showStarLabel);
    classCheckboxesDiv.appendChild(showStarDiv);

    // Star size slider
    const starSizeDiv = document.createElement('div');
    starSizeDiv.classList.add('filter-item');
    const starSizeLabel = document.createElement('label');
    starSizeLabel.htmlFor = `class-${cls}-star-size-slider`;
    starSizeLabel.textContent = 'Star Size:';
    const starSizeSlider = document.createElement('input');
    starSizeSlider.type = 'range';
    starSizeSlider.id = `class-${cls}-star-size-slider`;
    starSizeSlider.name = `class-${cls}-star-size`;
    starSizeSlider.min = '0.1';
    starSizeSlider.max = '15';
    starSizeSlider.step = '0.1';
    starSizeSlider.value = defaultSize;
    const starSizeNumber = document.createElement('input');
    starSizeNumber.type = 'number';
    starSizeNumber.id = `class-${cls}-star-size-number`;
    starSizeNumber.name = `class-${cls}-star-size`;
    starSizeNumber.min = '0.1';
    starSizeNumber.max = '15';
    starSizeNumber.step = '0.1';
    starSizeNumber.value = defaultSize;
    starSizeDiv.appendChild(starSizeLabel);
    starSizeDiv.appendChild(starSizeSlider);
    starSizeDiv.appendChild(starSizeNumber);
    classCheckboxesDiv.appendChild(starSizeDiv);

    starSizeSlider.addEventListener('input', () => {
      starSizeNumber.value = starSizeSlider.value;
    });
    starSizeNumber.addEventListener('input', () => {
      starSizeSlider.value = starSizeNumber.value;
    });

    // Label size slider
    const labelSizeDiv = document.createElement('div');
    labelSizeDiv.classList.add('filter-item');
    const labelSizeLabel = document.createElement('label');
    labelSizeLabel.htmlFor = `class-${cls}-label-size-slider`;
    labelSizeLabel.textContent = 'Label Size:';
    const labelSizeSlider = document.createElement('input');
    labelSizeSlider.type = 'range';
    labelSizeSlider.id = `class-${cls}-label-size-slider`;
    labelSizeSlider.name = `class-${cls}-label-size`;
    labelSizeSlider.min = '0.1';
    labelSizeSlider.max = '15';
    labelSizeSlider.step = '0.1';
    labelSizeSlider.value = defaultSize;
    const labelSizeNumber = document.createElement('input');
    labelSizeNumber.type = 'number';
    labelSizeNumber.id = `class-${cls}-label-size-number`;
    labelSizeNumber.name = `class-${cls}-label-size`;
    labelSizeNumber.min = '0.1';
    labelSizeNumber.max = '15';
    labelSizeNumber.step = '0.1';
    labelSizeNumber.value = defaultSize;
    labelSizeDiv.appendChild(labelSizeLabel);
    labelSizeDiv.appendChild(labelSizeSlider);
    labelSizeDiv.appendChild(labelSizeNumber);
    classCheckboxesDiv.appendChild(labelSizeDiv);

    labelSizeSlider.addEventListener('input', () => {
      labelSizeNumber.value = labelSizeSlider.value;
    });
    labelSizeNumber.addEventListener('input', () => {
      labelSizeSlider.value = labelSizeNumber.value;
    });

    subcatDiv.appendChild(classCheckboxesDiv);

    // 3) The star list subcontent (initially closed)
    const subcontentDiv = document.createElement('div');
    subcontentDiv.classList.add('filter-subcontent', 'subcategory-content');
    subcontentDiv.style.maxHeight = '0';
    subcontentDiv.style.overflowY = 'hidden';

    const individualStarsDiv = document.createElement('div');
    individualStarsDiv.classList.add('individual-stars');

    arr.forEach(star => {
      let formattedName = star.Common_name_of_the_star;
      const starContainer = document.createElement('div');
      starContainer.classList.add('star-container');

      const starNameLabel = document.createElement('span');
      starNameLabel.textContent = formattedName;
      starNameLabel.classList.add('star-name');
      starContainer.appendChild(starNameLabel);

      const checkboxesDiv = document.createElement('div');
      checkboxesDiv.classList.add('star-checkboxes');

      // "Show Name"
      const individualShowNameDiv = document.createElement('div');
      individualShowNameDiv.classList.add('filter-item');
      const individualShowNameCheckbox = document.createElement('input');
      individualShowNameCheckbox.type = 'checkbox';
      individualShowNameCheckbox.id = `star-${sanitizeName(star.Common_name_of_the_star)}-name`;
      individualShowNameCheckbox.name = 'star-show-name';
      individualShowNameCheckbox.value = star.Common_name_of_the_star;
      individualShowNameCheckbox.checked = true;
      const individualShowNameLabel = document.createElement('label');
      individualShowNameLabel.htmlFor = `star-${sanitizeName(star.Common_name_of_the_star)}-name`;
      individualShowNameLabel.textContent = 'Show Name';
      individualShowNameDiv.appendChild(individualShowNameCheckbox);
      individualShowNameDiv.appendChild(individualShowNameLabel);
      checkboxesDiv.appendChild(individualShowNameDiv);

      // "Show Star"
      const individualShowStarDiv = document.createElement('div');
      individualShowStarDiv.classList.add('filter-item');
      const individualShowStarCheckbox = document.createElement('input');
      individualShowStarCheckbox.type = 'checkbox';
      individualShowStarCheckbox.id = `star-${sanitizeName(star.Common_name_of_the_star)}-star`;
      individualShowStarCheckbox.name = 'star-show-star';
      individualShowStarCheckbox.value = star.Common_name_of_the_star;
      individualShowStarCheckbox.checked = true;
      const individualShowStarLabel = document.createElement('label');
      individualShowStarLabel.htmlFor = `star-${sanitizeName(star.Common_name_of_the_star)}-star`;
      individualShowStarLabel.textContent = 'Show Star';
      individualShowStarDiv.appendChild(individualShowStarCheckbox);
      individualShowStarDiv.appendChild(individualShowStarLabel);
      checkboxesDiv.appendChild(individualShowStarDiv);

      starContainer.appendChild(checkboxesDiv);
      individualStarsDiv.appendChild(starContainer);
    });

    subcontentDiv.appendChild(individualStarsDiv);
    subcatDiv.appendChild(subcontentDiv);

    header.addEventListener('click', () => {
      header.classList.toggle('active');
      const isActive = header.classList.contains('active');
      header.setAttribute('aria-expanded', isActive);

      if (isActive) {
        const contentHeight = subcontentDiv.scrollHeight;
        if (contentHeight > 300) {
          subcontentDiv.style.maxHeight = '300px';
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

    container.appendChild(subcatDiv);
  });

  // Handle any stellar classes not in the known list under an "Other" category.
  const otherStars = [];
  Object.keys(classMap).forEach(key => {
    if (!recognizedSet.has(key)) {
      otherStars.push(...classMap[key]);
    }
  });

  if (otherStars.length) {
    const cls = 'Other';
    const cName = 'Miscellaneous';
    const arr = otherStars;
    const starCount = arr.length;
    const defaultSize = 1;

    const subcatDiv = document.createElement('div');
    subcatDiv.classList.add('stellar-class-subcategory');

    const header = document.createElement('h3');
    header.classList.add('collapsible-subcategory', 'subcategory-header');
    header.textContent = `${cls} - ${starCount}`;
    subcatDiv.appendChild(header);

    const classCheckboxesDiv = document.createElement('div');
    classCheckboxesDiv.classList.add('class-level-checkboxes');

    const showNameDiv = document.createElement('div');
    showNameDiv.classList.add('filter-item');
    const showNameCheckbox = document.createElement('input');
    showNameCheckbox.type = 'checkbox';
    showNameCheckbox.id = `class-${cls}-name`;
    showNameCheckbox.name = 'stellar-class-show-name';
    showNameCheckbox.value = cls;
    showNameCheckbox.checked = true;
    const showNameLabel = document.createElement('label');
    showNameLabel.htmlFor = `class-${cls}-name`;
    showNameLabel.textContent = 'Show Name';
    showNameDiv.appendChild(showNameCheckbox);
    showNameDiv.appendChild(showNameLabel);
    classCheckboxesDiv.appendChild(showNameDiv);

    const showStarDiv = document.createElement('div');
    showStarDiv.classList.add('filter-item');
    const showStarCheckbox = document.createElement('input');
    showStarCheckbox.type = 'checkbox';
    showStarCheckbox.id = `class-${cls}-star`;
    showStarCheckbox.name = 'stellar-class-show-star';
    showStarCheckbox.value = cls;
    showStarCheckbox.checked = true;
    const showStarLabel = document.createElement('label');
    showStarLabel.htmlFor = `class-${cls}-star`;
    showStarLabel.textContent = 'Show Star';
    showStarDiv.appendChild(showStarCheckbox);
    showStarDiv.appendChild(showStarLabel);
    classCheckboxesDiv.appendChild(showStarDiv);

    // Star size slider
    const starSizeDiv = document.createElement('div');
    starSizeDiv.classList.add('filter-item');
    const starSizeLabel = document.createElement('label');
    starSizeLabel.htmlFor = `class-${cls}-star-size-slider`;
    starSizeLabel.textContent = 'Star Size:';
    const starSizeSlider = document.createElement('input');
    starSizeSlider.type = 'range';
    starSizeSlider.id = `class-${cls}-star-size-slider`;
    starSizeSlider.name = `class-${cls}-star-size`;
    starSizeSlider.min = '0.1';
    starSizeSlider.max = '15';
    starSizeSlider.step = '0.1';
    starSizeSlider.value = defaultSize;
    const starSizeNumber = document.createElement('input');
    starSizeNumber.type = 'number';
    starSizeNumber.id = `class-${cls}-star-size-number`;
    starSizeNumber.name = `class-${cls}-star-size`;
    starSizeNumber.min = '0.1';
    starSizeNumber.max = '15';
    starSizeNumber.step = '0.1';
    starSizeNumber.value = defaultSize;
    starSizeDiv.appendChild(starSizeLabel);
    starSizeDiv.appendChild(starSizeSlider);
    starSizeDiv.appendChild(starSizeNumber);
    classCheckboxesDiv.appendChild(starSizeDiv);

    starSizeSlider.addEventListener('input', () => {
      starSizeNumber.value = starSizeSlider.value;
    });
    starSizeNumber.addEventListener('input', () => {
      starSizeSlider.value = starSizeNumber.value;
    });

    // Label size slider
    const labelSizeDiv = document.createElement('div');
    labelSizeDiv.classList.add('filter-item');
    const labelSizeLabel = document.createElement('label');
    labelSizeLabel.htmlFor = `class-${cls}-label-size-slider`;
    labelSizeLabel.textContent = 'Label Size:';
    const labelSizeSlider = document.createElement('input');
    labelSizeSlider.type = 'range';
    labelSizeSlider.id = `class-${cls}-label-size-slider`;
    labelSizeSlider.name = `class-${cls}-label-size`;
    labelSizeSlider.min = '0.1';
    labelSizeSlider.max = '15';
    labelSizeSlider.step = '0.1';
    labelSizeSlider.value = defaultSize;
    const labelSizeNumber = document.createElement('input');
    labelSizeNumber.type = 'number';
    labelSizeNumber.id = `class-${cls}-label-size-number`;
    labelSizeNumber.name = `class-${cls}-label-size`;
    labelSizeNumber.min = '0.1';
    labelSizeNumber.max = '15';
    labelSizeNumber.step = '0.1';
    labelSizeNumber.value = defaultSize;
    labelSizeDiv.appendChild(labelSizeLabel);
    labelSizeDiv.appendChild(labelSizeSlider);
    labelSizeDiv.appendChild(labelSizeNumber);
    classCheckboxesDiv.appendChild(labelSizeDiv);

    labelSizeSlider.addEventListener('input', () => {
      labelSizeNumber.value = labelSizeSlider.value;
    });
    labelSizeNumber.addEventListener('input', () => {
      labelSizeSlider.value = labelSizeNumber.value;
    });

    subcatDiv.appendChild(classCheckboxesDiv);

    const subcontentDiv = document.createElement('div');
    subcontentDiv.classList.add('filter-subcontent', 'subcategory-content');
    subcontentDiv.style.maxHeight = '0';
    subcontentDiv.style.overflowY = 'hidden';

    const individualStarsDiv = document.createElement('div');
    individualStarsDiv.classList.add('individual-stars');

    arr.forEach(star => {
      const starContainer = document.createElement('div');
      starContainer.classList.add('star-container');

      const starNameLabel = document.createElement('span');
      starNameLabel.textContent = star.Common_name_of_the_star;
      starNameLabel.classList.add('star-name');
      starContainer.appendChild(starNameLabel);

      const checkboxesDiv = document.createElement('div');
      checkboxesDiv.classList.add('star-checkboxes');

      const individualShowNameDiv = document.createElement('div');
      individualShowNameDiv.classList.add('filter-item');
      const individualShowNameCheckbox = document.createElement('input');
      individualShowNameCheckbox.type = 'checkbox';
      individualShowNameCheckbox.id = `star-${sanitizeName(star.Common_name_of_the_star)}-name`;
      individualShowNameCheckbox.name = 'star-show-name';
      individualShowNameCheckbox.value = star.Common_name_of_the_star;
      individualShowNameCheckbox.checked = true;
      const individualShowNameLabel = document.createElement('label');
      individualShowNameLabel.htmlFor = `star-${sanitizeName(star.Common_name_of_the_star)}-name`;
      individualShowNameLabel.textContent = 'Show Name';
      individualShowNameDiv.appendChild(individualShowNameCheckbox);
      individualShowNameDiv.appendChild(individualShowNameLabel);
      checkboxesDiv.appendChild(individualShowNameDiv);

      const individualShowStarDiv = document.createElement('div');
      individualShowStarDiv.classList.add('filter-item');
      const individualShowStarCheckbox = document.createElement('input');
      individualShowStarCheckbox.type = 'checkbox';
      individualShowStarCheckbox.id = `star-${sanitizeName(star.Common_name_of_the_star)}-star`;
      individualShowStarCheckbox.name = 'star-show-star';
      individualShowStarCheckbox.value = star.Common_name_of_the_star;
      individualShowStarCheckbox.checked = true;
      const individualShowStarLabel = document.createElement('label');
      individualShowStarLabel.htmlFor = `star-${sanitizeName(star.Common_name_of_the_star)}-star`;
      individualShowStarLabel.textContent = 'Show Star';
      individualShowStarDiv.appendChild(individualShowStarCheckbox);
      individualShowStarDiv.appendChild(individualShowStarLabel);
      checkboxesDiv.appendChild(individualShowStarDiv);

      starContainer.appendChild(checkboxesDiv);
      individualStarsDiv.appendChild(starContainer);
    });

    subcontentDiv.appendChild(individualStarsDiv);
    subcatDiv.appendChild(subcontentDiv);

    header.addEventListener('click', () => {
      header.classList.toggle('active');
      const isActive = header.classList.contains('active');
      header.setAttribute('aria-expanded', isActive);

      if (isActive) {
        const contentHeight = subcontentDiv.scrollHeight;
        if (contentHeight > 300) {
          subcontentDiv.style.maxHeight = '300px';
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

    container.appendChild(subcatDiv);
  }

  // Global checkbox listeners to toggle all names or stars at once.
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

  function sanitizeName(name) {
    return (name || '').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-]/g, '');
  }
}
