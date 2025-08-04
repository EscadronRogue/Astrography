export function getThemeFont(fontSize) {
  const isHistorical = document.body.classList.contains('historical');
  const family = isHistorical ? '"Times New Roman", serif' : 'Oswald';
  return `${fontSize}px ${family}`;
}
