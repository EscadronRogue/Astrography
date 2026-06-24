import * as THREE from '../../vendor/three.js';
import { getStarId, getStarTruePosition } from '../../shared/starUtils.js';
import { GLOBE_RADIUS, DEFAULT_STAR_COLOR } from '../../shared/constants.js';
import { createMeasuredTextCanvas } from '../../shared/textCanvas.js';
import { clamp01, normalizeHexColor } from '../../shared/colorParsing.js';
import { getConnectionLineParams } from './connectionSettings.js';
import { computeKNearestPairs as computeKNearestPairsFromSpatialIndex } from './connectionSpatialIndex.js';

const STAR_POSITION_CACHE_KEY = Symbol('connectionPositionCache');

function getPosition(star) {
  if (star[STAR_POSITION_CACHE_KEY]) {
    return star[STAR_POSITION_CACHE_KEY];
  }
  const position = getStarTruePosition(star);
  star[STAR_POSITION_CACHE_KEY] = position;
  return position;
}

function getStarThreeColor(star, fallback = DEFAULT_STAR_COLOR) {
  return new THREE.Color(normalizeHexColor(star?.displayColor, fallback));
}

/**
 * Clear the per-star connection position cache.
 * Must be called after viewpoint changes so that connection lines
 * use the updated truePosition values.
 * @param {Array} stars - Array of star records.
 */
export function clearConnectionPositionCache(stars) {
  if (!Array.isArray(stars)) return;
  for (let i = 0; i < stars.length; i++) {
    delete stars[i][STAR_POSITION_CACHE_KEY];
  }
}

function getGridKey(position, cellSize) {
  const coords = getGridCoordinates(position, cellSize);
  return getGridKeyFromCoordinates(coords.x, coords.y, coords.z);
}

function getGridCoordinates(position, cellSize) {
  return {
    x: Math.floor(position.x / cellSize),
    y: Math.floor(position.y / cellSize),
    z: Math.floor(position.z / cellSize)
  };
}

function getGridKeyFromCoordinates(x, y, z) {
  return `${x},${y},${z}`;
}

function createPairKey(starA, starB) {
  const idA = getStarId(starA);
  const idB = getStarId(starB);
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

/**
 * Computes connection pairs between stars that are within maxDistance.
 * Uses a uniform spatial hash to avoid the prior O(n²) all-pairs scan.
 */
export function computeConnectionPairs(stars, maxDistance) {
  if (!Array.isArray(stars) || stars.length < 2 || !(maxDistance > 0)) {
    return [];
  }

  const pairs = [];
  const cellSize = maxDistance;
  const spatialGrid = new Map();
  const preparedStars = stars.map(star => ({ star, position: getPosition(star) }));

  preparedStars.forEach(entry => {
    const key = getGridKey(entry.position, cellSize);
    let bucket = spatialGrid.get(key);
    if (!bucket) {
      bucket = [];
      spatialGrid.set(key, bucket);
    }
    bucket.push(entry);
  });

  const neighborOffsets = [];
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dz = -1; dz <= 1; dz++) {
        neighborOffsets.push([dx, dy, dz]);
      }
    }
  }

  const visitedBuckets = new Set();
  for (const [key, bucket] of spatialGrid.entries()) {
    const [ix, iy, iz] = key.split(',').map(Number);
    for (const [dx, dy, dz] of neighborOffsets) {
      const neighborKey = `${ix + dx},${iy + dy},${iz + dz}`;
      const neighborBucket = spatialGrid.get(neighborKey);
      if (!neighborBucket) continue;

      const pairBucketKey = key < neighborKey ? `${key}|${neighborKey}` : `${neighborKey}|${key}`;
      if (visitedBuckets.has(pairBucketKey)) continue;
      visitedBuckets.add(pairBucketKey);

      for (let i = 0; i < bucket.length; i++) {
        const startJ = key === neighborKey ? i + 1 : 0;
        for (let j = startJ; j < neighborBucket.length; j++) {
          const starA = bucket[i];
          const starB = neighborBucket[j];
          const distance = starA.position.distanceTo(starB.position);
          if (distance > 0 && distance <= maxDistance) {
            pairs.push({
              starA: starA.star,
              starB: starB.star,
              distance,
              pairKey: createPairKey(starA.star, starB.star)
            });
          }
        }
      }
    }
  }

  pairs.sort((left, right) => left.pairKey.localeCompare(right.pairKey));
  return pairs;
}

/**
 * Compute connection pairs where each system is connected to its K closest
 * neighbouring systems.  Only the main star per system is used as the
 * representative, and the resulting pairs are deduplicated.
 *
 * @param {Array}  stars – Array of star records (may contain multiple stars per system).
 * @param {number} k     – Number of nearest systems each star should connect to.
 * @returns {Array}  – Same pair format as computeConnectionPairs.
 */
export function computeKNearestPairs(stars, k) {
  return computeKNearestPairsFromSpatialIndex(stars, k);

}

