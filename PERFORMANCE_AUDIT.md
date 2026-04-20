# Astrography Performance Audit

**Date:** April 20, 2026  
**Scope:** Low FPS / slow rendering across all views (Globe, True Coordinates, UV Map, Mollweide)

---

## Executive Summary

The application has **no dirty-flag system** — every animation frame renders all 5 map managers unconditionally, and many hot paths allocate thousands of temporary objects (Vector3, Color, arrays) that trigger garbage collection stalls. The density and cloud overlay systems create individual meshes per grid cell instead of using instanced rendering, and canvas heatmaps redraw fully every frame with expensive blur filters. The filter pipeline re-scans the entire star set on every change without memoization.

Addressing the top 5 issues alone should yield a significant FPS improvement.

---

## Critical Issues (Highest FPS Impact)

### 1. All 5 Map Managers Render Every Frame — No Dirty Checking

**File:** `src/app/renderFrame.js` (lines 1–13)

```javascript
mapManagers.forEach(manager => manager.render());
```

Every `requestAnimationFrame` callback renders all 5 managers (TrueCoordinates, Globe, Mollweide, UV, UVGlobe) regardless of whether their content changed or whether they're even visible. The visibility check (`canvas.isConnected`) is buried inside each manager's `render()` method — after label work has already started.

**Fix:** Add a `dirty` flag per manager. Only render managers that are both visible and dirty. Filter at the `renderFrame` level before calling into managers.

---

### 2. Thousands of Vector3 and Color Allocations Per Star Update

**File:** `src/app/mapManager.js` (lines 244–298)

```javascript
// Called for EVERY star, EVERY update:
const pos = star.truePosition ? star.truePosition.clone() : new THREE.Vector3(...);
const color = new THREE.Color(star.displayColor || '#ffffff');
```

For ~10,000 stars, each `updateStarPositions` call creates ~10,000 `Vector3` clones and ~10,000 `Color` objects. These are immediately discarded, causing heavy GC pressure and frame stutters.

**Fix:** Read position components directly into the typed array (`positions[i*3] = star.truePosition.x`). For colors, use a single reusable `THREE.Color` instance or a hex-to-RGB utility that writes directly into the color array.

---

### 3. Density Grid Creates Individual Meshes Per Cell (No Instancing)

**File:** `src/features/density/densityOverlay.js` (lines 53–100)

Each grid cell gets 3 separate meshes (BoxGeometry for TC, PlaneGeometry for Globe, CircleGeometry for Mollweide), each with its own cloned material. A grid with `maxDistance=50` and `gridSize=2` creates a 50×50×50 volume — potentially thousands of cells, each consuming a draw call.

The same pattern exists in `src/features/clouds/cloudDensityOverlay.js` (lines 39–121).

**Fix:** Replace individual meshes with `THREE.InstancedMesh`. One instanced mesh per view can render all cells in a single draw call. Store per-instance color/opacity in instance attributes.

---

### 4. Per-Frame Color Object Allocation in Density Update Loop

**File:** `src/features/density/densityOverlay.js` (lines 289–320)

```javascript
this.cubesData.forEach(cell => {
  let color = new THREE.Color(0xffffff);       // new allocation
  color = new THREE.Color(0x0000ff).lerp(new THREE.Color(0xffffff), t);  // 2 more
  const baseRed = new THREE.Color(0xff0000);   // another
  const lightRed = lightenColor(baseRed.clone(), 0.4);  // clone + new
});
```

Every density update creates 3–5 Color objects per active cell. With hundreds of cells, this is thousands of allocations per update.

**Fix:** Pre-allocate a small set of reusable Color objects (`_tempColor1`, `_tempColor2`) at module scope and reuse them in the loop.

---

### 5. Canvas Heatmap Redraws Fully Every Frame With Blur Filter

**File:** `src/features/density/densityOverlay.js` (lines 218–252)

