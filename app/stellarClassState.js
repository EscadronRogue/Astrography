import { captureFormState, restoreFormState } from '../shared/formUtils.js';

export function captureStellarClassState() {
  return captureFormState(document.getElementById('stellar-class-container'));
}

export function restoreStellarClassState(state) {
  restoreFormState(document.getElementById('stellar-class-container'), state, {
    dispatchEvents: false
  });
}
