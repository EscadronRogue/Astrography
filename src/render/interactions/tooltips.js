import { getStarId, isSolStar } from '../../shared/starUtils.js';
import { isDefaultViewpoint, getViewpointStarId } from '../../shared/viewpoint.js';

// Stored reference to appContext, set once via setTooltipContext().
let _ctx = null;

/**
 * Provide the app context so the tooltip "View from here" button can
 * trigger a viewpoint change.  Call once during initialisation.
 */
export function setTooltipContext(ctx) {
  _ctx = ctx;
}

/**
 * Invalidate the cached tooltip content so the next showTooltip() call
 * repopulates even for the same star.  Call after viewpoint changes.
 */
export function invalidateTooltipCache() {
  const tooltip = getTooltipElement();
  if (tooltip) delete tooltip.dataset.starKey;
}

function clearTooltip(tooltip) {
  while (tooltip.firstChild) tooltip.removeChild(tooltip.firstChild);
}

function appendRow(tooltip, id, label, value) {
  const row = document.createElement('div');
  row.id = id;
  const strong = document.createElement('strong');
  strong.textContent = `${label}: `;
  row.appendChild(strong);
  row.appendChild(document.createTextNode(value));
  tooltip.appendChild(row);
}

function formatNumber(value, digits = 2, suffix = '') {
  return Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : 'N/A';
}

function sanitizeCatalogUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url, window.location.href);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function getTooltipStarKey(star) {
  return star?.starId || star?.Source_id || star?.HIP_number || star?.Catalog_link || star?.Common_name_of_the_star || 'unknown';
}

function getTooltipElement() {
  return document.getElementById('tooltip');
}

function getTooltipPositionValue(rawValue) {
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

function populateTooltip(tooltip, star) {
  clearTooltip(tooltip);
  appendRow(tooltip, 'tooltip-starName', 'Name', star.Common_name_of_the_star || 'Unknown Star');
  appendRow(tooltip, 'tooltip-systemName', 'System', star.Common_name_of_the_star_system || 'Unknown System');
  // Show original distance from Sol, plus distance from viewpoint star in parentheses
  if (!isDefaultViewpoint() && star.viewpointDistance !== undefined && star.viewpointDistance !== star.distance) {
    appendRow(tooltip, 'tooltip-distance', 'Distance', `${formatNumber(star.distance, 2, ' LY')} (${formatNumber(star.viewpointDistance, 2, ' LY')} from viewpoint)`);
  } else {
    appendRow(tooltip, 'tooltip-distance', 'Distance', formatNumber(star.distance, 2, ' LY'));
  }
  appendRow(tooltip, 'tooltip-constellation', 'Constellation', star.Constellation || 'N/A');
  appendRow(tooltip, 'tooltip-stellarClass', 'Stellar Class', star.stellarClass || star.Stellar_class || 'N/A');
  appendRow(tooltip, 'tooltip-mass', 'Mass', Number.isFinite(star.Mass) ? String(star.Mass) : 'N/A');
  appendRow(tooltip, 'tooltip-size', 'Size', Number.isFinite(star.Size) ? String(star.Size) : 'N/A');
  appendRow(tooltip, 'tooltip-absoluteMag', 'Absolute Mag', formatNumber(star.absoluteMagnitude));
  appendRow(tooltip, 'tooltip-parallax', 'Parallax', Number.isFinite(star.Parallax) ? String(star.Parallax) : 'N/A');

  const catalogRow = document.createElement('div');
  catalogRow.id = 'tooltip-catalogLink';
  const strong = document.createElement('strong');
  strong.textContent = 'Catalog: ';
  catalogRow.appendChild(strong);
  const safeUrl = sanitizeCatalogUrl(star.Catalog_link);
  if (safeUrl) {
    const link = document.createElement('a');
    link.href = safeUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'tooltip-catalog-link';
    link.textContent = 'Catalog';
    catalogRow.appendChild(link);
  } else {
    catalogRow.appendChild(document.createTextNode('N/A'));
  }
  tooltip.appendChild(catalogRow);

  // --- Viewpoint button ---
  const vpRow = document.createElement('div');
  vpRow.id = 'tooltip-viewpoint';
  vpRow.className = 'tooltip-action-row';

  const vpBtn = document.createElement('button');
  vpBtn.type = 'button';
  vpBtn.className = 'tooltip-action tooltip-action-primary';

  const currentVpId = getViewpointStarId();
  const thisStarId = getStarId(star);
  const isThisStar = currentVpId && currentVpId === thisStarId;
  const isSolTarget = isSolStar(star);
  const isSolAndDefault = isDefaultViewpoint() && isSolTarget;

  if (isThisStar || isSolAndDefault) {
    vpBtn.textContent = 'Currently viewing from here';
    vpBtn.disabled = true;
  } else {
    vpBtn.textContent = isSolTarget ? 'View from Sol' : 'View from here';
    vpBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (_ctx) {
        _ctx.changeViewpoint(isSolTarget ? null : star);
        hideTooltip();
        unpinTooltip();
        _ctx.state.selectedStarData = null;
      }
    });
  }
  vpRow.appendChild(vpBtn);

  // "Return to Sol" button when not at default viewpoint
  if (!isDefaultViewpoint() && !isSolTarget) {
    const solBtn = document.createElement('button');
    solBtn.type = 'button';
    solBtn.className = 'tooltip-action tooltip-action-secondary';
    solBtn.textContent = 'Return to Sol';
    solBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (_ctx) {
        _ctx.changeViewpoint(null);
        hideTooltip();
        unpinTooltip();
        _ctx.state.selectedStarData = null;
      }
    });
    vpRow.appendChild(solBtn);
  }

  tooltip.appendChild(vpRow);
}

