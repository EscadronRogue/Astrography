function clearTooltip(tooltip) {
  tooltip.replaceChildren();
}

function appendRow(tooltip, label, value) {
  if (value === undefined || value === null || value === '' || value === 'N/A') return;
  const row = document.createElement('div');
  row.className = 'tooltip-row';

  const strong = document.createElement('strong');
  strong.textContent = `${label}: `;
  row.appendChild(strong);

  if (value instanceof Node) {
    row.appendChild(value);
  } else {
    row.appendChild(document.createTextNode(String(value)));
  }

  tooltip.appendChild(row);
}

function clampTooltipPosition(tooltip, x, y, offset = 14) {
  const width = tooltip.offsetWidth || 260;
  const height = tooltip.offsetHeight || 180;
  const maxLeft = window.innerWidth - width - 8;
  const maxTop = window.innerHeight - height - 8;
  const left = Math.max(8, Math.min(x + offset, maxLeft));
  const top = Math.max(8, Math.min(y + offset, maxTop));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function safeNumber(value, suffix = '') {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return null;
  return `${value}${suffix}`;
}

export function showTooltip(x, y, star) {
  const tooltip = document.getElementById('tooltip');
  if (!tooltip) {
    console.warn('Tooltip container not found in DOM.');
    return;
  }

  tooltip.style.pointerEvents = 'auto';
  tooltip.setAttribute('aria-hidden', 'false');

  if (!tooltip.dataset.stopPropagationBound) {
    tooltip.addEventListener('click', event => event.stopPropagation());
    tooltip.dataset.stopPropagationBound = 'true';
  }

  clearTooltip(tooltip);

  const title = document.createElement('div');
  title.className = 'tooltip-title';
  title.textContent = star.Common_name_of_the_star || 'Unknown star';
  tooltip.appendChild(title);

  appendRow(tooltip, 'System', star.Common_name_of_the_star_system || 'Unknown system');
  appendRow(
    tooltip,
    'Distance',
    star.Distance_from_the_Sun !== undefined ? `${Number(star.Distance_from_the_Sun).toFixed(2)} LY` : null
  );
  appendRow(tooltip, 'Constellation', star.Constellation);
  appendRow(tooltip, 'Stellar Class', star.Stellar_class);
  appendRow(tooltip, 'Mass', safeNumber(star.Mass));
  appendRow(tooltip, 'Size', safeNumber(star.Size));
  appendRow(tooltip, 'Absolute Mag', safeNumber(star.Absolute_magnitude));
  appendRow(tooltip, 'Parallax', safeNumber(star.Parallax));

  if (star.Catalog_link) {
    try {
      const url = new URL(star.Catalog_link, window.location.href);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        const link = document.createElement('a');
        link.href = url.toString();
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.className = 'tooltip-link';
        link.textContent = 'Open catalog entry';
        appendRow(tooltip, 'Catalog', link);
      }
    } catch {
      // ignore malformed links from data
    }
  }

  tooltip.classList.add('visible');
  tooltip.classList.remove('hidden');
  clampTooltipPosition(tooltip, x, y);
}

export function hideTooltip() {
  const tooltip = document.getElementById('tooltip');
  if (!tooltip) return;
  tooltip.classList.remove('visible');
  tooltip.classList.add('hidden');
  tooltip.style.pointerEvents = 'none';
  tooltip.setAttribute('aria-hidden', 'true');
}
