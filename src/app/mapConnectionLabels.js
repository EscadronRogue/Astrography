import * as THREE from '../vendor/three.js';
import { getConnectionLineParams } from '../features/connections/connectionSettings.js';
import { getConnectionDistanceBounds } from '../features/connections/connectionRenderState.js';
import { CONNECTION_LABEL_BASE_FONT } from '../shared/constants.js';
import { createMeasuredTextCanvas } from '../shared/textCanvas.js';
import { clamp01, normalizeHexColor } from '../shared/colorParsing.js';

function getTruePositionVector(star) {
  const position = star?.truePosition;
  if (position?.clone) return position;
  if (position && ['x', 'y', 'z'].every(axis => Number.isFinite(position[axis]))) {
    return new THREE.Vector3(position.x, position.y, position.z);
  }
  if (!star) return null;
  return new THREE.Vector3(star.x_coordinate, star.y_coordinate, star.z_coordinate);
}

function getDistanceLabelText(distance) {
  return `${distance < 10 ? distance.toFixed(1) : distance.toFixed(0)} ly`;
}

export function createTrueCoordinateDistanceLabel(pair, bounds, opacityFactor) {
  const { starA, starB, distance } = pair || {};
  if (!starA || !starB || !Number.isFinite(distance)) return null;

  const posA = getTruePositionVector(starA);
  const posB = getTruePositionVector(starB);
  if (!posA || !posB) return null;

  const { connectionLabelSize } = getConnectionLineParams();
  if (connectionLabelSize <= 0.01) return null;

  const largest = bounds.largestDistance;
  const smallest = bounds.smallestDistance;
  const normDist = (distance - smallest) / (largest - smallest || 1);
  const lineOpacityScale = THREE.MathUtils.lerp(1.0, 0.3, normDist);
  const lineOpacity = clamp01(lineOpacityScale * clamp01(opacityFactor));
  const mid = posA.clone().lerp(posB, 0.5);
  const fontSize = CONNECTION_LABEL_BASE_FONT * connectionLabelSize;
  const c1 = new THREE.Color(normalizeHexColor(starA.displayColor, '#ffffff'));
  const c2 = new THREE.Color(normalizeHexColor(starB.displayColor, '#ffffff'));
  const labelColor = c1.clone().lerp(c2, 0.5);

  const { canvas } = createMeasuredTextCanvas(getDistanceLabelText(distance), {
    font: `${fontSize}px Oswald`,
    paddingX: 10,
    paddingY: 5,
    height: fontSize + 10,
    fillStyle: `#${labelColor.getHexString()}`
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    depthWrite: false,
    depthTest: true,
    transparent: true,
    opacity: lineOpacity
  });
  const sprite = new THREE.Sprite(spriteMat);
  sprite.renderOrder = 5;
  const scale = 0.15;
  sprite.scale.set(canvas.width / 100 * scale, canvas.height / 100 * scale, 1);
  sprite.position.copy(mid);
  sprite.userData.connectionOpacityScale = lineOpacityScale;
  return sprite;
}

export function addTrueCoordinateDistanceLabels(connectionGroup, connectionObjs, opacityFactor) {
  if (!connectionGroup) return;
  const { connectionLabelSize } = getConnectionLineParams();
  if (connectionLabelSize <= 0.01) return;

  const bounds = getConnectionDistanceBounds(connectionObjs);
  connectionObjs.forEach(pair => {
    const sprite = createTrueCoordinateDistanceLabel(pair, bounds, opacityFactor);
    if (sprite) connectionGroup.add(sprite);
  });
}
