# Astrography — Full Code Audit Report

**Date:** April 14, 2026
**Scope:** Every source file in the project (41 JS/HTML/CSS files), data format review
**Focus:** Consistency, efficiency, professionalism

---

## Executive Summary

Astrography is an impressive Three.js-based 3D star visualization with Mollweide/Globe projections, constellation overlays, dust cloud rendering, density filters, and a rich filter UI. The spatial math and rendering are strong, but the codebase has accumulated significant technical debt across six areas:

1. **Massive code duplication** — entire 195-line blocks copy-pasted, utility functions reimplemented in 4+ files
2. **No shared constants or utilities** — magic numbers (100, 32, 1024, 0.1) and helper functions scattered everywhere
3. **Inconsistent patterns** — naming, error handling, module structure, and opacity scales all vary file-to-file
4. **Global mutable state** — 41+ top-level variables in script.js, heavy `window.*` coupling across modules
5. **Missing error handling** — silent failures, unchecked null access, at least one call to a function that doesn't exist
6. **Performance concerns** — O(n⁴) algorithm, redundant array passes, excessive `.clone()` in tight loops, DOM queries inside render loops

---

## 1. CONSISTENCY Issues

### 1.1 Naming Conventions

**Problem:** Variable and property naming is inconsistent across the entire project.

| Pattern | Example locations | Issue |
|---------|-------------------|-------|
| Flag suffix sometimes used | `script.js:55-56` — `showConstellationBoundariesFlag`, `enableIsolationFilterFlag` | Most booleans don't use `Flag` suffix; pick one style |
| Data property casing | `star.Common_name_of_the_star` vs `star.distance` vs `star.Stellar_class` | Mix of Title_Snake_Case and camelCase for star properties |
| Scene parameter names | `cloudDensityFilter.js:146` — `sceneTC` vs `sceneMoll` vs `sceneGlobe` | Inconsistent abbreviation (TC = TrueCoordinates, but non-obvious) |
| Filter variable names | `stellarClassFilter.js:9-10` — `stellarClassShowName` vs `classShowName` | Prefix dropped mid-file |
| Opacity parameter names | `connectionsFilter.js` — `opacityFactor` vs `opacity` | Used interchangeably for the same concept |

**Recommendation:** Establish a naming convention document. Star data properties should use consistent camelCase (`commonName`, `stellarClass`, `distanceFromSun`). Boolean state variables should use `is`/`has`/`show` prefixes without `Flag`.

### 1.2 Opacity Scale Convention

**Problem:** Some code uses 0–100 (from UI sliders), some uses 0–1 (for Three.js materials). The boundary is unclear.

- `filterDefaults.js:22-39` — defaults like `cloudOpacity: 100`, `starOpacity: 100` (0–100 scale)
- `opacityFilter.js:4` — runtime check: `fixedOpacity > 1 ? fixedOpacity / 100 : fixedOpacity`
- Three.js materials expect 0–1

**Recommendation:** Normalize to 0–1 at the point of reading from the UI. All internal filter state should use 0–1. This eliminates defensive conversion code.

### 1.3 Error Handling Patterns

**Problem:** Three completely different approaches across files:

- `presets.js` — try-catch for JSON parsing but not for `localStorage` operations
- `starData.js` — catches errors, logs `console.warn`, continues silently
- `stellarClassState.js` — no error handling at all
- `constellationFilter.js:36,52` — console logs in catch blocks but no recovery

**Recommendation:** Create a centralized error handler. At minimum, establish a convention: log with context, never swallow errors silently, distinguish between recoverable warnings and fatal errors.

### 1.4 Module Structure

**Problem:** Files use different organizational patterns without reason:

- `isolationFilter.js` — exports both a class and factory functions
- `planesFilter.js` — all standalone function exports, no class
- `filterUI.js` — single init function
- `geometryUtils.js` — mix of pure functions and global state getters/setters

**Recommendation:** Adopt a consistent pattern. Filter modules should either all export classes or all export a function set. Pick one and refactor.

### 1.5 CSS Syntax Errors

**Problem:** Four broken selectors in `styles.css` are missing the `.` class prefix:

- Line 235: `filter-item input[type="range"]::-moz-range-thumb` — should be `.filter-item`
- Line 245: `filter-item input[type="range"]:hover` — should be `.filter-item`
- Line 248: `filter-item input[type="range"]::-webkit-slider-thumb:hover` — should be `.filter-item`
- Line 251: `filter-item input[type="range"]::-moz-range-thumb:hover` — should be `.filter-item`

