export const APP_STATE_DOMAINS = Object.freeze({
  data: 'data',
  selection: 'selection',
  projections: 'projections',
  overlays: 'overlays',
  planes: 'planes',
  labels: 'labels',
  editing: 'editing'
});

export function createAppState(accessors) {
  const state = {};
  const descriptors = {};
  Object.entries(accessors).forEach(([key, binding]) => {
    descriptors[key] = {
      get: binding.get,
      set: binding.set,
      enumerable: true
    };
  });
  Object.defineProperties(state, descriptors);
  return state;
}
