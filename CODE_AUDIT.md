# Astrography Code Audit

A comprehensive review of the codebase covering professionalism, consistency, efficiency, code weight, performance, ergonomics, and aesthetics.

---

## 1. Dead Abstraction Layers (Code Weight)

The biggest "code smell" in the project is a significant amount of files that exist only to re-export symbols from elsewhere. They add module depth, create navigational confusion, and provide zero business logic.

### Domain layer: 4 files, 0 consumers

Every file in `src/domain/` is a single-line re-export. Not a single file in the codebase imports from the domain layer.

```
src/domain/coordinates/coordinateTransforms.js  -->  re-exports from shared/starUtils.js
src/domain/coordinates/projectionMath.js        -->  re-exports from shared/geometryUtils.js
src/domain/stars/starClassification.js          -->  re-exports from shared/stellarClassUtils.js
src/domain/stars/starMetrics.js                 -->  re-exports from shared/starUtils.js
```

**Recommendation:** Delete the entire `src/domain/` directory.

### Data layer wrappers: 2 unnecessary files

- `src/data/repositories/starRepository.js` is a 6-line wrapper that just calls `loadStarData()`. The only consumer (`createApp.js`) imports the loader directly anyway.
- `src/data/adapters/normalizeStarRecord.js` is a 2-line re-export from `loadStarData.js`.

### Feature facade files: 4 unnecessary wrappers

- `src/features/clouds/cloudRenderer.js` (2 lines) re-exports from `cloudOverlay.js`
- `src/features/clouds/cloudDensityRenderer.js` (2 lines) re-exports from `cloudDensityOverlay.js`
- `src/features/connections/connectionsRenderer.js` (7 lines) re-exports from `connectionPairs.js`
- `src/features/connections/connectionsBuilder.js` (2 lines) re-exports from `connectionPairs.js`

**Total: ~12 files that can be deleted**, reducing file count by ~13% with zero behavior change.

---

## 2. Monolithic Files (Professionalism)

### uvMapManager.js: 1,111 lines

This is the largest and most concerning file. A single class handles canvas composition, label placement, star rendering, constellation drawing, density overlays, cloud overlays, isolation overlays, connection lines, wrap handling, and atlas texture management.

Key extraction candidates:

- **Label placement engine** (lines 595-708): The `computeUvLabelPlacement()` and `evaluateUvLabelCandidate()` methods contain a self-contained O(n^2) placement algorithm that could be its own module.
- **Canvas layer renderers**: `drawStars()`, `drawStarLabels()`, `drawConstellationNames()`, `drawConstellationBoundaries()`, `drawDensityOverlay()`, `drawCloudOverlay()`, `drawIsolationOverlay()` are each independent renderers that could live in separate files.
- **Wrap utilities**: `drawWrappedCircle()`, `drawWrappedLine()`, `drawWrappedArc()` (lines 1032-1100) form a cohesive wrap-handling module.

### mapManager.js: 692 lines

Contains 3-way branching on `mapType` throughout, with duplicate geometry setup between Mollweide and other types. The `addStars()`, `updateStarPositions()`, and connection methods all repeat the same map-type conditional pattern.

**Recommendation:** Extract a strategy pattern or separate renderer classes per map type.

---

## 3. Performance Issues

### O(n^2) label placement (uvMapManager.js, line 676)

Every label candidate is checked against all already-placed labels. For 1,000+ stars this becomes significant:

```javascript
for (const box of placedBoxes) {
  // overlap check per candidate per star
}
```

**Fix:** Use a spatial index (grid bucketing or quadtree) to only check nearby labels.

### O(n^5) concave hull (ConcaveGeometry.js)

The alpha-shape algorithm uses 4 nested loops over all points plus an inner loop checking circumsphere membership. This is unusable for more than ~10 points.

**Fix:** Replace with a Quickhull or Delaunay-based approach (O(n log n)).

### Static content redrawn every frame

Constellation boundaries, names, and cloud overlays are recomputed and redrawn on every canvas composition cycle, despite being static between filter changes.

**Fix:** Cache these layers as pre-rendered canvases and only invalidate them when the underlying data changes.