export function mergeConnectionLines(connectionObjs, mapType = 'TrueCoordinates', opacity = 0.5) {
  const positions = [];
  const colors = [];

  connectionObjs.forEach(pair => {
    const { starA, starB } = pair;
    let posA, posB;
    if (mapType === 'Globe') {
      posA = starA.spherePosition;
      posB = starB.spherePosition;
    } else {
      posA = getPosition(starA);
      posB = getPosition(starB);
    }
    if (!posA || !posB) return;
    positions.push(posA.x, posA.y, posA.z);
    positions.push(posB.x, posB.y, posB.z);

    const cA = getStarThreeColor(starA);
    const cB = getStarThreeColor(starB);
    colors.push(cA.r, cA.g, cA.b, cB.r, cB.g, cB.b);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity,
    linewidth: 1
  });

  const lineSegments = new THREE.LineSegments(geometry, material);
  lineSegments.userData.connectionOpacityScale = 1;
  return lineSegments;
}

function createDistanceLabelSprite(distance, color, opacity, scaleFactor = 1) {
  const distanceText = `${distance < 10 ? distance.toFixed(1) : distance.toFixed(0)} ly`;
  const baseFontSize = 72;
  const { connectionLabelSize } = getConnectionLineParams();
  const fontSize = baseFontSize * connectionLabelSize;
  const { canvas } = createMeasuredTextCanvas(distanceText, {
    font: `${fontSize}px Oswald`,
    paddingX: 10,
    paddingY: 5,
    fillStyle: `#${color.getHexString()}`
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    depthWrite: true,
    depthTest: true,
    transparent: true,
    opacity
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.renderOrder = 5;
  sprite.scale.set(canvas.width / 100 * scaleFactor, canvas.height / 100 * scaleFactor, 1);
  sprite.userData.isConnectionLabel = true;
  return sprite;
}

export function createConnectionLines(stars, pairs, mapType, opacityFactor = 0.5) {
  if (!pairs || pairs.length === 0) return [];
  const safeOpacityFactor = clamp01(opacityFactor);

  const distances = pairs.map(p => p.distance);
  const largestPairDistance = Math.max(...distances);
  const smallestPairDistance = Math.min(...distances);
  const lines = [];

  pairs.forEach(pair => {
    const { starA, starB, distance } = pair;
    let posA, posB;
    const c1 = getStarThreeColor(starA);
    const c2 = getStarThreeColor(starB);
    if (mapType === 'Globe') {
      if (!starA.spherePosition || !starB.spherePosition) return;
      posA = starA.spherePosition.clone();
      posB = starB.spherePosition.clone();
    } else {
      posA = getPosition(starA).clone();
      posB = getPosition(starB).clone();
    }

    const gradientColor = c1.clone().lerp(c2, 0.5);
    const normDist = (distance - smallestPairDistance) / (largestPairDistance - smallestPairDistance || 1);
    const lineThickness = THREE.MathUtils.lerp(getConnectionLineParams().connectionMaxWidth, 1, normDist);
    const lineOpacityScale = THREE.MathUtils.lerp(1.0, 0.3, normDist);
      const lineOpacity = clamp01(lineOpacityScale * safeOpacityFactor);

    let points;
    if (mapType === 'Globe') {
      const curve = new THREE.CatmullRomCurve3(getGreatCirclePoints(posA, posB, GLOBE_RADIUS, 32));
      points = curve.getPoints(32);
    } else {
      points = [posA, posB];
    }

    const group = new THREE.Group();
    group.userData = {
      pairKey: pair.pairKey,
      isConnectionGroup: true
    };
    const geometryLine = new THREE.BufferGeometry().setFromPoints(points);
    const materialLine = new THREE.LineBasicMaterial({
      color: gradientColor,
      transparent: true,
      opacity: lineOpacity,
      linewidth: lineThickness
    });
    const line = new THREE.Line(geometryLine, materialLine);
    line.userData = {
      baseLineWidth: lineThickness,
      connectionOpacityScale: lineOpacityScale
    };
    if (mapType === 'Globe') {
      line.renderOrder = 1;
    }
    group.add(line);

    // Distance label at midpoint
    const midIdx = Math.floor(points.length / 2);
    const midPos = points[midIdx];
    const labelColor = gradientColor.clone();
    const labelScaleFactor = mapType === 'Globe' ? 0.5 : 0.15;
    const sprite = createDistanceLabelSprite(distance, labelColor, lineOpacity, labelScaleFactor);
    if (sprite && midPos) {
      sprite.position.copy(midPos);
      if (mapType === 'Globe') {
        // Offset label slightly outward from sphere surface
        const outward = midPos.clone().normalize().multiplyScalar(2);
        sprite.position.add(outward);
      }
      sprite.userData.connectionOpacityScale = lineOpacityScale;
      group.add(sprite);
    }

    lines.push(group);
  });
  return lines;
}

function getGreatCirclePoints(p1, p2, R, segments) {
  const points = [];
  const start = p1.clone().normalize().multiplyScalar(R);
  const end = p2.clone().normalize().multiplyScalar(R);
  const axis = new THREE.Vector3().crossVectors(start, end).normalize();
  const angle = start.angleTo(end);
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * angle;
    const quaternion = new THREE.Quaternion().setFromAxisAngle(axis, theta);
    const point = start.clone().applyQuaternion(quaternion);
    points.push(point);
  }
  return points;
}