export function pinTooltip(x, y) {
  const tooltip = getTooltipElement();
  if (!tooltip) return;
  tooltip.dataset.pinned = 'true';
  tooltip.dataset.pinnedX = String(x);
  tooltip.dataset.pinnedY = String(y);
}

export function unpinTooltip() {
  const tooltip = getTooltipElement();
  if (!tooltip) return;
  delete tooltip.dataset.pinned;
  delete tooltip.dataset.pinnedX;
  delete tooltip.dataset.pinnedY;
}

export function getPinnedTooltipPosition() {
  const tooltip = getTooltipElement();
  if (!tooltip || tooltip.dataset.pinned !== 'true') return null;
  const x = getTooltipPositionValue(tooltip.dataset.pinnedX);
  const y = getTooltipPositionValue(tooltip.dataset.pinnedY);
  if (x === null || y === null) return null;
  return { x, y };
}

export function showTooltip(x, y, star) {
  const tooltip = getTooltipElement();
  if (!tooltip) return;
  tooltip.removeAttribute('hidden');
  tooltip.style.pointerEvents = 'auto';
  if (!tooltip.hasAttribute('data-stop-propagation')) {
    tooltip.addEventListener('click', event => event.stopPropagation());
    tooltip.setAttribute('data-stop-propagation', 'true');
  }

  const starKey = getTooltipStarKey(star);
  if (tooltip.dataset.starKey !== starKey) {
    populateTooltip(tooltip, star);
    tooltip.dataset.starKey = starKey;
  }

  const offset = 15;
  tooltip.classList.add('visible');
  tooltip.classList.remove('hidden');
  const rect = tooltip.getBoundingClientRect();
  const maxLeft = Math.max(0, window.innerWidth - rect.width - 8);
  const maxTop = Math.max(0, window.innerHeight - rect.height - 8);
  tooltip.style.left = `${Math.min(x + offset, maxLeft)}px`;
  tooltip.style.top = `${Math.min(y + offset, maxTop)}px`;
}

export function hideTooltip() {
  const tooltip = getTooltipElement();
  if (tooltip) {
    tooltip.classList.remove('visible');
    tooltip.classList.add('hidden');
    tooltip.setAttribute('hidden', '');
    tooltip.style.pointerEvents = 'none';
  }
}
