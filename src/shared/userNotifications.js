const NOTIFICATION_REGION_ID = 'app-notification-region';
const DEFAULT_DURATION_MS = 10000;

export function formatUserError(title, error) {
  const message = error?.message || String(error || 'Unknown error');
  return title ? `${title}: ${message}` : message;
}

function removeNotification(item) {
  if (!item?.parentNode) return;
  item.parentNode.removeChild(item);
}

function ensureNotificationRegion() {
  const doc = globalThis.document;
  if (!doc?.body) return null;

  let region = doc.getElementById(NOTIFICATION_REGION_ID);
  if (region) return region;

  region = doc.createElement('div');
  region.id = NOTIFICATION_REGION_ID;
  region.setAttribute('aria-live', 'assertive');
  region.setAttribute('aria-relevant', 'additions');
  doc.body.appendChild(region);
  return region;
}

export function notifyError(title, error, options = {}) {
  const message = formatUserError(title, error);
  const region = ensureNotificationRegion();
  if (!region) {
    globalThis.alert?.(message);
    return null;
  }

  const doc = region.ownerDocument;
  const item = doc.createElement('div');
  item.className = 'app-notification app-notification-error';
  item.setAttribute('role', 'alert');

  const titleEl = doc.createElement('div');
  titleEl.className = 'app-notification-title';
  titleEl.textContent = title || 'Error';

  const messageEl = doc.createElement('div');
  messageEl.className = 'app-notification-message';
  messageEl.textContent = error?.message || String(error || 'Unknown error');

  const closeButton = doc.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'app-notification-close';
  closeButton.setAttribute('aria-label', 'Dismiss notification');
  closeButton.textContent = 'x';
  closeButton.addEventListener('click', () => removeNotification(item), { once: true });

  item.append(titleEl, messageEl, closeButton);
  region.appendChild(item);

  const durationMs = Number.isFinite(options.durationMs) ? options.durationMs : DEFAULT_DURATION_MS;
  if (durationMs > 0) {
    globalThis.setTimeout(() => removeNotification(item), durationMs);
  }

  return item;
}