### No geometry reuse in mapManager.js

`addStars()` recreates all geometry and materials from scratch even when the star count hasn't changed. Three.js BufferGeometry attributes can be updated in-place.

**Fix:** Separate geometry allocation from attribute updates. Only rebuild when the count changes.

### Radial gradients created per cell per frame (uvMapManager.js, line 818)

The density overlay creates `ctx.createRadialGradient()` for each cell on every draw. Canvas gradients are relatively expensive.

**Fix:** Pre-render gradient patterns to an offscreen canvas and use `drawImage()` or pattern fills.

### 3x draw call multiplication for wrapping (uvMapManager.js, line 1032)

`drawWrappedCircle()` draws 3 copies of every circle unconditionally. Most circles don't straddle the map boundary.

**Fix:** Check if the circle is near the wrap boundary before drawing extra copies.

---

## 4. Consistency Issues

### Naming convention mismatches

The filter pipeline outputs keys like `showConstellationBoundaries`, but the app state expects `showConstellationBoundariesFlag`. An entire mapping layer (`filterStateStore.js` with its `FILTER_RESULT_MAPPINGS`) exists solely to bridge this gap.

**Fix:** Unify naming across filter pipeline and app state. Eliminate the mapping.

### Duplicate hash functions

`hashString()` and `mixHash()` are copy-pasted identically in both `mapManager.js` and `uvMapManager.js`.

**Fix:** Move to `shared/` and import from both files.

### Inconsistent module patterns

The codebase mixes three different patterns with no clear rationale:

| Pattern | Files |
|---------|-------|
| Class with constructor init | `LabelManager`, `ExportManager` |
| Class with separate `setup()` | `ExportManager` (mixed) |
| Plain functions / module state | `buildSidebar.js`, `filterPipeline.js` |
| External state initialization | `editState.js` modifies an external object |

**Fix:** Standardize on one pattern per category (e.g., classes for stateful managers, plain functions for stateless transforms).

### Inconsistent constant definitions

- `constants.js` defines `GLOBE_RADIUS = 100`
- `uvMapManager.js` locally defines `GLOBE_RADIUS = 99`
- `connectionPairs.js` defines `GC_SEGMENTS = 32` instead of using `CIRCLE_SEGMENTS` from constants

**Fix:** Centralize all constants. Remove local redefinitions.

### Event handler binding

Some modules use arrow function properties (`this.onPointerDown = e => {...}`), others use inline anonymous functions in `addEventListener()`. The former allows cleanup; the latter creates unreferenced handlers that can never be removed.

---

## 5. Memory Leaks

### Event listeners never removed

73 `addEventListener` calls found across the codebase. Critical leak points:

- **ExportManager**: `pointerdown`, `pointermove`, `pointerup` listeners added in `setup()` are never removed when export mode is exited.
- **EditManager**: Canvas event listeners attached in constructor with no cleanup path.
- **buildSidebar.js**: Menu toggle, fullscreen, and `fullscreenchange` listeners never cleaned up.

### Three.js textures from canvases

`LabelManager` creates canvas-based textures for label sprites but never explicitly disposes the texture when labels are cleared. The canvas element is garbage-collected but the GPU-side texture may leak.

### Scene traversal without complete disposal

`disposeSceneObjects()` calls `disposeObject3D()` but doesn't verify that nested children, shared materials, or textures are fully disposed.

---

## 6. Camera Controls Duplication (Code Weight)

`ThreeDControls` and `TwoDControls` share ~110 lines of duplicated code (50% of the file):

- Constructor setup (44 lines near-identical)
- `onPointerDown()` implementations
- `onPointerMove()` with duplicated pinch logic
- `onPointerUp()` pointer tracking
- `getPinchDistance()` is character-for-character identical

**Fix:** Extract a `BaseCameraControls` class or use composition to share the common pointer/pinch handling.

---

## 7. Magic Numbers (Professionalism)

Hardcoded values scattered throughout without constants or documentation:

| Location | Value | Meaning |
|----------|-------|---------|
| `labelManager.js:58` | `40, 68` | Font size bounds |
| `labelManager.js:59` | `0.68, 1.44` | World scale range |
| `labelManager.js:60` | `1.45, 2.45` | Offset distance range |
| `labelManager.js:192-193` | `12/7, 10/5` | Padding values |
| `exportManager.js:95` | `7680, 4320` | Export resolution |
| `exportManager.js:121` | `8192` | Tile size cap |
| `colorUtils.js:35` | `70%, 50%` | HSL saturation/lightness |
| `uvMapManager.js:468` | `'#8fb5ff'` | Raw hex colors throughout |

**Fix:** Create a `theme.js` or extend `constants.js` for visual tuning parameters with descriptive names.

---

## 8. State Management (Ergonomics)

### appStateFactory.js: Verbose proxy boilerplate

47 nearly identical getter/setter pairs are manually written out:

```javascript
get cachedStars() { return _cachedStars; },
set cachedStars(v) { _cachedStars = v; },
get selectedStarData() { return _selectedStarData; },
set selectedStarData(v) { _selectedStarData = v; },
// ... 45 more
```

**Fix:** Generate proxies from a schema object:

```javascript
const STATE_FIELDS = ['cachedStars', 'selectedStarData', ...];
const state = Object.fromEntries(
  STATE_FIELDS.map(key => {
    let value;
    return [key, { get: () => value, set: (v) => value = v }];
  })
);
```

### Global mutable state in geometryUtils.js

`mollweideLambda0` is a module-level mutable variable that projection functions silently depend on. This creates hidden coupling and makes testing difficult.

**Fix:** Pass `lambda0` as an explicit parameter to all projection functions.

---

## 9. Error Handling (Professionalism)

### Missing timeouts

`loadStarData()` fetches 10 JSON files with no timeout or abort controller. On slow connections, the app can hang indefinitely with no feedback.

### Silent DOM failures

40+ `document.getElementById()` calls throughout the codebase with no null checks. If the HTML structure changes, these silently return `null` and produce cryptic errors later.

**Fix:** Create a `getRequiredElement(id)` helper that throws a descriptive error.

### Generic catch blocks

`createApp.js` catches all errors with a generic handler. Different failure modes (network, parsing, WebGL) should surface different messages.

---

## 10. Accessibility & HTML (Aesthetics)

### Missing ARIA attributes

- The loader `<div>` should have `role="status"` and `aria-live="polite"`
- The "Toggle All Clouds" button lacks `aria-label`
- Collapsible fieldsets have inconsistent `aria-expanded` initialization

### Inline styles in HTML

Several elements use `style="display:none"` instead of CSS classes, making the styling harder to maintain and override.

### Label color contrast

Canvas-rendered labels use hardcoded colors (`rgba(8, 11, 18, 0.76)` background, `rgba(255,255,255,0.14)` stroke) without WCAG contrast validation.

---

## 11. CSS Architecture (Aesthetics)

The CSS is already well-modularized (7 files, each focused). Minor improvements:

- No CSS custom properties (variables) for colors or spacing, so theme changes require editing multiple files
- `responsive.css` at 664 bytes is minimal; the app could benefit from more responsive breakpoints for tablet/mobile users

**Fix:** Introduce CSS custom properties for the color palette and spacing scale.

---

## Priority Summary

### Quick wins (high impact, low risk)

1. Delete 12 dead re-export files (domain/, repository, facades)
2. Extract duplicate `hashString()`/`mixHash()` to shared
3. Unify constant definitions (GLOBE_RADIUS, GC_SEGMENTS)
4. Add `getRequiredElement()` helper for DOM lookups

### Medium effort (significant impact)

5. Extract label placement engine from uvMapManager
6. Refactor CameraControls to eliminate 50% duplication
7. Generate appStateFactory proxies from schema
8. Add event listener cleanup to ExportManager/EditManager
9. Unify filter state naming (eliminate FILTER_RESULT_MAPPINGS)

### Larger refactors (high impact, higher risk)

10. Split uvMapManager into focused modules
11. Cache static canvas layers (constellations, boundaries)
12. Replace ConcaveGeometry algorithm (O(n^5) to O(n log n))
13. Add spatial indexing for label placement
14. Introduce CSS custom properties for theming