These selectors are non-functional. The corresponding styles are not being applied.

---

## 2. CODE DUPLICATION Issues

### 2.1 Critical: stellarClassFilter.js — 195 Lines Duplicated

**Location:** Lines 162–367 (main stellar class loop) vs Lines 378–573 ("Other" category)

The entire "Other" section is a copy-paste of the main loop with minimal changes. This is the single largest DRY violation in the project.

**Fix:** Extract a `createStellarClassSection(cls, className, starsArray, defaultSize)` factory function.

### 2.2 Critical: filterUISetup.js — ~40% Duplication

Every slider+number input pair requires 15+ lines of identical boilerplate code repeated dozens of times. Each fieldset (Constellations, Globe Surface, Planes) follows the exact same creation pattern. Collapse/expand logic is copy-pasted for every legend element.

**Fix:** Create factory functions:
- `createRangeControl(label, id, min, max, step, value, unit)` 
- `createCollapsibleFieldset(title, children)`
- `syncSliderWithNumber(sliderId, numberId)`

### 2.3 Critical: Utility Functions Duplicated Across 4+ Files

The following functions are reimplemented in multiple files:

| Function | Found in |
|----------|----------|
| `uniqueColorFromName()` / `hashString()` | cloudsFilter.js, cloudDensityFilter.js, densityColorUtils.js |
| `getCloudNameFromFileUrl()` | cloudsFilter.js, cloudDensityFilter.js |
| `hslColorFromHash()` | densityColorUtils.js, cloudsFilter.js |
| Stellar class primary extraction | colorFilter.js, sizeFilter.js (twice within the same file) |
| Form element state capture | presets.js, stellarClassState.js |
| Canvas-based text sprite creation | planesFilter.js (lines 244–251 vs 263–271), connectionsFilter.js |
| Overlay removal logic | filterOverlayState.js (lines 7–18 vs 20–30) |
| Constellation label creation | constellationFilter.js (lines 271–301 vs 309–329) |
| Overlay rebuild check | filterOverlayState.js (lines 35–40 vs 91–96) |
| Recognized stellar classes Set | sizeFilter.js (lines 27 AND 46 — duplicated within the same file) |

**Fix:** Create shared modules:
- `shared/colorUtils.js` — all color hash/HSL/interpolation functions
- `shared/stellarClassUtils.js` — class extraction, recognized classes set
- `shared/formUtils.js` — form state capture/restore
- `shared/spriteUtils.js` — canvas text sprite/plane creation

### 2.4 Moderate: filterOverlayState.js — Identical Remove/Rebuild Logic

`removeIsolationOverlay()` (lines 7–18) and `removeDensityOverlay()` (lines 20–30) have nearly identical structure. The rebuild check logic (lines 35–40 vs 91–96) is also duplicated.

**Fix:** Extract `removeOverlay(overlay, sceneConfigs)` and `needsOverlayRebuild(overlay, filters)`.

### 2.5 Moderate: constellationOverlayFilter.js — Ordering Algorithm Duplicated

Lines 103–164 (Globe) and lines 226–291 (Mollweide) implement nearly identical segment ordering algorithms.

**Fix:** Parameterize the ordering function and call it for each projection type.

### 2.6 Moderate: script.js — Coordinate Extraction Repeated 3 Times

`projectStarGlobe()` (lines 180–194), `projectStarMollweide()` (lines 196–209), and `getStarTruePosition()` all repeat the same RA/Dec extraction logic with identical fallback chains.

**Fix:** Extract `getStarCoordinates(star)` → `{ ra, dec }`.

### 2.7 Moderate: script.js — Plane Setup Duplicated 3 Times

`applyPlanes()` (lines 638–731) repeats the same create-or-update pattern for galactic plane, ecliptic plane, and celestial equator (~44 + 23 + 23 lines).

**Fix:** Parameterize into a single `setupPlane(config)` helper.

---

## 3. MISSING ERROR HANDLING Issues

### 3.1 Critical: Undefined Function Call — isolationFilter.js:462

`loadConstellationFullNames()` is called but this function does not exist anywhere in the codebase. This will cause a runtime crash when the isolation filter's constellation assignment runs.

**Fix:** Implement the function or replace with the correct import.

### 3.2 High: No Null Checks on DOM Elements

