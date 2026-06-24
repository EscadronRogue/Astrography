import { disposeObject3D } from '../../render/engine/renderUtils.js';
import {
  createConstellationBoundariesForGlobe,
  createConstellationLabelsForGlobe
} from './constellationRenderer.js';
import { createConstellationOverlayForGlobe } from './constellationOverlayRenderer.js';

function disposeSceneObjects(scene, objects) {
  objects.forEach(obj => {
    scene.remove(obj);
    disposeObject3D(obj);
  });
}

export function clearConstellationVisuals(ctx) {
  const { globeMap } = ctx.getMaps();
  const { state } = ctx;

  disposeSceneObjects(globeMap.scene, state.constellationLinesGlobe);
  disposeSceneObjects(globeMap.scene, state.constellationLabelsGlobe);
  disposeSceneObjects(globeMap.scene, state.constellationOverlayGlobe);

  state.constellationLinesGlobe = [];
  state.constellationLabelsGlobe = [];
  state.constellationOverlayGlobe = [];
}

export function rebuildConstellationVisuals(ctx, options) {
  const { globeMap } = ctx.getMaps();
  const { state } = ctx;
  const {
    showConstellationBoundaries,
    showConstellationNames,
    showConstellationOverlay,
    constellationLineOpacity,
    constellationLineWidth,
    constellationNameOpacity
  } = options;

  clearConstellationVisuals(ctx);

  if (showConstellationBoundaries) {
    state.constellationLinesGlobe = createConstellationBoundariesForGlobe(
      constellationLineOpacity,
      constellationLineWidth
    );
    state.constellationLinesGlobe.forEach(line => globeMap.scene.add(line));
  }

  if (showConstellationNames) {
    state.constellationLabelsGlobe = createConstellationLabelsForGlobe(constellationNameOpacity);
    state.constellationLabelsGlobe.forEach(label => globeMap.scene.add(label));
  }

  if (showConstellationOverlay) {
    state.constellationOverlayGlobe = createConstellationOverlayForGlobe();
    state.constellationOverlayGlobe.forEach(mesh => globeMap.scene.add(mesh));
  }
}
