import * as THREE from '../vendor/three.js';
import { TwoDControls } from '../render/interactions/cameraControls.js';
import { EQUIRECT_WIDTH, EQUIRECT_HEIGHT } from '../shared/uvUtils.js';

const EQUIRECT_FRUSTUM_SIZE = 130;

function createEquirectangularSurface({ initialAspect, atlasTexture, rendererElement, requestRender }) {
  const camera = new THREE.OrthographicCamera(
    (-EQUIRECT_FRUSTUM_SIZE * initialAspect) / 2,
    (EQUIRECT_FRUSTUM_SIZE * initialAspect) / 2,
    EQUIRECT_FRUSTUM_SIZE / 2,
    -EQUIRECT_FRUSTUM_SIZE / 2,
    -1000,
    1000
  );
  camera.position.set(0, 0, 10);
  const controls = new TwoDControls(camera, rendererElement, {
    requestRender,
    panSpeed: 0.3,
    minZoom: 0.5,
    maxZoom: 12
  });
  const surfaceMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(EQUIRECT_WIDTH, EQUIRECT_HEIGHT),
    new THREE.MeshBasicMaterial({ map: atlasTexture, transparent: true })
  );
  surfaceMesh.renderOrder = 0;
  return { camera, controls, surfaceMesh, sceneObjects: [surfaceMesh], frustumSize: EQUIRECT_FRUSTUM_SIZE };
}

export function createUvSurface(config) {
  return createEquirectangularSurface(config);
}