- `filterUI.js:6, 69` — `document.getElementById()` used without null checks; silent failure if elements are missing
- `filterUISetup.js:8` — async `setupFilterUI` doesn't catch errors from `loadStellarClassData()`
- `densityFilter.js:254-260` — assumes DOM elements exist

**Fix:** Add defensive checks or fail fast with clear error messages.

### 3.3 High: Canvas Context Not Validated

- `labelManager.js:40-42` — `canvas.getContext('2d')` used without null check; will crash on `ctx.font` if context unavailable
- `planesFilter.js:244-302` — same pattern in text sprite/plane creation

**Fix:** Check `if (!ctx) throw new Error('...')` after every `getContext()` call.

### 3.4 Moderate: localStorage Quota Not Handled

- `presets.js:63` — `localStorage.setItem()` can throw `QuotaExceededError`; no try-catch

**Fix:** Wrap in try-catch, warn user if storage is full.

### 3.5 Moderate: Silent Failures in Data Loading

- `starData.js:57-58` — errors logged as `console.warn` but callers can't distinguish between "no data" and "network error"
- `stellarClassData.js:18-22` — clears promise on error but doesn't properly reset; second call may silently retry
- `densityData.js:14` — sets `densityCenterData = []` on error; callers can't tell empty data from failure
- `dustCloudDataCache.js:7-10` — failed fetch never retried; no cache invalidation

**Recommendation:** Create custom error types (`StarDataLoadError`, `ManifestError`) so callers can handle failures appropriately.

### 3.6 Moderate: Unsafe Property Access

- `colorFilter.js:9` — `star.Stellar_class.charAt(0)` will throw if `Stellar_class` is null/undefined
- `cloudDensityFilter.js:248-249` — accesses `star.truePosition` without null check
- `connectionsFilter.js:221-222` — accesses `starA.spherePosition.x` without checking spherePosition exists
- `stellarClassFilter.js:137-139` — `.charAt(0)` without null check on Stellar_class

---

## 4. MAGIC NUMBERS & STRINGS

### 4.1 The Radius 100 Problem

The value `100` appears as a hardcoded sphere/globe radius in **20+ locations** across the codebase:

- `connectionsFilter.js:319`
- `constellationFilter.js:78, 84, 86`
- `constellationOverlayFilter.js:213, 307`
- `cloudDensityFilter.js:100, 106, 118, 119`
- `densityFilter.js:66, 73`
- `isolationFilter.js:91`
- `geometryUtils.js:51`

**Fix:** Define `const GLOBE_RADIUS = 100` in a shared constants file and import everywhere.

### 4.2 Other Repeated Magic Numbers

| Value | Occurrences | Meaning |
|-------|-------------|---------|
| `32` | 5+ files | Sphere/circle segment count |
| `1024` / `512` | densityFilter, cloudDensityFilter | Canvas/texture dimensions |
| `0x888888` | constellationFilter (3 places), constellationOverlayFilter | Constellation line color |
| `300` / `72` | connectionsFilter, constellationFilter, isolationFilter | Font sizes in px |
| `0.1` / `15` | stellarClassFilter | Slider min/max range |
| `1e-9` / `1e-10` | colorFilter, isolationFilter | Epsilon values |
| `400` / `200` | script.js, cloudDensityFilter, densityFilter | Frustum/camera values |
| `5` | sizeFilter:15,23 | Distance scaling multiplier |

**Fix:** Create `shared/constants.js`:
```javascript
export const GLOBE_RADIUS = 100;
export const CIRCLE_SEGMENTS = 32;
export const CANVAS_SIZE = { width: 1024, height: 512 };
export const CONSTELLATION_LINE_COLOR = 0x888888;
export const EPSILON = 1e-10;
// etc.
```

### 4.3 Magic Strings

- `'Sol'` hardcoded in `filters/index.js:43-44` to filter out the Sun
- `/_cloud_data\.json$/i` regex duplicated in cloudsFilter and cloudDensityFilter
- DOM element IDs hardcoded throughout (`'stellar-class-container'`, `'enable-save-presets'`, etc.)
- `'#FFFFFF'` / `'#ffffff'` used as default color in 5+ locations

---

## 5. ARCHITECTURE & Separation of Concerns Issues

### 5.1 script.js — 41+ Global Variables

Lines 43–130 of `script.js` declare 41+ module-level variables managing filters, overlays, camera state, edit modes, and render state — all in a single flat namespace.

