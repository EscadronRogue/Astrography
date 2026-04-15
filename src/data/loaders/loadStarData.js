function normalizeNumber(value) {
  const num = typeof value === 'string' ? Number.parseFloat(value) : value;
  return Number.isFinite(num) ? num : undefined;
}

function buildStableStarId(star) {
  return (
    star.Source_id ||
    star.HIP_number ||
    star.HD_catalogue_identifier ||
    `${star.Common_name_of_the_star || 'star'}|${star.RA_in_degrees}|${star.DEC_in_degrees}`
  );
}

export function normalizeStarRecord(star) {
  const distance = normalizeNumber(star.distance ?? star.Distance_from_the_Sun);
  const apparentMagnitude = normalizeNumber(star.apparentMagnitude ?? star.Apparent_magnitude);
  const absoluteMagnitude = normalizeNumber(star.absoluteMagnitude ?? star.Absolute_magnitude);
  const stellarClass = star.stellarClass ?? star.Stellar_class ?? '';
  const constellation = star.constellation ?? star.Constellation ?? '';
  const x = normalizeNumber(star.x_coordinate);
  const y = normalizeNumber(star.y_coordinate);
  const z = normalizeNumber(star.z_coordinate);
  return {
    ...star,
    distance,
    apparentMagnitude,
    absoluteMagnitude,
    stellarClass,
    constellation,
    x_coordinate: x,
    y_coordinate: y,
    z_coordinate: z,
    starId: star.starId || buildStableStarId(star)
  };
}

export async function loadStarData() {
  const manifestUrl = 'data/manifest.json';
  try {
    const manifestResp = await fetch(manifestUrl);
    if (!manifestResp.ok) {
      console.warn(`Could not load manifest at ${manifestUrl}`);
      return [];
    }

    const manifest = await manifestResp.json();
    const fileNames = Array.isArray(manifest) ? manifest : manifest.files;

    if (!Array.isArray(fileNames)) {
      console.warn('Invalid data manifest format');
      return [];
    }

    const dataPromises = fileNames.map(async name => {
      const resp = await fetch(`data/${name}`);
      if (!resp.ok) {
        console.warn(`Missing star data file: data/${name}`);
        return [];
      }
      return resp.json();
    });

    const filesData = await Promise.all(dataPromises);
    return filesData.flat().map(normalizeStarRecord);
  } catch (error) {
    console.warn('Error loading star data:', error);
    return [];
  }
}
