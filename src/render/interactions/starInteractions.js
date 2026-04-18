import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { showTooltip, hideTooltip, pinTooltip, unpinTooltip, getPinnedTooltipPosition } from './tooltips.js';
import { getStarEquirectangularPosition } from '../../shared/uvUtils.js';

const STAR_INTERACTIONS_INPUT_ID = 'enable-star-interactions';
const STAR_INTERACTIONS_BUTTON_ID = 'toggle-star-interactions';

function createHighlight(radius, position, { planar = false } = {}) {
  let geometry;
  if (planar) {
    geometry = new THREE.RingGeometry(radius * 0.72, radius, 48);
  } else {
    geometry = new THREE.SphereGeometry(radius, 16, 16);
  }
  const material = new THREE.MeshBasicMaterial({
    color: 0xffff00,
    wireframe: !planar,
    side: THREE.DoubleSide,
    transparent: planar,
    opacity: planar ? 0.95 : 1,
    depthTest: !planar,
    depthWrite: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  if (planar) {
    mesh.position.z += 0.25;
    mesh.renderOrder = 20;
  }
  return mesh;
}

function getRaycastThreshold(map) {
  switch (map.mapType) {
    case 'Equirectangular':
      return 2.4;
    case 'UVGlobe':
    case 'Globe':
      return 3.2;
    default:
      return 2.0;
  }
}

function resolveIntersectedStar(map, intersects) {
  if (!intersects?.length) return null;
  const intersect = intersects[0];
  if (intersect.object?.userData?.starRef) {
    return intersect.object.userData.starRef;
  }
  let index;
  if (intersect.object instanceof THREE.Points) {
    index = intersect.index;
  } else if (intersect.object instanceof THREE.InstancedMesh) {
    index = intersect.instanceId;
  } else {
    index = map.starGroup.children.indexOf(intersect.object);
  }
  if (index === undefined || index === null || index < 0) return null;
  return map.starObjects[index] || null;
}

function resolveHoveredOrClickedStar(map, raycaster) {
  const starIntersects = raycaster.intersectObjects(map.starGroup.children, true);
  const directStar = resolveIntersectedStar(map, starIntersects);
  if (directStar) return directStar;

  const labelTargets = map.labelManager?.getInteractiveObjects?.() || [];
  if (!labelTargets.length) return null;
  const labelIntersects = raycaster.intersectObjects(labelTargets, true);
  return resolveIntersectedStar(map, labelIntersects);
}

function getStarInteractionsInput() {
  return document.getElementById(STAR_INTERACTIONS_INPUT_ID);
}

export function areStarInteractionsEnabled() {
  return getStarInteractionsInput()?.checked ?? true;
}

function clearStarInteractionState(ctx) {
  ctx.state.selectedStarData = null;
  updateSelectedStarHighlight(ctx);
  unpinTooltip();
  hideTooltip();
}

function syncStarInteractionToggleButton(button, enabled) {
  button.setAttribute('aria-pressed', String(enabled));
  button.textContent = enabled ? 'Tooltips & Star Selection: On' : 'Tooltips & Star Selection: Off';
  button.classList.toggle('is-active', enabled);
  button.classList.toggle('is-inactive', !enabled);
}

export function setupStarInteractionToggle(ctx) {
  const input = getStarInteractionsInput();
  const button = document.getElementById(STAR_INTERACTIONS_BUTTON_ID);
  if (!input || !button) return;

  if (!button.dataset.toggleBound) {
    button.addEventListener('click', () => {
      input.checked = !input.checked;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    button.dataset.toggleBound = 'true';
  }

  if (!input.dataset.toggleBound) {
    input.addEventListener('change', () => {
      const enabled = input.checked;
      syncStarInteractionToggleButton(button, enabled);
      if (!enabled) {
        clearStarInteractionState(ctx);
      }
    });
    input.dataset.toggleBound = 'true';
  }

  syncStarInteractionToggleButton(button, input.checked);
  if (!input.checked) {
    clearStarInteractionState(ctx);
  }
}

export function initStarInteractions(ctx, map) {
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points = { threshold: getRaycastThreshold(map) };
  const mouse = new THREE.Vector2();

  map.canvas.addEventListener('mousemove', event => {
    if (!areStarInteractionsEnabled()) {
      hideTooltip();
      return;
    }

    const rect = map.canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, map.camera);
    const hoveredStar = resolveHoveredOrClickedStar(map, raycaster);
    const selectedStar = ctx.state.selectedStarData;

    if (selectedStar) {
      const pinnedPosition = getPinnedTooltipPosition();
      if (pinnedPosition) {
        showTooltip(pinnedPosition.x, pinnedPosition.y, selectedStar);
      } else {
        showTooltip(event.clientX, event.clientY, selectedStar);
      }
    } else if (hoveredStar) {
      showTooltip(event.clientX, event.clientY, hoveredStar);
    } else {
      hideTooltip();
    }
  });

  map.canvas.addEventListener('click', event => {
    if (!areStarInteractionsEnabled()) {
      hideTooltip();
      return;
    }

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
    const clickedStar = resolveHoveredOrClickedStar(map, raycaster);

    ctx.state.selectedStarData = clickedStar;
    updateSelectedStarHighlight(ctx);
    if (clickedStar) {
      pinTooltip(event.clientX, event.clientY);
      showTooltip(event.clientX, event.clientY, clickedStar);
    } else {
      unpinTooltip();
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
  state.selectedHighlightUv = createHighlight((state.selectedStarData.displaySize || 2) * 0.18 * 1.15, uvPosition, { planar: true });
  state.selectedHighlightUvGlobe = createHighlight((state.selectedStarData.displaySize || 2) * 0.2 * 1.2, globePosition);

  trueCoordinatesMap.scene.add(state.selectedHighlightTrue);
  globeMap.scene.add(state.selectedHighlightGlobe);
  mollweideMap.scene.add(state.selectedHighlightMollweide);
  uvMap.scene.add(state.selectedHighlightUv);
  uvGlobeMap.scene.add(state.selectedHighlightUvGlobe);

  ctx.requestRender();
}
