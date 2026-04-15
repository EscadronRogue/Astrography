/**
 * @file Preprocesses star data after loading — calculates 3D positions,
 * Mollweide data, and applies stored edit offsets.
 * Extracted from createApp.js bootstrapApp() to keep bootstrap thin.
 */
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { getStarId, getStarTruePosition, getStarGlobePosition, precalcMollweideData } from '../shared/starUtils.js';
import { updateMollweidePosition } from './mollweideUpdater.js';

/**
 * Calculates all derived positions for each star and applies stored edit state.
 * @param {Array} stars - Array of star records.
 * @param {Object} editManager - The edit manager instance (for label offsets/rotations/scales).
 */
export function preprocessStarData(stars, editManager) {
  stars.forEach(star => {
    star.spherePosition = getStarGlobePosition(star);
    star.truePosition = getStarTruePosition(star);
    precalcMollweideData(star);
    updateMollweidePosition(star);

    const id = getStarId(star);

    if (editManager.starLabelOffsets.has(id)) {
      const off = editManager.starLabelOffsets.get(id);
      star.mollLabelOffset = new THREE.Vector3(off.x, off.y, 0);
    }
    if (editManager.starLabelRotations.has(id)) {
      star.mollLabelRotation = editManager.starLabelRotations.get(id);
    }
    if (editManager.starLabelScales.has(id)) {
      const sc = editManager.starLabelScales.get(id);
      star.mollLabelScale = new THREE.Vector3(sc.x, sc.y, 1);
    }
  });
}
