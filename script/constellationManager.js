import { disposeObject3D } from '../utils/renderUtils.js';
import {
  createConstellationBoundariesForGlobe,
  createConstellationLabelsForGlobe,
  createConstellationBoundariesForMollweide,
  updateConstellationBoundariesForMollweide,
  createConstellationLabelsForMollweide
} from '../filters/constellationFilter.js';
import {
  createConstellationOverlayForGlobe,
  createConstellationOverlayForMollweide
} from '../filters/constellationOverlayFilter.js';

function disposeSceneObjects(scene, objects) {
  objects.forEach(obj => {
    scene.remove(obj);
    disposeObject3D(obj);
  });
}

export function clearConstellationVisuals(ctx) {
  const { globeMap, mollweideMap } = ctx.getMaps();
  const { state } = ctx;

  disposeSceneObjects(globeMap.scene, state.constellationLinesGlobe);
  disposeSceneObjects(globeMap.scene, state.constellationLabelsGlobe);
  disposeSceneObjects(mollweideMap.scene, state.constellationLinesMoll);
  disposeSceneObjects(mollweideMap.scene, state.constellationLabelsMoll);
  disposeSceneObjects(globeMap.scene, state.constellationOverlayGlobe);
  disposeSceneObjects(mollweideMap.scene, state.constellationOverlayMoll);

  state.constellationLinesGlobe = [];
  state.constellationLabelsGlobe = [];
  state.constellationOverlayGlobe = [];
  state.constellationLinesMoll = [];
  state.constellationLabelsMoll = [];
  state.constellationOverlayMoll = [];
}

export function rebuildConstellationVisuals(ctx, options) {
  const { globeMap, mollweideMap } = ctx.getMaps();
  const { state, editManager } = ctx;
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

    state.constellationLinesMoll = createConstellationBoundariesForMollweide(
      constellationLineOpacity,
      constellationLineWidth
    );
    state.constellationLinesMoll.forEach(line => {
      mollweideMap.scene.add(line);
      editManager.applyStoredLineEdits(line);
    });
  }

  if (showConstellationNames) {
    state.constellationLabelsGlobe = createConstellationLabelsForGlobe(constellationNameOpacity);
    state.constellationLabelsGlobe.forEach(label => globeMap.scene.add(label));

    state.constellationLabelsMoll = createConstellationLabelsForMollweide(constellationNameOpacity);
    state.constellationLabelsMoll.forEach(label => mollweideMap.scene.add(label));
    editManager.registerMollweideEditableLabels();
  }

  if (showConstellationOverlay) {
    state.constellationOverlayGlobe = createConstellationOverlayForGlobe();
    state.constellationOverlayGlobe.forEach(mesh => globeMap.scene.add(mesh));

    state.constellationOverlayMoll = createConstellationOverlayForMollweide();
    state.constellationOverlayMoll.forEach(mesh => mollweideMap.scene.add(mesh));
  }
}

export function refreshMollweideConstellationVisuals(ctx) {
  const { mollweideMap } = ctx.getMaps();
  const { state, editManager } = ctx;

  if (state.showConstellationBoundariesFlag) {
    if (state.constellationLinesMoll.length === 0) {
      state.constellationLinesMoll = createConstellationBoundariesForMollweide();
      state.constellationLinesMoll.forEach(line => {
        mollweideMap.scene.add(line);
        editManager.applyStoredLineEdits(line);
      });
    } else {
      state.constellationLinesMoll.forEach(line => updateConstellationBoundariesForMollweide(line));
    }
  }

  if (state.showConstellationNamesFlag) {
    disposeSceneObjects(mollweideMap.scene, state.constellationLabelsMoll);
    state.constellationLabelsMoll = createConstellationLabelsForMollweide();
    state.constellationLabelsMoll.forEach(label => mollweideMap.scene.add(label));
    editManager.registerMollweideEditableLabels();
  }

  if (state.showConstellationOverlayFlag) {
    disposeSceneObjects(mollweideMap.scene, state.constellationOverlayMoll);
    state.constellationOverlayMoll = createConstellationOverlayForMollweide();
    state.constellationOverlayMoll.forEach(mesh => mollweideMap.scene.add(mesh));
  }
}
