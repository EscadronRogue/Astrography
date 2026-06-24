// This module implements the Isolation Filter using a uniform grid (formerly the low density filter).
import * as THREE from '../../vendor/three.js';
import { lightenColor } from '../density/densityColorScale.js';
import { radToSphere, getGreatCirclePoints, vectorToRaDec } from '../../shared/geometryUtils.js';
import { loadConstellationCenters, getConstellationCenters, loadConstellationBoundaries, getConstellationBoundaries, loadConstellationFullNames } from '../constellations/constellationRenderer.js';
import { getNearestCellDistance, populateCellDistanceCaches } from '../../shared/cellDistanceCache.js';
import { disposeObject3D } from '../../render/engine/renderUtils.js';
import { InstancedCellLayer, createCellVisualState } from '../overlays/instancedCellLayer.js';
import { logWarn } from '../../shared/logger.js';

// Helper to create line materials that support color and opacity gradients.
function createGradientLineMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    vertexColors: true,
    uniforms: {},
    vertexShader: `
      attribute float alpha;
      varying vec4 vColor;
      void main() {
        vColor = vec4(color, alpha);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec4 vColor;
      void main() {
        gl_FragColor = vColor;
      }
    `
  });
}

function createIsolationLineLayer() {
  const line = new THREE.LineSegments(new THREE.BufferGeometry(), createGradientLineMaterial());
  line.renderOrder = 2;
  line.frustumCulled = false;
  line.visible = false;
  return line;
}

function replaceLineGeometry(line, positions, colors, alphas) {
  if (!line) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('alpha', new THREE.Float32BufferAttribute(alphas, 1));
  line.geometry?.dispose?.();
  line.geometry = geometry;
  line.visible = positions.length > 0;
}

function createLineBuffers() {
  return {
    positions: [],
    colors: [],
    alphas: []
  };
}

function pushInterpolatedLineVertex(buffers, point, cell1, cell2, t) {
  const c1 = cell1.tcMesh.material.color;
  const c2 = cell2.tcMesh.material.color;
  buffers.positions.push(point.x, point.y, point.z);
  buffers.colors.push(
    THREE.MathUtils.lerp(c1.r, c2.r, t),
    THREE.MathUtils.lerp(c1.g, c2.g, t),
    THREE.MathUtils.lerp(c1.b, c2.b, t)
  );
  buffers.alphas.push(THREE.MathUtils.lerp(
    cell1.tcMesh.material.opacity,
    cell2.tcMesh.material.opacity,
    t
  ));
}

// IsolationGridOverlay encapsulates the uniform grid logic for the Isolation Filter.
class IsolationGridOverlay {
  /**
   * @param {number} minDistance - Minimum distance (LY) for cells.
   * @param {number} maxDistance - Maximum distance (LY) for cells.
   * @param {number} gridSize - The size (in LY) of each cell.
   */
  constructor(minDistance, maxDistance, gridSize = 2) {
    this.minDistance = parseFloat(minDistance);
    this.maxDistance = parseFloat(maxDistance);
    this.gridSize = gridSize;
    this.cubesData = [];
    this.adjacentLines = [];
    this.regionClusters = [];
    this.regionLabelsGroupTC = new THREE.Group();
    this.regionLabelsGroupGlobe = new THREE.Group();
    this.revision = 0;
    this.tcCellLayer = null;
    this.globeLineLayer = null;
  }

