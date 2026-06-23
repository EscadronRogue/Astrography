import { createExportSceneModel } from './exportSceneModel.js';

function makeLayer(kind, layer, payload = {}) {
  return { kind, layer, ...payload };
}

export function collectMollweideSvgSceneModel(mollweideMap) {
  const state = mollweideMap?.state || {};
  const scene = mollweideMap?.scene;
  const clippedLayers = [];
  const labelLayers = [];
  const borderLayers = [];

  if (state.showConstellationOverlayFlag) {
    (state.constellationOverlayMoll || []).forEach(mesh => {
      clippedLayers.push(makeLayer('meshTriangles', 'constellation-overlay', { mesh }));
    });
  }

  if (state.enableDensityFilterFlag && state.densityOverlay) {
    clippedLayers.push(makeLayer('canvasImage', 'density-heatmap', { overlay: state.densityOverlay }));
  }

  if (state.showCloudDensityFlag && Array.isArray(state.cloudDensityOverlays)) {
    state.cloudDensityOverlays.forEach(overlay => {
      clippedLayers.push(makeLayer('canvasImage', 'cloud-density-heatmap', { overlay }));
      clippedLayers.push(makeLayer('overlayCells', 'cloud-density-cells', { overlay, shape: 'circle' }));
    });
  }

  if (state.enableIsolationFilterFlag && state.isolationOverlay) {
    clippedLayers.push(makeLayer('overlayCells', 'isolation-cells', { overlay: state.isolationOverlay, shape: 'rect' }));
    (state.isolationOverlay.adjacentLines || []).forEach(lineState => {
      clippedLayers.push(makeLayer('lineSegments', 'isolation-lines', {
        object: lineState.lineM,
        strokeWidth: 0.22
      }));
    });
  }

  if (state.showCloudsFlag && Array.isArray(scene?.userData?.cloudOverlays)) {
    scene.userData.cloudOverlays.forEach(mesh => {
      clippedLayers.push(makeLayer('meshTriangles', 'cloud-lines', { mesh }));
    });
  }

  if (state.showGalacticPlaneFlag) {
    clippedLayers.push(makeLayer('lineSegments', 'galactic-plane', {
      object: state.galacticPlaneMoll,
      strokeWidth: 0.45,
      color: '#ffffff'
    }));
    clippedLayers.push(makeLayer('spriteLabels', 'galactic-labels', {
      labels: state.galacticDirectionLabelsMoll,
      fontSize: 4,
      color: '#ffffff'
    }));
  }

  if (state.showEclipticPlaneFlag) {
    clippedLayers.push(makeLayer('lineSegments', 'ecliptic-plane', {
      object: state.eclipticPlaneMoll,
      strokeWidth: 0.3,
      color: '#ffff00'
    }));
  }

  if (state.showCelestialEquatorFlag) {
    clippedLayers.push(makeLayer('lineSegments', 'celestial-equator', {
      object: state.celestialEquatorMoll,
      strokeWidth: 0.3,
      color: '#ff0000'
    }));
  }

  if (state.showConstellationBoundariesFlag) {
    (state.constellationLinesMoll || []).forEach(line => {
      clippedLayers.push(makeLayer('lineSegments', 'constellation-boundaries', { object: line }));
    });
  }

  if (state.showConstellationNamesFlag) {
    labelLayers.push(makeLayer('spriteLabels', 'constellation-labels', {
      labels: state.constellationLabelsMoll,
      color: '#ffffff'
    }));
  }

  if (mollweideMap?.mollweideBorder) {
    borderLayers.push(makeLayer('meshTriangles', 'mollweide-border', { mesh: mollweideMap.mollweideBorder }));
  }

  return {
    ...createExportSceneModel({
      kind: 'mollweide-svg-scene',
      formatFamily: 'vector-svg',
      formats: ['svg'],
      mapType: mollweideMap?.mapType || 'Mollweide',
      width: 400,
      height: 200,
      renderer: 'svg-scene-model',
      source: mollweideMap,
      layers: [...clippedLayers, ...labelLayers, ...borderLayers],
      metadata: {
        clippedLayerCount: clippedLayers.length,
        labelLayerCount: labelLayers.length,
        borderLayerCount: borderLayers.length
      }
    }),
    stars: Array.isArray(mollweideMap?.starObjects) ? mollweideMap.starObjects : [],
    connections: Array.isArray(mollweideMap?.connectionObjects) ? mollweideMap.connectionObjects : [],
    starOpacity: mollweideMap?.starOpacity ?? 1,
    labelOpacity: mollweideMap?.labelOpacity ?? 1,
    connectionOpacity: mollweideMap?.connectionOpacity ?? 0.5,
    clippedLayers,
    labelLayers,
    borderLayers
  };
}
