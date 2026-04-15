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
