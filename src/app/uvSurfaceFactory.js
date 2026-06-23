import * as THREE from '../vendor/three.js';
import { ThreeDControls, TwoDControls } from '../render/interactions/cameraControls.js';
import { EQUIRECT_WIDTH, EQUIRECT_HEIGHT } from '../shared/uvUtils.js';
import { GLOBE_RADIUS } from '../shared/constants.js';

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

function createUvGlobeSurface({ initialAspect, atlasTexture, rendererElement, requestRender }) {
  const camera = new THREE.PerspectiveCamera(60, initialAspect, 0.1, 10000);
  camera.position.set(0, 0, 220);
  const controls = new ThreeDControls(camera, rendererElement, {
    requestRender,
    minDistance: 120,
    maxDistance: 700,
    target: new THREE.Vector3(0, 0, 0)
  });
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
  const pointLight = new THREE.PointLight(0xffffff, 0.6);
  pointLight.position.set(160, 140, 220);
  const surfaceMesh = new THREE.Mesh(
    new THREE.SphereGeometry(GLOBE_RADIUS, 96, 64),
    new THREE.MeshBasicMaterial({ map: atlasTexture, side: THREE.FrontSide })
  );
  surfaceMesh.renderOrder = 0;
  return { camera, controls, surfaceMesh, sceneObjects: [ambientLight, pointLight, surfaceMesh], frustumSize: null };
}

export function createUvSurface(config) {
  return config.mapType === 'Equirectangular'
    ? createEquirectangularSurface(config)
    : createUvGlobeSurface(config);
}
