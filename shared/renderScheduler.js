let renderRequester = null;

export function setRenderRequester(requester) {
  renderRequester = typeof requester === 'function' ? requester : null;
}

export function requestRenderIfAvailable() {
  if (renderRequester) {
    renderRequester();
  }
}
