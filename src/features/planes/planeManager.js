import { disposeObject3D } from '../../render/engine/renderUtils.js';
import { isDefaultViewpoint } from '../../shared/viewpoint.js';
import {
  createGalacticPlaneMesh,
  createEclipticPlaneMesh,
  createCelestialEquatorMesh,
  createGalacticPlaneGlobe,
  createEclipticPlaneGlobe,
  createCelestialEquatorGlobe,
  createGalacticDirectionLabelsGlobe,
  createGalacticDirectionLabelsTrue
} from './planeRenderer.js';

const PLANE_CONFIG = {
  galactic: {
    stateKeys: {
      trueMesh: 'galacticPlaneTrue',
      globeMesh: 'galacticPlaneGlobe',
      trueLabels: 'galacticDirectionLabelsTrue',
      globeLabels: 'galacticDirectionLabelsGlobe'
    },
    createTrue: opacity => createGalacticPlaneMesh(200, opacity),
    createGlobe: opacity => createGalacticPlaneGlobe(100, undefined, opacity),
    createTrueLabels: opacity => createGalacticDirectionLabelsTrue(undefined, opacity),
    createGlobeLabels: opacity => createGalacticDirectionLabelsGlobe(undefined, opacity)
  },
  ecliptic: {
    stateKeys: {
      trueMesh: 'eclipticPlaneTrue',
      globeMesh: 'eclipticPlaneGlobe'
    },
    createTrue: opacity => createEclipticPlaneMesh(200, opacity),
    createGlobe: opacity => createEclipticPlaneGlobe(100, undefined, opacity)
  },
  equator: {
    stateKeys: {
      trueMesh: 'celestialEquatorTrue',
      globeMesh: 'celestialEquatorGlobe'
    },
    createTrue: opacity => createCelestialEquatorMesh(200, opacity),
    createGlobe: opacity => createCelestialEquatorGlobe(100, undefined, opacity)
  }
};

function removeLabelObjects(scene, labels) {
  labels.forEach(label => {
    scene.remove(label);
    disposeObject3D(label);
  });
}

function removeMesh(scene, mesh) {
  if (!mesh) return null;
  scene.remove(mesh);
  disposeObject3D(mesh);
  return null;
}

function ensurePlane(ctx, type, opacity) {
  const { trueCoordinatesMap, globeMap } = ctx.getMaps();
  const { state } = ctx;
  const config = PLANE_CONFIG[type];
  const keys = config.stateKeys;

  if (!state[keys.trueMesh]) {
    state[keys.trueMesh] = config.createTrue(opacity);
    trueCoordinatesMap.scene.add(state[keys.trueMesh]);
  }
  if (!state[keys.globeMesh]) {
    state[keys.globeMesh] = config.createGlobe(opacity);
    globeMap.scene.add(state[keys.globeMesh]);
  }

  state[keys.trueMesh].material.opacity = opacity;
  state[keys.globeMesh].material.opacity = opacity;

  if (keys.trueLabels) {
    if (state[keys.trueLabels].length === 0) {
      state[keys.trueLabels] = config.createTrueLabels(opacity);
      state[keys.trueLabels].forEach(label => trueCoordinatesMap.scene.add(label));
    } else {
      state[keys.trueLabels].forEach(label => {
        if (label.material) label.material.opacity = opacity;
      });
    }
    if (state[keys.globeLabels].length === 0) {
      state[keys.globeLabels] = config.createGlobeLabels(opacity);
      state[keys.globeLabels].forEach(label => globeMap.scene.add(label));
    } else {
      state[keys.globeLabels].forEach(label => {
        if (label.material) label.material.opacity = opacity;
      });
    }
  }
}

function clearPlane(ctx, type) {
  const { trueCoordinatesMap, globeMap } = ctx.getMaps();
  const { state } = ctx;
  const keys = PLANE_CONFIG[type].stateKeys;

  state[keys.trueMesh] = removeMesh(trueCoordinatesMap.scene, state[keys.trueMesh]);
  state[keys.globeMesh] = removeMesh(globeMap.scene, state[keys.globeMesh]);

  if (keys.trueLabels) {
    removeLabelObjects(trueCoordinatesMap.scene, state[keys.trueLabels]);
    removeLabelObjects(globeMap.scene, state[keys.globeLabels]);
    state[keys.trueLabels] = [];
    state[keys.globeLabels] = [];
  }
}

export function applyPlanes(ctx, flags, opacity = 0.5) {
  // Galactic plane is meaningful from any viewpoint (all nearby stars
  // are in the same part of the galaxy).
  if (flags.showGalacticPlane) ensurePlane(ctx, 'galactic', opacity);
  else clearPlane(ctx, 'galactic');

  // Ecliptic and celestial equator are Sun/Earth-specific — disable
  // when viewing from a different star.
  const atSol = isDefaultViewpoint();
  if (atSol && flags.showEclipticPlane) ensurePlane(ctx, 'ecliptic', opacity);
  else clearPlane(ctx, 'ecliptic');

  if (atSol && flags.showCelestialEquator) ensurePlane(ctx, 'equator', opacity);
  else clearPlane(ctx, 'equator');
}
