export function initializeCollapsibles(root = document) {
  root.querySelectorAll('.collapsible').forEach(legend => {
    legend.addEventListener('click', () => legend.classList.toggle('active'));
  });
}
