export const FILTER_FORM_ID = 'filters-form';
export const STELLAR_SELECTION_CONTAINER_ID = 'stellar-class-selection-container';
export const STELLAR_PREFERENCES_CONTAINER_ID = 'stellar-class-preferences-container';
export const DUST_CLOUD_FIELD_NAME = 'dust-clouds';

export function resolveFilterDocument(context = {}) {
  if (context?.nodeType === 9) return context;
  if (context?.form?.ownerDocument) return context.form.ownerDocument;
  if (context?.ownerDocument) return context.ownerDocument;
  if (context?.document) return context.document;
  return globalThis.document;
}

export function getFilterForm(context = {}) {
  if (context?.form) return context.form;
  return resolveFilterDocument(context)?.getElementById?.(FILTER_FORM_ID) || null;
}

export function getStellarClassContainers(context = {}) {
  const documentRef = resolveFilterDocument(context);
  return {
    selectionContainer: documentRef?.getElementById?.(STELLAR_SELECTION_CONTAINER_ID) || null,
    preferencesContainer: documentRef?.getElementById?.(STELLAR_PREFERENCES_CONTAINER_ID) || null
  };
}

export function getSelectedDustCloudFiles(context = {}) {
  if (typeof FormData !== 'undefined' && context instanceof FormData) {
    return context.getAll(DUST_CLOUD_FIELD_NAME);
  }
  if (Array.isArray(context?.selectedDustClouds)) return context.selectedDustClouds;

  const form = getFilterForm(context);
  return form ? new FormData(form).getAll(DUST_CLOUD_FIELD_NAME) : [];
}