**Fix:** Group into state objects:
```javascript
const filterState = { cachedStars: null, currentFilteredStars: [], ... };
const overlayState = { showConstellationBoundaries: false, ... };
const cameraState = { frustumSize: 400, ... };
const editState = { editMode: false, ... };
```

### 5.2 Heavy Window Global Coupling

Multiple modules depend on `window.globeMap`, `window.mollweideMap`, `window.trueCoordinatesMap`, and `window.requestRender?.()`. This creates invisible dependencies and makes testing impossible.

**Affected files:** `filters/index.js`, `filterOverlayState.js`, `cloudDensityFilter.js`, `densityFilter.js`, `isolationFilter.js`, `script.js`

**Fix:** Use dependency injection — pass scene/map objects as function parameters instead of reading from `window`.

### 5.3 Mixed Concerns in Large Classes

- `isolationFilter.js` — `IsolationGridOverlay` class mixes geometric computation, DOM querying, THREE.js scene management, and constellation assignment logic in one class
- `densityFilter.js` — 370+ line class mixing grid calculation, mesh creation, heatmap rendering, and Mollweide projection
- `cloudDensityFilter.js` — class mixes grid logic, mesh logic, heatmap, and Mollweide concerns

**Fix:** Split into focused classes (Grid, Mesh, Heatmap) composed together.

### 5.4 script.js Needs Decomposition

At 770+ lines with 40+ functions, `script.js` mixes generic utilities (`debounce()`), domain logic, rendering, filter management, and initialization. 

**Fix:** Split into: `core.js` (init + state), `rendering.js` (render loop), `projections.js` (coordinate math), move `debounce()` to `utils.js`.

---

## 6. PERFORMANCE Issues

### 6.1 Critical: O(n⁴) Algorithm in ConcaveGeometry.js

Lines 47–70 use brute-force tetrahedra generation with four nested loops. For even moderate point counts, this will be extremely slow.

**Fix:** If this code runs on large datasets, implement Delaunay tetrahedralization. If it only runs on small fixed sets, add a comment documenting the assumption and a guard: `if (points.length > THRESHOLD) throw new Error(...)`.

### 6.2 High: Redundant Array Passes in sizeFilter.js

Lines 17–18 then 46–65 make multiple passes over the stars array — first for size calculation, then for class scaling.

**Fix:** Combine into a single pass.

### 6.3 High: Excessive Object Allocation in Loops

- `labelManager.js:75, 85-91` — creating `THREE.Vector3` objects inside tight loops without reuse
- `constellationOverlayFilter.js:279, 284` — `.clone()` called excessively in tight loops
- `geometryUtils.js:44-56` — `subdivideGeometry()` creates new Vector3 in inner loop

**Fix:** Pre-allocate reusable vectors outside loops: `const _tempVec = new THREE.Vector3()`.

### 6.4 High: DOM Queries Inside Update Loops

- `isolationFilter.js:242-245` — DOM query on every `update()` call
- `stellarClassFilter.js:579-581, 587-589` — queries all checkboxes on every "Show All" click instead of caching
- `cloudDensityFilter.js:146-191` — `update()` recalculates everything even when parameters unchanged

**Fix:** Cache DOM element references at initialization time. Add dirty-checking to skip unnecessary recalculations.

### 6.5 Moderate: Inefficient Data Structures

- `densitySegmentation.js:162-164` — grid-based lookup uses `.find()` for O(n) search instead of O(1) Map
- `dustCloudColors.js:22-30` — linear search through keys on every call
- `densitySegmentation.js:56-72` — linear neighbor search; should use Map keyed by grid coordinates

**Fix:** Use `Map` with coordinate keys for O(1) lookups.

### 6.6 Moderate: No Grid/Geometry Caching

- `script.js:246-280` — `createGlobeGrid()` recalculates trigonometric functions without memoization
- `planesFilter.js:156-176` — `updateGalacticPlaneMollweide()` rebuilds geometry from scratch each time
- `densityFilter.js:280-282` — `computeCellDensity` called for every cell every frame with no caching

### 6.7 Low: Unbounded Cache

- `dustCloudDataCache.js` — no size limit (memory leak risk), no expiration, no invalidation

---

## 7. DEAD CODE & Unused Variables

