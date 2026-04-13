import { initIsolationFilter, updateIsolationFilter } from './isolationFilter.js';
import { initDensityFilter, updateDensityFilter } from './densityFilter.js';

let isolationOverlay = null;
let densityOverlay = null;

function removeIsolationOverlay() {
  if (!isolationOverlay) return;
  isolationOverlay.cubesData.forEach(cell => {
    window.trueCoordinatesMap.scene.remove(cell.tcMesh);
    window.mollweideMap.scene.remove(cell.mollweideMesh);
  });
  isolationOverlay.adjacentLines.forEach(object => {
    window.globeMap.scene.remove(object.line);
    window.mollweideMap.scene.remove(object.lineM);
  });
  isolationOverlay = null;
}

function removeDensityOverlay() {
  if (!densityOverlay) return;
  densityOverlay.cubesData.forEach(cell => {
    window.trueCoordinatesMap.scene.remove(cell.tcMesh);
  });
  densityOverlay.adjacentLines.forEach(object => {
    window.globeMap.scene.remove(object.line);
  });
  window.mollweideMap.scene.remove(densityOverlay.textureMesh);
  densityOverlay = null;
}

export function updateDerivedOverlays(allStars, filters, computeAdaptiveGridSize) {
  if (filters.enableIsolationFilter) {
    const gridSize = computeAdaptiveGridSize(filters.isolationGridSize);
    const overlayNeedsRebuild = (
      !isolationOverlay ||
      isolationOverlay.minDistance !== filters.minDistance ||
      isolationOverlay.maxDistance !== filters.maxDistance ||
      isolationOverlay.gridSize !== gridSize
    );

    if (overlayNeedsRebuild) {
      if (isolationOverlay) {
        isolationOverlay.cubesData.forEach(cell => {
          if (window.trueCoordinatesMap.scene.children.includes(cell.tcMesh)) {
            window.trueCoordinatesMap.scene.remove(cell.tcMesh);
          }
          if (window.mollweideMap.scene.children.includes(cell.mollweideMesh)) {
            window.mollweideMap.scene.remove(cell.mollweideMesh);
          }
        });
        isolationOverlay.adjacentLines.forEach(object => {
          if (window.globeMap.scene.children.includes(object.line)) {
            window.globeMap.scene.remove(object.line);
          }
          if (window.mollweideMap.scene.children.includes(object.lineM)) {
            window.mollweideMap.scene.remove(object.lineM);
          }
        });
      }

      isolationOverlay = initIsolationFilter(
        filters.minDistance,
        filters.maxDistance,
        allStars,
        gridSize
      );

      isolationOverlay.cubesData.forEach(cell => {
        window.trueCoordinatesMap.scene.add(cell.tcMesh);
      });
      isolationOverlay.adjacentLines.forEach(object => {
        window.globeMap.scene.add(object.line);
        window.mollweideMap.scene.add(object.lineM);
      });
    }

    updateIsolationFilter(
      allStars,
      isolationOverlay,
      window.trueCoordinatesMap.scene,
      window.globeMap.scene,
      window.mollweideMap.scene
    );
  } else {
    removeIsolationOverlay();
  }

  if (filters.enableDensityFilter) {
    const gridSize = computeAdaptiveGridSize(filters.densityGridSize);
    const overlayNeedsRebuild = (
      !densityOverlay ||
      densityOverlay.minDistance !== filters.minDistance ||
      densityOverlay.maxDistance !== filters.maxDistance ||
      densityOverlay.gridSize !== gridSize
    );

    if (overlayNeedsRebuild) {
      if (densityOverlay) {
        densityOverlay.cubesData.forEach(cell => {
          window.trueCoordinatesMap.scene.remove(cell.tcMesh);
        });
        densityOverlay.adjacentLines.forEach(object => {
          window.globeMap.scene.remove(object.line);
        });
        window.mollweideMap.scene.remove(densityOverlay.textureMesh);
      }

      densityOverlay = initDensityFilter(
        filters.minDistance,
        filters.maxDistance,
        allStars,
        gridSize
      );

      densityOverlay.cubesData.forEach(cell => {
        window.trueCoordinatesMap.scene.add(cell.tcMesh);
      });
      densityOverlay.adjacentLines.forEach(object => {
        window.globeMap.scene.add(object.line);
      });
      window.mollweideMap.scene.add(densityOverlay.textureMesh);
    }

    updateDensityFilter(
      allStars,
      densityOverlay,
      window.trueCoordinatesMap.scene,
      window.globeMap.scene,
      window.mollweideMap.scene
    );
  } else {
    removeDensityOverlay();
  }

  return {
    isolationOverlay,
    densityOverlay
  };
}
