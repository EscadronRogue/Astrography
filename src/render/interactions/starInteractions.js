import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { showTooltip, hideTooltip } from './tooltips.js';
import { getStarEquirectangularPosition } from '../../shared/uvUtils.js';

function createHighlight(radius, position) {
  const geometry = new THREE.SphereGeometry(radius, 16, 16);
  const material = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  return mesh;
}

export function initStarInteractions(ctx, map) {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  map.canvas.addEventListener('mousemove', event => {
    if (ctx.state.selectedStarData) return;
    const rect = map.canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, map.camera);
    const intersects = raycaster.intersectObjects(map.starGroup.children, true);

    if (intersects.length > 0) {
      const intersect = intersects[0];
      let index;
      if (intersect.object instanceof THREE.Points) {
        index = intersect.index;
      } else if (intersect.object instanceof THREE.InstancedMesh) {
        index = intersect.instanceId;
      } else {
        index = map.starGroup.children.indexOf(intersect.object);
      }
      if (index !== undefined && map.starObjects[index]) {
        showTooltip(event.clientX, event.clientY, map.starObjects[index]);
      }
    } else {
      hideTooltip();
    }
  });

  map.canvas.addEventListener('click', event => {
    const tooltip = document.getElementById('tooltip');
    if (tooltip) {
      const tRect = tooltip.getBoundingClientRect();
      if (
        event.clientX >= tRect.left &&
        event.clientX <= tRect.right &&
        event.clientY >= tRect.top &&
        event.clientY <= tRect.bottom
      ) {
        return;
      }
    }

    const rect = map.canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, map.camera);
    const intersects = raycaster.intersectObjects(map.starGroup.children, true);
    let clickedStar = null;

    if (intersects.length > 0) {
      const intersect = intersects[0];
      let index;
      if (intersect.object instanceof THREE.Points) {
        index = intersect.index;
      } else if (intersect.object instanceof THREE.InstancedMesh) {
        index = intersect.instanceId;
      } else {
        index = map.starGroup.children.indexOf(intersect.object);
      }
      if (index !== undefined && map.starObjects[index]) {
        clickedStar = map.starObjects[index];
      }
    }

    ctx.state.selectedStarData = clickedStar;
    updateSelectedStarHighlight(ctx);
    if (clickedStar) {
      showTooltip(event.clientX, event.clientY, clickedStar);
    } else {
      hideTooltip();
    }
  });
}

export function updateSelectedStarHighlight(ctx) {
  const { trueCoordinatesMap, globeMap, mollweideMap, uvMap, uvGlobeMap } = ctx.getMaps();
  const state = ctx.state;

  if (state.selectedHighlightTrue) {
    trueCoordinatesMap.scene.remove(state.selectedHighlightTrue);
    state.selectedHighlightTrue.geometry?.dispose?.();
    state.selectedHighlightTrue.material?.dispose?.();
    state.selectedHighlightTrue = null;
  }
  if (state.selectedHighlightGlobe) {
    globeMap.scene.remove(state.selectedHighlightGlobe);
    state.selectedHighlightGlobe.geometry?.dispose?.();
    state.selectedHighlightGlobe.material?.dispose?.();
    state.selectedHighlightGlobe = null;
  }
  if (state.selectedHighlightMollweide) {
    mollweideMap.scene.remove(state.selectedHighlightMollweide);
    state.selectedHighlightMollweide.geometry?.dispose?.();
    state.selectedHighlightMollweide.material?.dispose?.();
    state.selectedHighlightMollweide = null;
  }
  if (state.selectedHighlightUv) {
    uvMap.scene.remove(state.selectedHighlightUv);
    state.selectedHighlightUv.geometry?.dispose?.();
    state.selectedHighlightUv.material?.dispose?.();
    state.selectedHighlightUv = null;
  }
  if (state.selectedHighlightUvGlobe) {
    uvGlobeMap.scene.remove(state.selectedHighlightUvGlobe);
    state.selectedHighlightUvGlobe.geometry?.dispose?.();
    state.selectedHighlightUvGlobe.material?.dispose?.();
    state.selectedHighlightUvGlobe = null;
  }

  if (!state.selectedStarData) return;

  const truePosition = state.selectedStarData.truePosition
    ? state.selectedStarData.truePosition
    : new THREE.Vector3(
      state.selectedStarData.x_coordinate,
      state.selectedStarData.y_coordinate,
      state.selectedStarData.z_coordinate
    );
  const globePosition = state.selectedStarData.spherePosition
    ? state.selectedStarData.spherePosition
    : ctx.projectStarGlobe(state.selectedStarData);
  const mollweidePosition = state.selectedStarData.mollweidePosition
    ? state.selectedStarData.mollweidePosition
    : ctx.projectStarMollweide(state.selectedStarData);
  const uvPosition = state.selectedStarData.equirectPosition
    ? state.selectedStarData.equirectPosition
    : getStarEquirectangularPosition(state.selectedStarData);

  state.selectedHighlightTrue = createHighlight((state.selectedStarData.displaySize || 2) * 0.2 * 1.2, truePosition);
  state.selectedHighlightGlobe = createHighlight((state.selectedStarData.displaySize || 2) * 0.2 * 1.2, globePosition);
  state.selectedHighlightMollweide = createHighlight((state.selectedStarData.displaySize || 2) * 0.4 * 1.2, mollweidePosition);
  state.selectedHighlightUv = createHighlight((state.selectedStarData.displaySize || 2) * 0.5 * 1.2, uvPosition);
  state.selectedHighlightUvGlobe = createHighlight((state.selectedStarData.displaySize || 2) * 0.2 * 1.2, globePosition);

  trueCoordinatesMap.scene.add(state.selectedHighlightTrue);
  globeMap.scene.add(state.selectedHighlightGlobe);
  mollweideMap.scene.add(state.selectedHighlightMollweide);
  uvMap.scene.add(state.selectedHighlightUv);
  uvGlobeMap.scene.add(state.selectedHighlightUvGlobe);

  ctx.requestRender();
}
