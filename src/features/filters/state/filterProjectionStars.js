import { SOL_STAR_NAME } from '../../../shared/constants.js';

export function getFilterProjectionStarId(star) {
  return (
    star?.starId ||
    star?.Common_name_of_the_star ||
    star?.Common_name_of_the_star_system ||
    star?.HD ||
    `${star?.RA_in_degrees}_${star?.DEC_in_degrees}`
  );
}

export function isDefaultProjectionViewpointStar(star) {
  return (
    star?.Common_name_of_the_star === SOL_STAR_NAME ||
    star?.Common_name_of_the_star_system === SOL_STAR_NAME ||
    getFilterProjectionStarId(star) === SOL_STAR_NAME
  );
}

export function getAngularProjectionStars(stars, viewpointId = null) {
  const safeStars = Array.isArray(stars) ? stars : [];
  return safeStars.filter(star => {
    if (viewpointId) return getFilterProjectionStarId(star) !== viewpointId;
    return !isDefaultProjectionViewpointStar(star);
  });
}
