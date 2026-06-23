/* Astrography UI enhancements: sidebar filter search.
   No theme switcher: Observatory is the only theme.
   Does not touch application logic; decorates the DOM only.
*/
(function () {
  const FILTERS_READY_EVENT = 'astrography:filters-ready';

  function buildFilterSearch() {
    const sidebar = document.querySelector('.sidebar');
    const form = document.getElementById('filters-form');
    const existing = sidebar?.querySelector('.ag-filter-search');
    if (existing) return existing._agDispose || null;
    if (!sidebar || !form) return null;

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

    function setLegendExpanded(legend, expanded, { searchOpened = false } = {}) {
      if (!legend) return;
      const content = legend.nextElementSibling;
      legend.classList.toggle('active', expanded);
      legend.setAttribute('aria-expanded', String(expanded));
      if (searchOpened) {
        legend.dataset.searchOpened = 'true';
      } else {
        delete legend.dataset.searchOpened;
      }
      if (!content || !content.classList.contains('filter-content')) return;
      if (expanded) {
        content.style.maxHeight = content.scrollHeight + 'px';
        content.style.overflowY = 'visible';
      } else {
        content.style.maxHeight = '0px';
        content.style.overflowY = 'hidden';
      }
    }

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
          if (legend?.dataset.searchOpened === 'true') {
            setLegendExpanded(legend, false);
          }
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
          setLegendExpanded(legend, true, { searchOpened: true });
        }
      });
    }

    const onInput = event => runSearch(event.target.value);
    const onInputKeydown = event => {
      if (event.key === 'Escape') {
        input.value = '';
        runSearch('');
        input.blur();
      }
    };

    const onWindowKeydown = event => {
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
    };

    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onInputKeydown);
    window.addEventListener('keydown', onWindowKeydown);

    const dispose = () => {
      input.removeEventListener('input', onInput);
      input.removeEventListener('keydown', onInputKeydown);
      window.removeEventListener('keydown', onWindowKeydown);
      wrap.remove();
    };
    wrap._agDispose = dispose;
    return dispose;
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

  document.addEventListener(FILTERS_READY_EVENT, buildFilterSearch);
})();
