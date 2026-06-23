export function cloneVectorLike(value) {
  if (!value) return null;
  return {
    x: Number(value.x) || 0,
    y: Number(value.y) || 0,
    z: Number(value.z) || 0
  };
}

export function serializeStarForWorker(star) {
  if (!star) return null;
  return {
    starId: star.starId,
    Common_name_of_the_star: star.Common_name_of_the_star,
    Common_name_of_the_star_system: star.Common_name_of_the_star_system,
    Stellar_class: star.Stellar_class,
    stellarClass: star.stellarClass,
    absoluteMagnitude: star.absoluteMagnitude,
    Absolute_magnitude: star.Absolute_magnitude,
    distance: star.distance,
    truePosition: cloneVectorLike(star.truePosition)
  };
}

export function serializeStarsForWorker(stars) {
  return Array.isArray(stars)
    ? stars.map(serializeStarForWorker).filter(Boolean)
    : [];
}

export function serializeConnectionsForWorker(connections) {
  return Array.isArray(connections)
    ? connections.map(connection => {
        const { starA, starB } = connection || {};
        return {
          starA: serializeStarForWorker(starA),
          starB: serializeStarForWorker(starB)
        };
      })
    : [];
}

export function createSTLKitWorkerPayload(stars, connections, options = {}) {
  const safeOptions = options && typeof options === 'object' ? options : {};
  return {
    stars: serializeStarsForWorker(stars),
    connections: serializeConnectionsForWorker(connections),
    options: {
      ...safeOptions,
      allStars: serializeStarsForWorker(safeOptions.allStars?.length ? safeOptions.allStars : stars)
    }
  };
}

export function getSTLKitTransferableBuffers(result) {
  return (result?.files || [])
    .map(file => file.buffer)
    .filter(buffer => buffer instanceof ArrayBuffer);
}