  createGrid(stars) {
    const halfExt = Math.ceil(this.maxDistance / this.gridSize) * this.gridSize;
    this.cubesData = [];

    for (let x = -halfExt; x <= halfExt; x += this.gridSize) {
      for (let y = -halfExt; y <= halfExt; y += this.gridSize) {
        for (let z = -halfExt; z <= halfExt; z += this.gridSize) {
          const posTC = new THREE.Vector3(
            x + this.gridSize / 2,
            y + this.gridSize / 2,
            z + this.gridSize / 2
          );
          const distFromCenter = posTC.length();
          // Only include cells within the specified distance range.
          if (distFromCenter < this.minDistance || distFromCenter > this.maxDistance) continue;
          
          const cubeTC = createCellVisualState(posTC, 0x0000ff, 1);
          const squareGlobe = createCellVisualState(null, 0x0000ff, 1);
          let projectedPos;
          let ra, dec;
          if (distFromCenter < 1e-6) {
            projectedPos = new THREE.Vector3(0, 0, 0);
            ra = 0; dec = 0;
          } else {
            ra = Math.atan2(-posTC.z, -posTC.x);
            dec = Math.asin(posTC.y / distFromCenter);
            const radius = 100;
            projectedPos = new THREE.Vector3(
              -radius * Math.cos(dec) * Math.cos(ra),
               radius * Math.sin(dec),
              -radius * Math.cos(dec) * Math.sin(ra)
            );
          }
          squareGlobe.position.copy(projectedPos);
          const nrm = projectedPos.clone().normalize();
          let right = new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0), nrm);
          if (right.lengthSq() < 1e-6) right.set(1,0,0);
          right.normalize();
          const upVec = new THREE.Vector3().crossVectors(nrm, right).normalize();
          const mat4 = new THREE.Matrix4().makeBasis(right, upVec, nrm);
          squareGlobe.setRotationFromMatrix(mat4);

          const cell = {
            tcMesh: cubeTC,
            globeMesh: squareGlobe,
            tcPos: posTC,
            grid: {
              ix: Math.round(x / this.gridSize),
              iy: Math.round(y / this.gridSize),
              iz: Math.round(z / this.gridSize)
            },
            active: false,
            raRad: ra,
            decRad: dec
          };

          cell.id = this.cubesData.length;
          this.cubesData.push(cell);
        }
      }
    }
    this.tcCellLayer = new InstancedCellLayer({
      geometry: new THREE.BoxGeometry(this.gridSize, this.gridSize, this.gridSize),
      count: this.cubesData.length
    });
    populateCellDistanceCaches(this.cubesData, this.getExtendedStars(stars));
    this.computeAdjacentLines();
    this.globeLineLayer = createIsolationLineLayer();
  }

  getSceneObjects() {
    return {
      tc: this.tcCellLayer ? [this.tcCellLayer.mesh] : [],
      globe: this.globeLineLayer ? [this.globeLineLayer] : []
    };
  }

  dispose() {
    this.tcCellLayer?.dispose();
    disposeObject3D(this.globeLineLayer);
    disposeObject3D(this.regionLabelsGroupTC);
    disposeObject3D(this.regionLabelsGroupGlobe);
  }

  getExtendedStars(stars) {
    return stars.filter(star => {
      const distance = star.distance;
      return distance >= Math.max(0, this.minDistance - 10) && distance <= this.maxDistance + 10;
    });
  }

  computeAdjacentLines() {
    this.adjacentLines = [];
    const cellMap = new Map();
    this.cubesData.forEach(cell => {
      const key = `${cell.grid.ix},${cell.grid.iy},${cell.grid.iz}`;
      cellMap.set(key, cell);
    });
    const directions = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dy === 0 && dz === 0) continue;
          if (dx > 0 || (dx === 0 && dy > 0) || (dx === 0 && dy === 0 && dz > 0)) {
            directions.push({ dx, dy, dz });
          }
        }
      }
    }
    directions.forEach(dir => {
      this.cubesData.forEach(cell => {
        const neighborKey = `${cell.grid.ix + dir.dx},${cell.grid.iy + dir.dy},${cell.grid.iz + dir.dz}`;
        if (cellMap.has(neighborKey)) {
          const neighbor = cellMap.get(neighborKey);
          this.adjacentLines.push({ cell1: cell, cell2: neighbor });
        }
      });
    });
  }

  appendGlobeEdge(buffers, cell1, cell2) {
    const points = getGreatCirclePoints(cell1.globeMesh.position, cell2.globeMesh.position, 100, 16);
    const lastIndex = points.length - 1;
    for (let index = 0; index < lastIndex; index += 1) {
      pushInterpolatedLineVertex(buffers, points[index], cell1, cell2, index / lastIndex);
      pushInterpolatedLineVertex(buffers, points[index + 1], cell1, cell2, (index + 1) / lastIndex);
    }
  }

  rebuildLineLayers() {
    const globeBuffers = createLineBuffers();
    this.adjacentLines.forEach(({ cell1, cell2 }) => {
      if (!cell1?.active || !cell2?.active) return;
      this.appendGlobeEdge(globeBuffers, cell1, cell2);
    });
    replaceLineGeometry(this.globeLineLayer, globeBuffers.positions, globeBuffers.colors, globeBuffers.alphas);
  }

  update(stars, sceneTC, sceneGlobe, options = {}) {
    const isolationVal = Number.isFinite(options.isolation) ? options.isolation : 7;
    const toleranceVal = Number.isFinite(options.isolationTolerance) ? options.isolationTolerance : 0;

    // Compute isolation distances and min/max for color/opacity scaling
    const isoDistances = [];
    this.cubesData.forEach(cell => {
      const isoDist = getNearestCellDistance(cell, toleranceVal);
      cell.isoDist = isoDist;
      isoDistances.push(isoDist);
    });

    const minIso = Math.min(...isoDistances);
    const maxIso = Math.max(...isoDistances);
    const baseBlue = new THREE.Color(0x0000ff);
    const lightBlue = lightenColor(baseBlue.clone(), 0.4);
    const brightBlue = baseBlue.clone();

    // Update each cell's visual state based on isolation
    this.cubesData.forEach(cell => {
      const isoDist = cell.isoDist;
      const isoRatio = (maxIso === minIso) ? 0 : (isoDist - minIso) / (maxIso - minIso);

      cell.active = (isoDist >= isolationVal);

      const color = lightBlue.clone().lerp(brightBlue, isoRatio);
      const alpha = THREE.MathUtils.lerp(0.1, 0.5, isoRatio);

      cell.tcMesh.visible = cell.active;
      cell.tcMesh.material.opacity = alpha;
      cell.tcMesh.material.color.copy(color);

      const distRatio = Math.min(1, cell.tcPos.length() / this.maxDistance);
      const scale = THREE.MathUtils.lerp(20.0, 0.1, distRatio);

      cell.globeMesh.visible = cell.active;
      cell.globeMesh.material.opacity = alpha;
      cell.globeMesh.material.color.copy(color);
      cell.globeMesh.scale.set(scale, scale, 1);

    });
    this.tcCellLayer?.update(this.cubesData, cell => cell.tcMesh);

    this.rebuildLineLayers();

    // Re‑add the updated meshes to the scenes. Only the cubes are shown for
    this.revision += 1;
  }

  async assignConstellationsToCells() {
    await loadConstellationCenters();
    await loadConstellationBoundaries();
    const centers = getConstellationCenters();
    const boundaries = getConstellationBoundaries();
    if (!boundaries.length) {
      logWarn('No constellation boundaries available!');
      return;
    }
    function minAngularDistanceToSegment(cellPos, p1, p2) {
      const angleToP1 = cellPos.angleTo(p1);
      const angleToP2 = cellPos.angleTo(p2);
      const arcAngle = p1.angleTo(p2);
      const perpAngle = Math.asin(Math.abs(cellPos.clone().normalize().dot(p1.clone().cross(p2).normalize())));
      if (angleToP1 + angleToP2 - arcAngle < 1e-3) {
        return THREE.MathUtils.radToDeg(perpAngle);
      } else {
        return THREE.MathUtils.radToDeg(Math.min(angleToP1, angleToP2));
      }
    }
    // Assumes loadConstellationFullNames is available.
    const namesMapping = await loadConstellationFullNames();
    
    this.cubesData.forEach(cell => {
      if (!cell.active) return;
      const cellPos = cell.globeMesh.position.clone();
      let nearestBoundary = null;
      let minBoundaryDist = Infinity;
      boundaries.forEach(boundary => {
         const p1 = radToSphere(boundary.ra1, boundary.dec1, 100);
         const p2 = radToSphere(boundary.ra2, boundary.dec2, 100);
         const angDist = minAngularDistanceToSegment(cellPos, p1, p2);
         if (angDist < minBoundaryDist) {
           minBoundaryDist = angDist;
           nearestBoundary = boundary;
         }
      });
      if (!nearestBoundary) {
        cell.constellation = "Unknown";
        return;
      }
      const abbr1 = nearestBoundary.const1.toUpperCase();
      const abbr2 = nearestBoundary.const2 ? nearestBoundary.const2.toUpperCase() : null;
      const fullName1 = namesMapping[abbr1] || toTitleCase(abbr1);
      const fullName2 = abbr2 ? (namesMapping[abbr2] || toTitleCase(abbr2)) : null;
      
      const bp1 = radToSphere(nearestBoundary.ra1, nearestBoundary.dec1, 100);
      const bp2 = radToSphere(nearestBoundary.ra2, nearestBoundary.dec2, 100);
      let normal = bp1.clone().cross(bp2).normalize();
      const center1 = centers.find(c => {
        const nameUp = c.name.toUpperCase();
        return nameUp === abbr1 || nameUp === fullName1.toUpperCase();
      });
      let center1Pos = center1 ? radToSphere(center1.ra, center1.dec, 100) : null;
      if (center1Pos && normal.dot(center1Pos) < 0) {
        normal.negate();
      }
      const cellSide = normal.dot(cellPos);
      if (cellSide >= 0) {
        cell.constellation = toTitleCase(fullName1);
      } else if (fullName2) {
        cell.constellation = toTitleCase(fullName2);
      } else {
        const { ra: cellRA, dec: cellDec } = vectorToRaDec(cellPos);
        let bestConstellation = "Unknown";
        let minAngle = Infinity;
        centers.forEach(center => {
          const centerRAdeg = THREE.MathUtils.radToDeg(center.ra);
          const centerDecdeg = THREE.MathUtils.radToDeg(center.dec);
          const cosDelta = Math.sin(THREE.MathUtils.degToRad(cellDec)) * Math.sin(THREE.MathUtils.degToRad(centerDecdeg)) +
                           Math.cos(THREE.MathUtils.degToRad(cellDec)) * Math.cos(THREE.MathUtils.degToRad(centerDecdeg)) *
                           Math.cos(THREE.MathUtils.degToRad(cellRA - centerRAdeg));
          const dist = Math.acos(THREE.MathUtils.clamp(cosDelta, -1, 1));
          if (dist < minAngle) {
            minAngle = dist;
            bestConstellation = toTitleCase(center.name);
          }
        });
        cell.constellation = bestConstellation;
      }
    });
  }
}

// Helper: Convert string to Title Case.
function toTitleCase(str) {
  if (!str || typeof str !== "string") return str;
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

// Exported functions for external use.
export function initIsolationFilter(minDistance, maxDistance, starArray, gridSize = 2) {
  const overlay = new IsolationGridOverlay(minDistance, maxDistance, gridSize);
  overlay.createGrid(starArray);
  return overlay;
}

export function updateIsolationFilter(starArray, overlay, sceneTC, sceneGlobe, options = {}) {
  if (!overlay) return;
  overlay.update(starArray, sceneTC, sceneGlobe, options);
}
