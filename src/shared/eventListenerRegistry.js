export function createEventListenerRegistry({ onError } = {}) {
  const disposers = [];

  function add(target, type, handler, options) {
    if (!target?.addEventListener || !target?.removeEventListener || typeof handler !== 'function') {
      return false;
    }
    target.addEventListener(type, handler, options);
    let active = true;
    const dispose = () => {
      if (!active) return;
      active = false;
      target.removeEventListener(type, handler, options);
      const index = disposers.indexOf(dispose);
      if (index >= 0) disposers.splice(index, 1);
    };
    disposers.push(dispose);
    return dispose;
  }

  function disposeAll() {
    while (disposers.length) {
      const dispose = disposers.pop();
      try {
        dispose();
      } catch (error) {
        onError?.(error);
      }
    }
  }

  return {
    add,
    disposeAll,
    get size() {
      return disposers.length;
    }
  };
}
