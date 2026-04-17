import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';

const LABEL_MARGIN = 12;
const LABEL_PADDING_X = 9;
const LABEL_COLLISION_PENALTY = 5000;
const STAR_COLLISION_PENALTY = 180;
const MAX_DEVICE_PIXEL_RATIO = 2;
const LABEL_DIRECTIONS = [
  new THREE.Vector2(1, 0),
  new THREE.Vector2(-1, 0),
  new THREE.Vector2(0.9, -0.43).normalize(),
  new THREE.Vector2(0.9, 0.43).normalize(),
  new THREE.Vector2(-0.9, -0.43).normalize(),
  new THREE.Vector2(-0.9, 0.43).normalize(),
  new THREE.Vector2(0, -1),
  new THREE.Vector2(0, 1)
];

function getStarCacheKey(star) {
  return star?.starId || star?.Source_id || star?.HIP_number || `${star?.Common_name_of_the_star || 'star'}|${star?.RA_in_degrees}|${star?.DEC_in_degrees}`;
}

function rgbaFromHex(hex, alpha = 1) {
  const color = new THREE.Color(hex || '#ffffff');
  return `rgba(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)}, ${alpha})`;
}

function rectsOverlap(a, b) {
  return a.x < (b.x + b.width) &&
    (a.x + a.width) > b.x &&
    a.y < (b.y + b.height) &&
    (a.y + a.height) > b.y;
}

function pointInRect(point, rect) {
  return point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height;
}