| Location | Issue |
|----------|-------|
| `script.js:99` | `dragOffset = new THREE.Vector3()` — declared, never used |
| `script.js:100` | `editPointer = new THREE.Vector2()` — declared, never used |
| `labelManager.js:41 vs 47` | Canvas font set twice — first at line 41, then reset at line 47 after canvas resize |
| `filters/index.js:76` | `cloudDensityOverlays: []` — always empty array, never populated |
| `stellarClassFilter.js:593` | `sanitizeName()` defined inline; only used internally |
| `colorFilter.js` | `hexToRgb`, `rgbToHex`, `interpolateHex` defined but never exported or referenced externally |

---

## 8. DOCUMENTATION Gaps

### 8.1 Missing JSDoc

No file in the project uses JSDoc comments. Functions performing complex spatial math, projection, or rendering have no parameter/return documentation:

- `geometryUtils.js` — `vectorToRaDec()`, `subdivideGeometry()`, `raDecToVector()`
- `ConcaveGeometry.js` — circumsphere algorithm (lines 42–70)
- `isolationFilter.js` — Newton-Raphson convergence for Mollweide (lines 100–110)
- `planesFilter.js` — galactic/ecliptic coordinate conversion (lines 23–58)
- `tooltips.js` — `clearTooltip()`, `appendRow()`, `formatNumber()`
- `utils.js` — `generateColorPalette()`, `hslToHex()`, `hexToRgb()`

### 8.2 Comments Describe "What" Instead of "Why"

- `isolationFilter.js:63` — "Only include cells within the specified distance range" — obvious from code
- Most comments restate the line of code rather than explaining the reasoning

### 8.3 Undocumented Constants

- `planesFilter.js:8-13` — galactic coordinate conversion constants (`alphaGP`, `deltaGP`, etc.) with no reference to IAU standards
- `starsShownFilter.js:4` — magnitude limit of `6` (naked-eye visibility) without explanation
- `filterDefaults.js` — all defaults lack rationale comments

### 8.4 Missing Architectural Documentation

`README.md` provides a good overview but doesn't document the module architecture, data flow, or state management approach.

---

## 9. MINOR Issues

### 9.1 Inconsistent Formatting

- Mixed 2-space and 4-space indentation across files
- Inconsistent bracket placement in ternary expressions
- Inconsistent trailing comma usage

### 9.2 Accessibility

- `stellarClassFilter.js:349` — sets `aria-expanded` but no proper ARIA labels on collapsible headers
- Text sprites in planesFilter have no alt text
- Filter UI controls created in JS lack ARIA labels

### 9.3 Defensive Coding Inconsistency

- `cameraControls.js:31, 54` — `this.domElement.setPointerCapture?.(event.pointerId)` uses optional chaining for a widely-supported API
- `distanceFilter.js:2-3` — verbose null check (`!== null && !== undefined`) instead of `??`
- `starsShownFilter.js:6` — `return [...stars]` spreads into new array unnecessarily

---

## 10. RECOMMENDED Action Plan (Priority Order)

### Immediate (Bug Fixes)
1. Fix the undefined `loadConstellationFullNames()` call in isolationFilter.js
2. Fix 4 broken CSS selectors in styles.css (missing `.` prefix)
3. Add null checks for `star.Stellar_class` before `.charAt(0)` calls

### High Priority (Architecture)
4. Create `shared/constants.js` — extract all magic numbers
5. Create `shared/colorUtils.js` — consolidate duplicated color functions
6. Create `shared/spriteUtils.js` — consolidate canvas text creation
7. Create `shared/formUtils.js` — consolidate form state capture/restore
8. Refactor `stellarClassFilter.js` — eliminate 195-line duplication
9. Refactor `filterUISetup.js` — create factory functions for repeated UI patterns

### Medium Priority (Quality)
10. Group global state in script.js into named objects
11. Replace `window.*` globals with dependency injection
12. Add JSDoc to all exported functions
13. Standardize error handling across all modules
14. Normalize opacity to 0–1 at the UI boundary
15. Standardize naming conventions (camelCase for all star properties)

### Lower Priority (Performance)
16. Pre-allocate reusable THREE.Vector3 objects for loops
17. Cache DOM element references instead of querying in update loops
18. Replace linear lookups with Map-based O(1) lookups in density/segmentation
19. Add dirty-checking to skip unnecessary recalculations
20. Add size limits and invalidation to dustCloudDataCache

---

*This audit covers all 41 source files. Data files (JSON) were checked for format only — they use consistent structure and don't require changes.*
