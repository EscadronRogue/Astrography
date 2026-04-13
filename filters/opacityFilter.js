export function applyOpacityFilter(stars, filters) {
  const fixedOpacity = Number.parseFloat(filters.opacity);
  if (Number.isFinite(fixedOpacity)) {
    const clamped = Math.max(0, Math.min(1, fixedOpacity > 1 ? fixedOpacity / 100 : fixedOpacity));
    stars.forEach(star => {
      star.displayOpacity = clamped;
    });
    return stars;
  }

  if (filters.opacity === 'absolute-magnitude') {
    const magnitudes = stars
      .map(star => star.absoluteMagnitude)
      .filter(Number.isFinite);

    if (magnitudes.length > 0) {
      const minMag = Math.min(...magnitudes);
      const maxMag = Math.max(...magnitudes);
      const range = Math.max(1e-9, maxMag - minMag);
      const minOpacity = 0.1;
      const maxOpacity = 1.0;
      stars.forEach(star => {
        if (Number.isFinite(star.absoluteMagnitude)) {
          const normalizedMag = (star.absoluteMagnitude - minMag) / range;
          const opacity = maxOpacity - normalizedMag * (maxOpacity - minOpacity);
          star.displayOpacity = Math.max(minOpacity, Math.min(maxOpacity, opacity));
        } else {
          star.displayOpacity = 1.0;
        }
      });
      return stars;
    }
  }

  stars.forEach(star => {
    star.displayOpacity = 1.0;
  });
  return stars;
}