export class TrueCoordinateLabelLayer {
  constructor({ canvas, container, state }) {
    this.canvas = canvas;
    this.container = container;
    this.state = state;
    this.labelOpacity = 1;
    this.stars = [];
    this.metricsCache = new Map();
    this.size = { width: 0, height: 0, dpr: 1 };

    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.className = 'true-coordinate-label-overlay';
    this.overlayCanvas.setAttribute('aria-hidden', 'true');
    this.container?.appendChild(this.overlayCanvas);

    const ctx = this.overlayCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('2D canvas context unavailable');
    }
    this.ctx = ctx;
    this.onResize();
  }

  refreshLabels(stars) {
    this.stars = Array.isArray(stars) ? stars : [];
  }

  removeAllLabels() {
    this.stars = [];
    this.metricsCache.clear();
    this.clear();
  }

  setLabelOpacity(opacity) {
    this.labelOpacity = opacity;
  }

  onResize() {
    this.syncOverlayFrame();
  }

  render(camera) {
    if (!this.overlayCanvas.isConnected) return;
    const { width, height } = this.syncOverlayFrame();
    this.clear();
    if (width <= 0 || height <= 0 || this.labelOpacity <= 0.001 || !camera || !this.stars.length) return;

    const candidates = this.collectVisibleCandidates(camera, width, height);
    if (!candidates.length) return;

    const placedBoxes = [];
    const starAnchors = candidates.map(candidate => ({
      x: candidate.starPx.x,
      y: candidate.starPx.y
    }));
    const labelBudget = Math.min(candidates.length, this.getLabelBudget(width, height));

    this.ctx.save();
    this.ctx.textBaseline = 'middle';
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    let placedCount = 0;
    for (const candidate of candidates) {
      if (placedCount >= labelBudget) break;
      const placement = this.computeLabelPlacement(candidate, starAnchors, placedBoxes, width, height);
      if (!placement) continue;
      this.drawPlacement(candidate, placement);
      placedBoxes.push(placement.bounds);
      placedCount += 1;
    }

    this.ctx.restore();
  }

  clear() {
    const { width, height } = this.size;
    this.ctx.clearRect(0, 0, width, height);
  }

  syncOverlayFrame() {
    const width = Math.max(0, Math.round(this.canvas?.clientWidth || 0));
    const height = Math.max(0, Math.round(this.canvas?.clientHeight || 0));
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);

    if (this.container && this.canvas) {
      this.overlayCanvas.style.left = `${this.canvas.offsetLeft}px`;
      this.overlayCanvas.style.top = `${this.canvas.offsetTop}px`;
      this.overlayCanvas.style.width = `${width}px`;
      this.overlayCanvas.style.height = `${height}px`;
    }

    const needsResize =
      this.size.width !== width ||
      this.size.height !== height ||
      this.size.dpr !== dpr;

    if (needsResize) {
      this.overlayCanvas.width = Math.max(1, Math.round(width * dpr));
      this.overlayCanvas.height = Math.max(1, Math.round(height * dpr));
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.size = { width, height, dpr };
    }

    return this.size;
  }

  collectVisibleCandidates(camera, width, height) {
    const candidates = [];
    const cameraInverse = camera.matrixWorldInverse.clone();

    this.stars.forEach(star => {
      if (!star?.displayVisible || !star?.displayName) return;

      const worldPosition = star.truePosition
        ? star.truePosition.clone()
        : new THREE.Vector3(star.x_coordinate || 0, star.y_coordinate || 0, star.z_coordinate || 0);

      const cameraSpace = worldPosition.clone().applyMatrix4(cameraInverse);
      if (!Number.isFinite(cameraSpace.z) || cameraSpace.z >= -camera.near) return;

      const projected = worldPosition.clone().project(camera);
      if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y) || !Number.isFinite(projected.z)) return;
      if (projected.z < -1 || projected.z > 1) return;

      const starPx = {
        x: (projected.x * 0.5 + 0.5) * width,
        y: (-projected.y * 0.5 + 0.5) * height
      };
      if (starPx.x < -48 || starPx.x > width + 48 || starPx.y < -48 || starPx.y > height + 48) return;

      const labelSize = star.displayLabelSize !== undefined ? star.displayLabelSize : (star.displaySize || 1);
      const fontSize = Math.round(THREE.MathUtils.clamp(10 + labelSize * 4, 11, 28));
      const textMetrics = this.getTextMetrics(star, fontSize);
      const projectedRadius = THREE.MathUtils.clamp((star.displaySize || 1) * 3.5, 7, 24);

      candidates.push({
        star,
        starPx,
        fontSize,
        textWidth: textMetrics.width,
        textHeight: textMetrics.height,
        radius: projectedRadius,
        priority: this.getLabelPriority(star)
      });
    });

    return candidates
      .sort((left, right) => right.priority - left.priority);
  }

  getTextMetrics(star, fontSize) {
    const cacheKey = `${getStarCacheKey(star)}|${star.displayName}|${fontSize}`;
    const cached = this.metricsCache.get(cacheKey);
    if (cached) return cached;

    this.ctx.font = `${fontSize}px Oswald`;
    const width = this.ctx.measureText(star.displayName).width;
    const metrics = {
      width,
      height: Math.max(fontSize + 4, 14)
    };

    this.metricsCache.set(cacheKey, metrics);
    if (this.metricsCache.size > 600) {
      this.metricsCache.clear();
      this.metricsCache.set(cacheKey, metrics);
    }

    return metrics;
  }

  getLabelPriority(star) {
    const nameWeight = Math.max(1, (star.displayName || '').length * 0.04);
    const sizeWeight = star.displayLabelSize !== undefined ? star.displayLabelSize : (star.displaySize || 1);
    const magnitudeWeight = Number.isFinite(star.absoluteMagnitude) ? (8 - star.absoluteMagnitude) * 0.35 : 0;
    const distanceWeight = Number.isFinite(star.distance)
      ? THREE.MathUtils.clamp(18 / Math.max(star.distance, 1), 0, 3.5)
      : 0;
    const selectionBoost = this.state?.selectedStarData === star ? 1000 : 0;
    return selectionBoost + sizeWeight * 2.2 + magnitudeWeight + distanceWeight + nameWeight;
  }

  getLabelBudget(width, height) {
    const areaBudget = Math.round((width * height) / 17000);
    return THREE.MathUtils.clamp(areaBudget, 22, 90);
  }

  computeLabelPlacement(candidate, starAnchors, placedBoxes, width, height) {
    const baseRadius = THREE.MathUtils.clamp(candidate.radius + candidate.fontSize * 0.55 + 8, 14, 40);
    const radii = [baseRadius, baseRadius + 10, baseRadius + 22, baseRadius + 34];
    let bestPlacement = null;

    for (const radius of radii) {
      for (const direction of LABEL_DIRECTIONS) {
        const placement = this.evaluatePlacement(candidate, direction, radius, starAnchors, placedBoxes, width, height);
        if (!placement) continue;
        if (!bestPlacement || placement.score < bestPlacement.score) {
          bestPlacement = placement;
        }
      }
    }

    return bestPlacement;
  }

  evaluatePlacement(candidate, direction, radius, starAnchors, placedBoxes, width, height) {
    const anchorX = candidate.starPx.x + direction.x * radius;
    const anchorY = THREE.MathUtils.clamp(
      candidate.starPx.y + direction.y * radius,
      LABEL_MARGIN + candidate.textHeight * 0.5,
      height - LABEL_MARGIN - candidate.textHeight * 0.5
    );
    const preferRight = direction.x >= 0;
    const drawX = preferRight
      ? anchorX + LABEL_PADDING_X
      : anchorX - LABEL_PADDING_X - candidate.textWidth;
    const bounds = {
      x: drawX,
      y: anchorY - candidate.textHeight * 0.5,
      width: candidate.textWidth,
      height: candidate.textHeight
    };

    if (bounds.x < LABEL_MARGIN || bounds.x + bounds.width > width - LABEL_MARGIN) {
      return null;
    }

    let overlapPenalty = 0;
    placedBoxes.forEach(box => {
      if (rectsOverlap(bounds, box)) {
        overlapPenalty += LABEL_COLLISION_PENALTY;
      }
    });

    let starPenalty = 0;
    const expandedBounds = {
      x: bounds.x - 5,
      y: bounds.y - 4,
      width: bounds.width + 10,
      height: bounds.height + 8
    };
    starAnchors.forEach(anchor => {
      const isCurrentStar = anchor.x === candidate.starPx.x && anchor.y === candidate.starPx.y;
      if (!isCurrentStar && pointInRect(anchor, expandedBounds)) {
        starPenalty += STAR_COLLISION_PENALTY;
      }
    });

    const verticalPenalty = Math.abs(anchorY - candidate.starPx.y) * 0.35;
    const radialPenalty = radius * 0.9;
    const sideBias = direction.x < 0 ? 5 : 0;
    const edgePenalty = anchorY < 72 || anchorY > height - 72 ? 35 : 0;
    const score = overlapPenalty + starPenalty + verticalPenalty + radialPenalty + sideBias + edgePenalty;

    return {
      score,
      anchorX,
      anchorY,
      textX: drawX,
      textY: anchorY,
      bounds
    };
  }

  drawPlacement(candidate, placement) {
    const opacity = THREE.MathUtils.clamp(this.labelOpacity, 0, 1);
    const starColor = candidate.star.displayColor || '#ffffff';
    const connectorColor = rgbaFromHex(starColor, opacity * 0.2);
    const textColor = rgbaFromHex(starColor, opacity);
    const haloColor = `rgba(0,0,0,${opacity * 0.9})`;

    this.ctx.beginPath();
    this.ctx.moveTo(candidate.starPx.x, candidate.starPx.y);
    this.ctx.lineTo(placement.anchorX, placement.anchorY);
    this.ctx.strokeStyle = connectorColor;
    this.ctx.lineWidth = 1.15;
    this.ctx.stroke();

    this.ctx.font = `${candidate.fontSize}px Oswald`;
    this.ctx.fillStyle = textColor;
    this.ctx.strokeStyle = haloColor;
    this.ctx.lineWidth = 3.25;
    this.ctx.strokeText(candidate.star.displayName, placement.textX, placement.textY);
    this.ctx.fillText(candidate.star.displayName, placement.textX, placement.textY);
  }
}
