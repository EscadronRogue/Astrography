/* Astrography UI enhancements: sidebar filter search.
   No theme switcher: Observatory is the only theme.
   Does not touch application logic; decorates the DOM only.
*/
(function () {
  function buildFilterSearch() {
    const sidebar = document.querySelector('.sidebar');
    const form = document.getElementById('filters-form');
    if (!sidebar || !form || sidebar.querySelector('.ag-filter-search')) return;

    const wrap = document.createElement('div');
    wrap.className = 'ag-filter-search';

    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = 'Search filters...';
    input.setAttribute('aria-label', 'Search filters');
    wrap.appendChild(input);

    const kbd = document.createElement('kbd');
    kbd.textContent = '/';
    wrap.appendChild(kbd);

    sidebar.insertBefore(wrap, form);

    function runSearch(query) {
      const q = (query || '').trim().toLowerCase();
      const fieldsets = form.querySelectorAll('fieldset');
      const sectionLabels = form.querySelectorAll('.ag-section');

      sectionLabels.forEach(section => {
        section.classList.toggle('ag-hidden', Boolean(q));
      });

      fieldsets.forEach(fieldset => {
        let anyVisible = false;
        const legend = fieldset.querySelector('legend');
        const legendText = legend ? legend.textContent.toLowerCase() : '';
        const items = fieldset.querySelectorAll('.filter-item');
        const subheads = fieldset.querySelectorAll('.filter-subhead');

        if (!q) {
          fieldset.classList.remove('ag-hidden');
          items.forEach(item => item.classList.remove('ag-hidden'));
          subheads.forEach(subhead => subhead.classList.remove('ag-hidden'));
          fieldset.querySelectorAll('.stellar-class-subcategory').forEach(subcategory => {
            subcategory.classList.remove('ag-hidden');
          });
          return;
        }

        items.forEach(item => {
          const text = item.textContent.toLowerCase();
          const match = text.includes(q) || legendText.includes(q);
          item.classList.toggle('ag-hidden', !match);
          if (match) anyVisible = true;
        });

        subheads.forEach(subhead => subhead.classList.toggle('ag-hidden', true));

        fieldset.querySelectorAll('.stellar-class-subcategory').forEach(subcategory => {
          const text = subcategory.textContent.toLowerCase();
          const match = text.includes(q) || legendText.includes(q);
          subcategory.classList.toggle('ag-hidden', !match);
          if (match) anyVisible = true;
        });

        if (legendText.includes(q)) anyVisible = true;
        fieldset.classList.toggle('ag-hidden', !anyVisible);

        if (anyVisible && legend && !legend.classList.contains('active')) {
          legend.classList.add('active');
        }
      });
    }

    input.addEventListener('input', event => runSearch(event.target.value));
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        input.value = '';
        runSearch('');
        input.blur();
      }
    });

    window.addEventListener('keydown', event => {
      const activeTag = document.activeElement?.tagName || '';
      const isTypingTarget = /INPUT|TEXTAREA|SELECT/.test(activeTag);
      if (event.key !== '/' || document.activeElement === input || isTypingTarget) return;

      event.preventDefault();
      const sidebarElement = document.querySelector('.sidebar');
      if (sidebarElement && !sidebarElement.classList.contains('open')) {
        const toggle = document.getElementById('menu-toggle');
        if (toggle) toggle.click();
      }
      input.focus();
    });
  }

  function boot() {
    document.documentElement.setAttribute('data-theme', 'observatory');
    buildFilterSearch();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  setTimeout(buildFilterSearch, 800);
})();
