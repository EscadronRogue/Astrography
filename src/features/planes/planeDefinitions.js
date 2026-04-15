const DEG2RAD = Math.PI / 180;

// Galactic to equatorial conversion constants (J2000)
export const alphaGP = 192.85948 * DEG2RAD;
export const deltaGP = 27.12825 * DEG2RAD;
export const lOmega = 32.93192 * DEG2RAD;

// Obliquity of the ecliptic
export const epsilon = 23.43928 * DEG2RAD;

// J2000 Galactic -> Equatorial rotation matrix (IAU, transpose of equatorial to galactic matrix)
export const GAL_TO_EQ_MATRIX = [
  [-0.0548755604162154, 0.4941094278755837, -0.8676661490190047],
  [-0.8734370902348850, -0.4448296299600112, -0.1980763734312015],
  [-0.4838350155487132, 0.7469822444972189, 0.4559837761750669]
];

export function galacticToEquatorial(l, b) {
  const cosb = Math.cos(b);
  const vx = cosb * Math.cos(l);
  const vy = cosb * Math.sin(l);
  const vz = Math.sin(b);
  const eqx = GAL_TO_EQ_MATRIX[0][0] * vx + GAL_TO_EQ_MATRIX[0][1] * vy + GAL_TO_EQ_MATRIX[0][2] * vz;
  const eqy = GAL_TO_EQ_MATRIX[1][0] * vx + GAL_TO_EQ_MATRIX[1][1] * vy + GAL_TO_EQ_MATRIX[1][2] * vz;
  const eqz = GAL_TO_EQ_MATRIX[2][0] * vx + GAL_TO_EQ_MATRIX[2][1] * vy + GAL_TO_EQ_MATRIX[2][2] * vz;
  let ra = Math.atan2(eqy, eqx);
  if (ra < 0) ra += 2 * Math.PI;
  const dec = Math.asin(eqz);
  return { ra, dec };
}

export function eclipticToEquatorial(lambda, beta = 0) {
  const sinB = Math.sin(beta);
  const cosB = Math.cos(beta);
  const sinL = Math.sin(lambda);
  const cosL = Math.cos(lambda);
  const sinDec = sinB * Math.cos(epsilon) + cosB * Math.sin(epsilon) * sinL;
  const dec = Math.asin(sinDec);
  const y = sinL * Math.cos(epsilon) - (sinB / cosB) * Math.sin(epsilon);
  const x = cosL;
  let ra = Math.atan2(y, x);
  if (ra < 0) ra += 2 * Math.PI;
  return { ra, dec };
}
