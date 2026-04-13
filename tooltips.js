function ensureTooltipClickHandler(tooltip) {
  if (tooltip.hasAttribute('data-stop-propagation')) return;
  tooltip.addEventListener('click', event => {
    event.stopPropagation();
  });
  tooltip.setAttribute('data-stop-propagation', 'true');
}

function setTextRow(parent, id, label, value) {
  const row = document.createElement('div');
  row.id = id;
  const strong = document.createElement('strong');
  strong.textContent = `${label}: `;
  row.appendChild(strong);
  row.appendChild(document.createTextNode(value));
  parent.appendChild(row);
}

function buildTooltipContent(tooltip, star) {
  tooltip.replaceChildren();
  setTextRow(tooltip, 'tooltip-starName', 'Name', star.Common_name_of_the_star || 'Unknown Star');
  setTextRow(tooltip, 'tooltip-systemName', 'System', star.Common_name_of_the_star_system || 'Unknown System');
  setTextRow(tooltip, 'tooltip-distance', 'Distance', star.Distance_from_the_Sun !== undefined ? `${star.Distance_from_the_Sun.toFixed(2)} LY` : 'N/A');
  setTextRow(tooltip, 'tooltip-constellation', 'Constellation', star.Constellation || 'N/A');
  setTextRow(tooltip, 'tooltip-stellarClass', 'Stellar Class', star.Stellar_class || 'N/A');
  setTextRow(tooltip, 'tooltip-mass', 'Mass', star.Mass !== undefined ? String(star.Mass) : 'N/A');
  setTextRow(tooltip, 'tooltip-size', 'Size', star.Size !== undefined ? String(star.Size) : 'N/A');
  setTextRow(tooltip, 'tooltip-absoluteMag', 'Absolute Mag', star.Absolute_magnitude !== undefined ? String(star.Absolute_magnitude) : 'N/A');
  setTextRow(tooltip, 'tooltip-parallax', 'Parallax', star.Parallax !== undefined ? String(star.Parallax) : 'N/A');

  const catalogRow = document.createElement('div');
  catalogRow.id = 'tooltip-catalogLink';
  const strong = document.createElement('strong');
  strong.textContent = 'Catalog: ';
  catalogRow.appendChild(strong);
  if (star.Catalog_link) {
    try {
      const url = new URL(star.Catalog_link, window.location.href);
      const link = document.createElement('a');
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Catalog';
      catalogRow.appendChild(link);
    } catch {
      catalogRow.appendChild(document.createTextNode('N/A'));
    }
  } else {
    catalogRow.appendChild(document.createTextNode('N/A'));
  }
  tooltip.appendChild(catalogRow);
}

function positionTooltip(tooltip, x, y) {
  const offset = 15;
  tooltip.style.left = '0px';
  tooltip.style.top = '0px';
  const tooltipWidth = tooltip.offsetWidth;
  const tooltipHeight = tooltip.offsetHeight;
  const maxLeft = window.innerWidth - tooltipWidth - 8;
  const maxTop = window.innerHeight - tooltipHeight - 8;
  const left = Math.max(8, Math.min(x + offset, maxLeft));
  const top = Math.max(8, Math.min(y + offset, maxTop));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

export function showTooltip(x, y, star) {
  const tooltip = document.getElementById('tooltip');
  if (!tooltip) {
    console.warn('Tooltip container not found in DOM.');
    return;
  }

  tooltip.style.pointerEvents = 'auto';
  ensureTooltipClickHandler(tooltip);
  buildTooltipContent(tooltip, star);
  tooltip.classList.add('visible');
  tooltip.classList.remove('hidden');
  positionTooltip(tooltip, x, y);
}

export function hideTooltip() {
  const tooltip = document.getElementById('tooltip');
  if (tooltip) {
    tooltip.classList.remove('visible');
    tooltip.classList.add('hidden');
    tooltip.style.pointerEvents = 'none';
  }
}