```javascript
ctx.filter = 'blur(8px)';
this.cubesData.forEach(cell => {
  const grd = ctx.createRadialGradient(...);  // new gradient per cell
  ctx.fill();
});
this.texture.needsUpdate = true;
```

The `drawHeatmap()` method clears the entire canvas, applies an expensive CSS blur filter, creates a new radial gradient for every active cell, and marks the texture dirty — all on every update. The same pattern exists in `cloudDensityOverlay.js`.

**Fix:** Only redraw when density data actually changes (use a revision check). Cache the heatmap canvas and only re-composite when thresholds or cell states change. Apply blur once to a cached result, not every frame.

---

## Major Issues (Significant Impact)

### 6. DOM Thrashing for Signature Building Every Frame

**File:** `src/app/uvMapManager.js` (lines 281–359)

The UV map manager reads 15+ form inputs via `document.getElementById()` and creates `new FormData()` objects on every `updateMap()` call to build layer signatures — even when nothing has changed.

**Fix:** Cache form values in a state object. Update the cache only on `change`/`input` events, not on every render cycle.

---

### 7. Filter Pipeline Creates Throwaway Arrays on Every Run

**Files:**
- `src/features/filters/logic/colorFilter.js` (line 29): `...stars.map(s => Math.abs(s.z_coordinate))`
- `src/features/filters/logic/sizeFilter.js` (lines 34–38): `stars.map(s => s.distance).filter(Number.isFinite)`
- `src/features/filters/logic/opacityFilter.js` (lines 23–27): same pattern for magnitudes
- `src/features/filters/pipeline/index.js` (line 39): unnecessary `.slice()`

Each filter pass creates intermediate arrays. Min/max calculations use `Math.max(...spread)` which can stack-overflow on large arrays and always allocates a temporary array.

**Fix:** Compute min/max in a single `for` loop with no intermediate array. Memoize range values (distMin/distMax, magMin/magMax) and only recompute when the filtered star set actually changes.

---

### 8. Stellar Class Filter Queries DOM on Every Filter Run

**File:** `src/features/filters/logic/stellarClassFilter.js` (lines 42–56)

Four `querySelectorAll()` calls iterate ~100+ checkboxes to rebuild filter maps on every filter invocation, even if no checkbox changed.

**Fix:** Build the checkbox state map once on page load, update it via change event listeners, and pass it into the filter function.

---

### 9. Mollweide Geometry Disposed and Rebuilt Every Frame During Drag

**File:** `src/app/mapManager.js` (lines 399–435) and `src/features/density/densityOverlay.js` (lines 345–373)

```javascript
obj.lineM.geometry.dispose();
obj.lineM.geometry = buildWideLineGeometry(pts, this.mollLineWidth);
```

During Mollweide panning, connection and density line geometries are disposed and recreated every frame. The Mollweide scheduler (`mollweideUpdater.js`) fires on every RAF during drag with no throttling beyond the single-frame debounce.

**Fix:** Update geometry vertex positions in-place (`geometry.attributes.position.array`) instead of disposing and recreating. Add frame-skipping or a minimum interval (e.g., 32ms) for Mollweide refreshes during drag.

---

### 10. Cloud Overlay Uses O(n²) Neighbor Search

**File:** `src/features/clouds/cloudOverlay.js` (lines 73–88)

```javascript
for (let i = 0; i < cloudStars.length; i++) {
  for (let j = 0; j < cloudStars.length; j++) {
    const d = current.pos.distanceTo(other.pos);
  }
  neighbors.sort((a, b) => a.distance - b.distance);
}
```

For each cloud star, distances to all other stars are computed and sorted. This is O(n² log n) per cloud.

**Fix:** Use a spatial hash grid or k-d tree for neighbor lookup.

---

### 11. Connection Distance Bounds Recomputed Every Update

**File:** `src/app/mapManager.js` (lines 38–48)

