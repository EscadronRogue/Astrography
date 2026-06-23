import * as THREE from '../../vendor/three.js';
import { showTooltip, hideTooltip, pinTooltip, unpinTooltip, getPinnedTooltipPosition } from './tooltips.js';
import { getStarEquirectangularPosition } from '../../shared/uvUtils.js';
import { cancelScheduledAnimationFrame, scheduleAnimationFrame } from '../../shared/renderScheduler.js';

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
  map.starInteractionDisposer?.();

  const raycaster = new THREE.Raycaster();
  raycaster.params.Points = { threshold: getRaycastThreshold(map) };
  const pointer = new THREE.Vector2();
  let pointerDown = null;
  let pendingMove = null;
  let hoverFrame = 0;

  const hitTest = ({ clientX, clientY }) => {
    const rect = map.canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, map.camera);
    return resolveHoveredOrClickedStar(map, raycaster);
  };

  const isInsideTooltip = ({ clientX, clientY }) => {
    const tooltip = document.getElementById('tooltip');
    if (!tooltip) return false;
    const tRect = tooltip.getBoundingClientRect();
    return (
      clientX >= tRect.left &&
      clientX <= tRect.right &&
      clientY >= tRect.top &&
      clientY <= tRect.bottom
    );
  };

  const showSelectionOrHover = eventLike => {
    if (!areStarInteractionsEnabled()) {
      hideTooltip();
      return;
    }

    const hoveredStar = hitTest(eventLike);
    const selectedStar = ctx.state.selectedStarData;

    if (selectedStar) {
      const pinnedPosition = getPinnedTooltipPosition();
      if (pinnedPosition) {
        showTooltip(pinnedPosition.x, pinnedPosition.y, selectedStar);
      } else {
        showTooltip(eventLike.clientX, eventLike.clientY, selectedStar);
      }
    } else if (hoveredStar) {
      showTooltip(eventLike.clientX, eventLike.clientY, hoveredStar);
    } else {
      hideTooltip();
    }
  };

  const onPointerMove = event => {
    // Touch move usually means map navigation; tap selection is handled on pointerup.
    if (event.pointerType !== 'mouse' && !ctx.state.selectedStarData) return;

    pendingMove = {
      clientX: event.clientX,
      clientY: event.clientY
    };
    if (hoverFrame) return;

    hoverFrame = scheduleAnimationFrame(() => {
      hoverFrame = 0;
      if (pendingMove) {
        showSelectionOrHover(pendingMove);
        pendingMove = null;
      }
    });
  };

  const onPointerDown = event => {
    pointerDown = {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId,
      time: performance.now()
    };
  };

  const onPointerUp = event => {
    if (!areStarInteractionsEnabled()) {
      hideTooltip();
      return;
    }

    if (isInsideTooltip(event)) return;
    if (pointerDown && pointerDown.pointerId !== event.pointerId) return;

    const dx = pointerDown ? event.clientX - pointerDown.clientX : 0;
    const dy = pointerDown ? event.clientY - pointerDown.clientY : 0;
    const moved = Math.hypot(dx, dy);
    const elapsed = pointerDown ? performance.now() - pointerDown.time : 0;
    pointerDown = null;

    const maxTapMovement = event.pointerType === 'mouse' ? 4 : 10;
    if (moved > maxTapMovement || (event.pointerType !== 'mouse' && elapsed > 800)) {
      return;
    }

    const clickedStar = hitTest(event);

    ctx.state.selectedStarData = clickedStar;
    updateSelectedStarHighlight(ctx);
    if (clickedStar) {
      pinTooltip(event.clientX, event.clientY);
      showTooltip(event.clientX, event.clientY, clickedStar);
    } else {
      unpinTooltip();
      hideTooltip();
    }
  };

  const onPointerLeave = () => {
    if (!ctx.state.selectedStarData) hideTooltip();
  };

  map.canvas.addEventListener('pointermove', onPointerMove);
  map.canvas.addEventListener('pointerdown', onPointerDown);
  map.canvas.addEventListener('pointerup', onPointerUp);
  map.canvas.addEventListener('pointerleave', onPointerLeave);

  map.starInteractionDisposer = () => {
    if (hoverFrame) cancelScheduledAnimationFrame(hoverFrame);
    map.canvas.removeEventListener('pointermove', onPointerMove);
    map.canvas.removeEventListener('pointerdown', onPointerDown);
    map.canvas.removeEventListener('pointerup', onPointerUp);
    map.canvas.removeEventListener('pointerleave', onPointerLeave);
    map.starInteractionDisposer = null;
  };

  return map.starInteractionDisposer;
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
