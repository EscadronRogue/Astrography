export function getEl(id) {
  return document.getElementById(id);
}

export function bindRangeNumberPair({ rangeId, numberId, valueId, formatter = v => v, normalize = v => v }) {
  const range = getEl(rangeId);
  const number = getEl(numberId);
  const value = valueId ? getEl(valueId) : null;
  if (!range || !number) return;

  const sync = rawValue => {
    const normalized = normalize(rawValue);
    range.value = normalized;
    number.value = normalized;
    if (value) value.textContent = formatter(normalized);
  };

  range.addEventListener('input', () => sync(range.value));
  number.addEventListener('input', () => sync(number.value));
  sync(range.value);
}

export function bindToggleDisabled(masterId, dependentIds = []) {
  const master = getEl(masterId);
  const dependents = dependentIds.map(getEl).filter(Boolean);
  if (!master || dependents.length === 0) return;

  const update = () => {
    dependents.forEach(el => {
      el.disabled = !master.checked;
      el.setAttribute('aria-disabled', String(!master.checked));
    });
  };

  master.addEventListener('change', update);
  update();
}

export function makeCollapsibleSection(legend, content) {
  if (!legend || !content) return;
  const update = isOpen => {
    legend.classList.toggle('active', isOpen);
    legend.setAttribute('aria-expanded', String(isOpen));
    content.style.maxHeight = isOpen ? `${content.scrollHeight}px` : '0px';
    content.style.overflowY = isOpen ? 'auto' : 'hidden';
  };

  legend.tabIndex = 0;
  legend.setAttribute('role', 'button');
  legend.addEventListener('click', () => update(!legend.classList.contains('active')));
  legend.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      update(!legend.classList.contains('active'));
    }
  });

  update(false);
}

export function clampNumber(value, min, max, fallback) {
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}
