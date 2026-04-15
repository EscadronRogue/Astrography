import { buildSerializableEditState } from './editPersistence.js';

export function getLineKeyFromObject(obj) {
  const posAttr = obj.geometry && obj.geometry.getAttribute('position');
  if (!posAttr || posAttr.array.length < 6) return null;
  const arr = posAttr.array;
  return [arr[0], arr[1], arr[2], arr[3], arr[4], arr[5]].join(',');
}

export function getSerializableEditState(manager) {
  return buildSerializableEditState(manager);
}
