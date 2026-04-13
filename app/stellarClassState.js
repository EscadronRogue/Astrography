export function captureStellarClassState() {
  const state = {};
  const container = document.getElementById('stellar-class-container');
  if (!container) return state;

  container.querySelectorAll('input').forEach(element => {
    state[element.id] = element.type === 'checkbox' || element.type === 'radio'
      ? element.checked
      : element.value;
  });

  return state;
}

export function restoreStellarClassState(state) {
  const container = document.getElementById('stellar-class-container');
  if (!container) return;

  Object.entries(state).forEach(([id, value]) => {
    const element = document.getElementById(id);
    if (!element) return;

    if (element.type === 'checkbox' || element.type === 'radio') {
      element.checked = value;
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event('input'));
  });
}
