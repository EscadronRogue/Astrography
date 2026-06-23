import * as THREE from '../../vendor/three.js';
import { cachedRadToMollweide, getMollweideLambda0 } from '../../shared/geometryUtils.js';

export function updateEditOverlayPosition(manager) {
  if (!manager.editOverlay) return;
  if (!manager.selectedLabel) {
    manager.editOverlay.style.display = 'none';
    return;
  }
  const rect = manager.mollweideMap.canvas.getBoundingClientRect();
  const pos = manager.selectedLabel.position.clone().project(manager.mollweideMap.camera);
  const x = (pos.x * 0.5 + 0.5) * rect.width + rect.left;
  const y = (-pos.y * 0.5 + 0.5) * rect.height + rect.top;
  manager.editOverlay.style.display = 'block';
  manager.editOverlay.style.left = `${x}px`;
  manager.editOverlay.style.top = `${y}px`;

  const center = manager.selectedLabel.position.clone();
  const halfW = manager.selectedLabel.scale.x / 2;
  const rightVec = new THREE.Vector3(1, 0, 0)
    .applyQuaternion(manager.mollweideMap.camera.quaternion)
    .multiplyScalar(halfW);
  const leftWorld = center.clone().sub(rightVec);
  const rightWorld = center.clone().add(rightVec);
  const lp = leftWorld.clone().project(manager.mollweideMap.camera);
  const rp = rightWorld.clone().project(manager.mollweideMap.camera);
  const lx = (lp.x * 0.5 + 0.5) * rect.width + rect.left;
  const rx = (rp.x * 0.5 + 0.5) * rect.width + rect.left;
  const labelWidth = Math.abs(rx - lx);
  const iconSize = 36;
  const offset = labelWidth / 2 + iconSize / 2 + 10;
  manager.rotateHandle.style.left = `-${offset}px`;
  manager.scaleHandle.style.left = `${offset}px`;
}

export function registerEditableLabels(manager) {
  manager.editableLabels = [];
  manager.mollweideMap.labelManager.sprites.forEach((sprite, star) => {
    const id = manager.getStarId(star);
    sprite.userData = sprite.userData || {};
    sprite.userData.editType = 'star';
    sprite.userData.editId = id;
    sprite.userData.lineObj = manager.mollweideMap.labelManager.lines.get(star);
    sprite.userData.starRef = star;
    sprite.userData.anchorFunc = () => star.mollweidePosition.clone();
    manager.editableLabels.push(sprite);
    if (manager.starLabelOffsets.has(id)) {
      const off = manager.starLabelOffsets.get(id);
      star.mollLabelOffset = new THREE.Vector3(off.x, off.y, 0);
      sprite.position.copy(star.mollweidePosition.clone().add(star.mollLabelOffset));
    }
    if (manager.starLabelRotations.has(id)) {
      const rot = manager.starLabelRotations.get(id);
      sprite.material.rotation = rot;
      star.mollLabelRotation = rot;
    }
    if (manager.starLabelScales.has(id)) {
      const sc = manager.starLabelScales.get(id);
      sprite.scale.set(sc.x, sc.y, 1);
      star.mollLabelScale = new THREE.Vector3(sc.x, sc.y, 1);
    }
  });

  manager.constellationLabelsMoll.forEach(sprite => {
    if (!sprite.userData) return;
    sprite.userData.editType = 'constellation';
    sprite.userData.editId = sprite.userData.name;
    sprite.userData.anchorFunc = () => {
      const p = cachedRadToMollweide(sprite.userData.ra, sprite.userData.dec, 100, getMollweideLambda0());
      return new THREE.Vector3(p.x, p.y, 0);
    };
    manager.editableLabels.push(sprite);
    const anchor = sprite.userData.anchorFunc();
    sprite.position.copy(anchor);
    if (manager.constellationLabelOffsets.has(sprite.userData.name)) {
      const off = manager.constellationLabelOffsets.get(sprite.userData.name);
      const offsetVec = new THREE.Vector3(off.x, off.y, 0);
      sprite.position.add(offsetVec);
      sprite.userData.offset = offsetVec.clone();
    }
    if (manager.starLabelRotations.has(sprite.userData.name)) {
      const rot = manager.starLabelRotations.get(sprite.userData.name);
      sprite.material.rotation = rot;
    }
    if (manager.starLabelScales.has(sprite.userData.name)) {
      const sc = manager.starLabelScales.get(sprite.userData.name);
      sprite.scale.set(sc.x, sc.y, 1);
    }
  });

  manager.galacticDirectionLabelsMoll.forEach(sprite => {
    if (!sprite.userData) return;
    sprite.userData.editType = 'galactic';
    sprite.userData.editId = sprite.userData.name;
    sprite.userData.anchorFunc = () => {
      const p = cachedRadToMollweide(sprite.userData.ra, sprite.userData.dec, 100, getMollweideLambda0());
      return new THREE.Vector3(p.x, p.y, 0);
    };
    manager.editableLabels.push(sprite);
    const anchor = sprite.userData.anchorFunc();
    sprite.position.copy(anchor);
    if (manager.galacticLabelOffsets.has(sprite.userData.name)) {
      const off = manager.galacticLabelOffsets.get(sprite.userData.name);
      const offsetVec = new THREE.Vector3(off.x, off.y, 0);
      sprite.position.add(offsetVec);
      sprite.userData.offset = offsetVec.clone();
    }
    if (manager.starLabelRotations.has(sprite.userData.name)) {
      const rot = manager.starLabelRotations.get(sprite.userData.name);
      sprite.material.rotation = rot;
    }
    if (manager.starLabelScales.has(sprite.userData.name)) {
      const sc = manager.starLabelScales.get(sprite.userData.name);
      sprite.scale.set(sc.x, sc.y, 1);
    }
  });
}