```javascript
function getConnectionDistanceBounds(connectionObjs) {
  const distances = connectionObjs.map(pair => pair.distance);
  return { largestDistance: Math.max(...distances), smallestDistance: Math.min(...distances) };
}
```

Called on every connection update. Creates a temporary array and spreads into Math.max/min.

**Fix:** Cache bounds and only recompute when the connection set changes (check length + a revision counter).

---

## Moderate Issues (Worth Addressing)

### 12. All Star Projections Recomputed on Any Filter Change

**File:** `src/features/filters/pipeline/filterPipeline.js` (lines 66–91)

When any filter changes (even just opacity), sphere positions, equirectangular positions, true positions, and Mollweide positions are all recomputed for every star. The Mollweide projection uses Newton-Raphson iteration (up to 10 iterations per star).

**Fix:** Only reproject when the underlying star set changes, not on every filter application.

---

### 13. Label Canvas Textures Created Per Connection Without Pooling

**File:** `src/app/mapManager.js` (lines 544–575)

Each connection distance label creates a new `<canvas>` element, measures text, and creates a `THREE.CanvasTexture`. No texture atlas or pooling is used.

**Fix:** Use a texture atlas for label rendering, or pool and reuse canvas textures.

---

### 14. O(n²) Density Segmentation Despite Existing Cell Map

**File:** `src/features/density/densitySegmentation.js` (lines 174–195)

`computeInterconnectedCell()` uses a nested loop to find neighbors, despite a spatial `cellMap` already being available at line 62.

**Fix:** Use the existing `cellMap` for O(1) neighbor lookup instead of the O(n²) scan.

---

### 15. Feature Layer Couples Unrelated Overlays

**File:** `src/app/uvMapManager.js` (line 332)

`connectionOpacity` is hashed into the feature layer signature. Changing connection opacity forces a full redraw of constellation boundaries, density overlays, planes, and other unrelated features.

**Fix:** Separate connection rendering into its own layer with its own signature.

---

## Recommended Fix Priority

| Priority | Issue | Expected Impact |
|----------|-------|----------------|
| **P0** | #1 — Dirty-flag rendering | Eliminates redundant renders of hidden/unchanged views |
| **P0** | #2 — Vector3/Color allocations | Eliminates ~20,000 object allocations per star update |
| **P0** | #5 — Canvas heatmap caching | Eliminates per-frame full-canvas redraws |
| **P1** | #3 — InstancedMesh for density | Reduces thousands of draw calls to a handful |
| **P1** | #4 — Reuse Color objects | Eliminates thousands of allocations in density loop |
| **P1** | #7 — Filter pipeline memoization | Eliminates redundant array creation and min/max scans |
| **P1** | #9 — In-place geometry updates | Eliminates per-frame geometry disposal during drag |
| **P2** | #6 — Cache DOM form values | Eliminates per-frame DOM reads |
| **P2** | #8 — Cache checkbox state | Eliminates per-filter DOM queries |
| **P2** | #10 — Spatial hash for clouds | Reduces O(n²) to ~O(n) |
| **P2** | #12 — Conditional reprojection | Avoids unnecessary trig on every filter change |
| **P3** | #11, #13, #14, #15 | Incremental improvements |

---

## Quick Wins (< 1 Hour Each)

1. **Reuse a single `THREE.Color` and avoid `.clone()` in `updateStarPositions`** — replace 4 lines in `mapManager.js` to eliminate ~20k allocations per update.

2. **Pre-allocate temp Colors in `densityOverlay.js` update loop** — declare 2–3 module-level `THREE.Color` instances and reuse them.

3. **Cache `getConnectionDistanceBounds` result** — add a length check before recomputing.

4. **Add `if (!dirty) return;` to `mapManager.render()`** — set dirty on camera move, star update, or overlay change.

5. **Replace `Math.max(...array)` with a `for` loop** — avoids temporary array creation and potential stack overflow on large datasets.
