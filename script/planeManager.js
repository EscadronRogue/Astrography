import { disposeObject3D } from '../utils/renderUtils.js';
import {
  createGalacticPlaneMesh,
  createEclipticPlaneMesh,
  createCelestialEquatorMesh,
  createGalacticPlaneGlobe,
  createEclipticPlaneGlobe,
  createCelestialEquatorGlobe,
  createGalacticPlaneMollweide,
  updateGalacticPlaneMollweide,
  createEclipticPlaneMollweide,
  updateEclipticPlaneMollweide,
  createCelestialEquatorMollweide,
  updateCelestialEquatorMollweide,
  createGalacticDirectionLabelsGlobe,
  createGalacticDirectionLabelsMollweide,
  updateGalacticDirectionLabelsMollweide,
  createGalacticDirectionLabelsTrue
} from '../filters/planesFilter.js';

const PLANE_CONFIG = {
  galactic: {
    stateKeys: {
      trueMesh: 'galacticPlaneTrue',
      globeMesh: 'galacticPlaneGlobe',
      mollMesh: 'galacticPlaneMoll',
      trueLabels: 'galacticDirectionLabelsTrue',
      globeLabels: 'galacticDirectionLabelsGlobe',
      mollLabels: 'galacticDirectionLabelsMoll'
    },
    createTrue: opacity => createGalacticPlaneMesh(200, opacity),
    createGlobe: opacity => createGalacticPlaneGlobe(100, undefined, opacity),
    createMoll: opacity => createGalacticPlaneMollweide(undefined, opacity),
    updateMoll: updateGalacticPlaneMollweide,
    createTrueLabels: opacity => createGalacticDirectionLabelsTrue(undefined, opacity),
    createGlobeLabels: opacity => createGalacticDirectionLabelsGlobe(undefined, opacity),
    createMollLabels: opacity => createGalacticDirectionLabelsMollweide(undefined, opacity),
    updateMollLabels: updateGalacticDirectionLabelsMollweide
  },
  ecliptic: {
    stateKeys: {
      trueMesh: 'eclipticPlaneTrue',
      globeMesh: 'eclipticPlaneGlobe',
      mollMesh: 'eclipticPlaneMoll'
    },
    createTrue: opacity => createEclipticPlaneMesh(200, opacity),
    createGlobe: opacity => createEclipticPlaneGlobe(100, undefined, opacity),
    createMoll: opacity => createEclipticPlaneMollweide(undefined, opacity),
    updateMoll: updateEclipticPlaneMollweide
  },
  equator: {
    stateKeys: {
      trueMesh: 'celestialEquatorTrue',
      globeMesh: 'celestialEquatorGlobe',
      mollMesh: 'celestialEquatorMoll'
    },
    createTrue: opacity => createCelestialEquatorMesh(200, opacity),
    createGlobe: opacity => createCelestialEquatorGlobe(100, undefined, opacity),
    createMoll: opacity => createCelestialEquatorMollweide(undefined, opacity),
    updateMoll: updateCelestialEquatorMollweide
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
  const { trueCoordinatesMap, globeMap, mollweideMap } = ctx.getMaps();
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
  if (!state[keys.mollMesh]) {
    state[keys.mollMesh] = config.createMoll(opacity);
    mollweideMap.scene.add(state[keys.mollMesh]);
  } else {
    config.updateMoll(state[keys.mollMesh]);
    state[keys.mollMesh].material.opacity = opacity;
  }

  state[keys.trueMesh].material.opacity = opacity;
  state[keys.globeMesh].material.opacity = opacity;

  if (keys.trueLabels) {
    if (state[keys.trueLabels].length === 0) {
      state[keys.trueLabels] = config.createTrueLabels(opacity);
      state[keys.trueLabels].forEach(label => trueCoordinatesMap.scene.add(label));
    }
    if (state[keys.globeLabels].length === 0) {
      state[keys.globeLabels] = config.createGlobeLabels(opacity);
      state[keys.globeLabels].forEach(label => globeMap.scene.add(label));
    }
    if (state[keys.mollLabels].length === 0) {
      state[keys.mollLabels] = config.createMollLabels(opacity);
      state[keys.mollLabels].forEach(label => mollweideMap.scene.add(label));
    } else {
      config.updateMollLabels(state[keys.mollLabels]);
      state[keys.mollLabels].forEach(label => {
        if (label.material) label.material.opacity = opacity;
      });
    }
  }
}

function clearPlane(ctx, type) {
  const { trueCoordinatesMap, globeMap, mollweideMap } = ctx.getMaps();
  const { state } = ctx;
  const keys = PLANE_CONFIG[type].stateKeys;

  state[keys.trueMesh] = removeMesh(trueCoordinatesMap.scene, state[keys.trueMesh]);
  state[keys.globeMesh] = removeMesh(globeMap.scene, state[keys.globeMesh]);
  state[keys.mollMesh] = removeMesh(mollweideMap.scene, state[keys.mollMesh]);

  if (keys.trueLabels) {
    removeLabelObjects(trueCoordinatesMap.scene, state[keys.trueLabels]);
    removeLabelObjects(globeMap.scene, state[keys.globeLabels]);
    removeLabelObjects(mollweideMap.scene, state[keys.mollLabels]);
    state[keys.trueLabels] = [];
    state[keys.globeLabels] = [];
    state[keys.mollLabels] = [];
  }
}

export function applyPlanes(ctx, flags, opacity = 0.5) {
  if (flags.showGalacticPlane) ensurePlane(ctx, 'galactic', opacity);
  else clearPlane(ctx, 'galactic');

  if (flags.showEclipticPlane) ensurePlane(ctx, 'ecliptic', opacity);
  else clearPlane(ctx, 'ecliptic');

  if (flags.showCelestialEquator) ensurePlane(ctx, 'equator', opacity);
  else clearPlane(ctx, 'equator');
}

export function refreshMollweidePlanes(ctx) {
  const { state } = ctx;
  if (state.showGalacticPlaneFlag && state.galacticPlaneMoll) {
    updateGalacticPlaneMollweide(state.galacticPlaneMoll);
    if (state.galacticDirectionLabelsMoll.length > 0) {
      updateGalacticDirectionLabelsMollweide(state.galacticDirectionLabelsMoll);
    }
  }
  if (state.showEclipticPlaneFlag && state.eclipticPlaneMoll) {
    updateEclipticPlaneMollweide(state.eclipticPlaneMoll);
  }
  if (state.showCelestialEquatorFlag && state.celestialEquatorMoll) {
    updateCelestialEquatorMollweide(state.celestialEquatorMoll);
  }
}
