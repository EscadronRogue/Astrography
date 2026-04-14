# Astrography — Updated Code Audit

**Date:** April 14, 2026  
**Scope reviewed:** every non-data file in the repository plus data-format checks for JSON/TXT data assets.  
**Goal:** professionalism, efficiency, consistency.  
**This document supersedes the previous `CODE_AUDIT.md`.**

---

## What changed since the previous audit

The previous audit is partially outdated. The following items are already fixed in the current tree and should **not** remain on the active issue list:

- `loadConstellationFullNames()` now exists in `filters/constellationFilter.js`.
- shared modules now exist for constants, colors, form state, stellar-class parsing, star helpers, and UI helpers:
  - `shared/constants.js`
  - `shared/colorUtils.js`
  - `shared/formUtils.js`
  - `shared/starUtils.js`
  - `shared/stellarClassUtils.js`
  - `shared/uiFactory.js`
- the broken CSS selectors in `styles.css` were fixed.
- many `canvas.getContext('2d')` call sites now have null checks.
- `dustCloudDataCache.js` now has a bounded cache instead of an unbounded map.
- `connectionsFilter.js` no longer uses the old O(n²) all-pairs scan for all stars; it now uses a spatial grid.

Those are real improvements. The remaining work is now more architectural and integration-oriented.

---

# Active findings by file

## Root files

### `.gitattributes`
**Status:** acceptable.  
**Notes:** simple LF normalization only. No change needed.

### `.gitignore`
**Status:** needs improvement.  
**Issues**
- `script_backup_before_split.js` is not ignored and is currently committed as a large dead backup file. That file materially increases maintenance cost and review noise.
- generated export artifacts are not ignored. If this repo is used locally for PNG/PDF export experiments, accidental commits are likely.

**Recommendation**
- either delete `script_backup_before_split.js` from the repository or move it outside source control.
- add explicit ignore rules for local export output if those files are generated during development.

### `README.md`
**Status:** decent but incomplete.  
**Issues**
- The startup flow is accurate at a high level, but the document does not explain the current split between `script.js`, `script/filterPipeline.js`, `script/planeManager.js`, and `script/constellationManager.js`.
- It does not document the remaining global coupling (`window.*` scene references and `window.requestRender`).
- It does not mention that many modules still consume legacy raw star fields (`Distance_from_the_Sun`, `Stellar_class`) alongside normalized fields (`distance`, `apparentMagnitude`, `absoluteMagnitude`).

**Recommendation**
- add a short “runtime architecture” section.
- document normalized-vs-legacy star fields and define one canonical field set.

### `index.html`
**Status:** functional, but it still carries structural debt.  
**Issues**
- The file is large and contains a lot of static filter markup while other filter sections are generated dynamically in JS. This hybrid approach makes the UI difficult to reason about and increases ID/name drift risk.
- Many form controls encode business rules directly in HTML defaults instead of being driven by a central schema.
- Accessibility is only partial: toggle buttons have labels, but the sidebar and dynamically generated controls do not have a stronger accessibility model.
- The file hardcodes external CDN dependencies without integrity/crossorigin metadata.
- The app title still says “Starmap Visualization”, while the project is “Astrography”; this is a presentation inconsistency.

**Recommendation**
- either move to a fully declarative static form schema or fully generate the filter UI from configuration.
- add subresource integrity where possible.
- align the visible application naming with the repository/project name.

### `styles.css`
**Status:** improved, but inconsistent.  
**Issues**
- The stylesheet is now syntactically healthier, but it remains a monolith with mixed responsibilities: layout, theme, form controls, map containers, export UI, and editing overlays all live in one file.
- Many visual constants are repeated instead of centralized as CSS custom properties.
- Several sizing values are hardcoded for a single layout regime, which will make responsive refinement harder.

**Recommendation**
- split into `base`, `layout`, `filters`, `maps`, `editor/export`.
- promote repeated colors and spacing into CSS variables.

### `tooltips.js`
**Status:** generally solid.  
**Issues**
- The formatting logic is tightly coupled to specific source field names and the current tooltip DOM.
- The module is imperative and DOM-bound, so it is hard to test without a browser context.
- URL sanitization is local to this file instead of being shared if link sanitization is needed elsewhere.

**Recommendation**
- isolate a pure tooltip view-model builder from DOM rendering.

### `utils.js`
**Status:** partially obsolete.  
**Issues**
- This file still contains color helpers (`interpolateColor`, `hexToRgb`, `hexToRGBA`) that now overlap with `shared/colorUtils.js`.
- Utility scope is too broad: constellation palette generation, color conversion, geometry-adjacent helpers, DOM sizing, and RA normalization live together.
- `resizeCanvas()` assumes `parentElement` exists.
- The file now competes conceptually with both `shared/colorUtils.js` and `utils/geometryUtils.js`.

**Recommendation**
- remove duplicated color helpers and import from `shared/colorUtils.js`.
- keep only truly generic utilities here, or split by concern.

### `script.js`
**Status:** the main architectural bottleneck.  
**Issues**
- This is still the highest-risk file in the project. It remains very large and state-heavy.
- The code replaced many naked globals with a `state` object, but that object is implemented through `Object.defineProperties` wrappers around the original module-level globals. That is not real simplification; it is a compatibility layer that preserves the original complexity.
- `script.js` still exports application behavior to globals (`window.updateMollweideView`, `window.trueCoordinatesMap`, `window.globeMap`, `window.mollweideMap` later in the file). This keeps cross-module dependencies implicit.
- Several helpers are now just wrappers around shared helpers (`getStarId`, `getStarTruePosition`, `projectStarGlobe`, `projectStarMollweide`, `precalcMollweideData`). That indirection adds noise without real value.
- Hardcoded rendering constants remain inside the file (`R = 100`, `segments = 1024`, large export constants, border colors).
- The file still mixes bootstrap, map construction, export logic, editing state, render invalidation, and projection helpers.
- Dead or near-dead state is still present (`dragOffset`, `editPointer` were already suspicious in the old audit and still are not meaningful central abstractions).

**Recommendation**
- make `state` a real plain object, not a proxy layer over dozens of top-level variables.
- move bootstrap, export, and edit subsystems out of `script.js`.
- eliminate wrapper helpers that only forward to shared modules.
- stop publishing maps on `window`.

### `script_backup_before_split.js`
**Status:** should be removed from the codebase.  
**Issues**
- It is a full historical duplicate of the application entrypoint.
- It is not imported anywhere, but it is large enough to confuse audits, code search, and future refactors.
- It guarantees stale logic will keep resurfacing during maintenance.

**Recommendation**
- delete it from the repository. If historical reference is needed, use version control.

---

## App layer

### `app/presets.js`
**Status:** improved, but still not fully hardened.  
**What is good**
- shared form-state helpers are now used.
- `localStorage` access is wrapped in `try/catch`.

**Issues**
- Schema versioning is shallow. Old payload compatibility is only partially handled; there is no migration path, only accept/reject.
- Failure handling is console-only. The user is not informed when preset persistence fails.
- The module still queries DOM by ID directly instead of receiving the form element or checkbox element from the caller.
- `deserializeMap()` and `deserializeSet()` trust payload shape more than they should.

**Recommendation**
- inject the form and “remember” checkbox from the caller.
- add payload validation and optional migration.
- surface persistence failures to the UI.

### `app/starData.js`
**Status:** important but under-specified.  
**What is good**
- normalization of `distance`, `apparentMagnitude`, `absoluteMagnitude`, and `starId` is a real improvement.

**Issues**
- On any load failure, the module returns `[]`. That makes “no data” indistinguishable from “manifest fetch failed” or “one bucket failed”.
- Mixed field strategy remains: normalized fields are created, but many downstream modules still consume raw legacy fields, so the normalization contract is not enforced.
- `buildStableStarId()` still depends partly on unstable fallback material (human names and coordinates).
- Network work is not cached inside the loader; repeated startup/reload flows will refetch everything.

**Recommendation**
- throw typed errors or return `{ stars, errors }`.
- define one canonical star schema and migrate consumers to it.
- cache or memoize manifest/bucket loads for the current session.

### `app/stellarClassState.js`
**Status:** small, but too thin.  
**Issues**
- This file is essentially a wrapper around DOM lookups plus shared form utilities.
- It hardcodes `document.getElementById('stellar-class-container')`, which makes it fragile and hard to reuse/test.

**Recommendation**
- either inline it into the caller or turn it into pure functions that accept a container element.

---

## Shared layer

### `shared/constants.js`
**Status:** good addition, but incomplete adoption.  
**Issues**
- The file is the right direction, but many modules still hardcode values that should live here (`100`, `32`, `1024`, palette values, border colors).
- Some constants here represent UI slider ranges, others are rendering constants, others are string literals. The file should eventually be split by concern.

**Recommendation**
- continue migrating all remaining hardcoded render constants into this module.
- consider `renderingConstants`, `uiDefaults`, and `domainConstants` split later.

### `shared/colorUtils.js`
**Status:** good module, not fully adopted.  
**Issues**
- The project still has overlapping color functions in `utils.js`.
- `getCloudNameFromFileUrl()` still embeds its own regex instead of using `CLOUD_FILE_REGEX` from `shared/constants.js`.
- The module mixes cloud-specific naming logic with generic color math.

**Recommendation**
- deduplicate with `utils.js`.
- either use the shared regex constant or remove that constant.

### `shared/formUtils.js`
**Status:** useful foundation.  
**Issues**
- DOM warnings are emitted with `console.warn`, but callers cannot react programmatically.
- `restoreFormState()` restores raw values without schema validation, which is fine for trusted local state but weak for imported/edited payloads.

**Recommendation**
- allow an optional validation callback or schema map for robust restores.

### `shared/starUtils.js`
**Status:** valuable module, incompletely integrated.  
**Issues**
- Shared helpers exist, but `script.js` still wraps them instead of using them directly.
- `getStarId()` fallback order is still based partly on human-readable fields.
- `precalcMollweideData()` still hardcodes `1e-10` instead of using the shared epsilon constant.
- Some consumers still bypass these helpers and manually read raw fields.

**Recommendation**
- make this the only source of truth for star ID/coordinate/position derivation.
- import `EPSILON` instead of embedding the convergence threshold.

### `shared/stellarClassUtils.js`
**Status:** correct direction.  
**Issues**
- `getPrimaryClass()` is good, but `filters/colorFilter.js` still bypasses it and reads `star.Stellar_class` directly.
- Returning `'Other'` is reasonable, but the rest of the UI and defaults should treat `'Other'` as a first-class category consistently.

**Recommendation**
- require all stellar-class consumers to use this helper.

### `shared/uiFactory.js`
**Status:** useful, but the UI layer is still fragmented.  
**Issues**
- Good factory coverage exists for fieldsets, checkboxes, range controls, and slider sync, but `ui/filterUI.js` and `filters/filterUISetup.js` still do a lot of manual DOM composition around them.
- `syncSliderPair()` still performs DOM lookups by ID rather than accepting concrete elements.
- `sanitizeName()` is UI-specific string shaping and should not be shared unless more modules depend on it.

**Recommendation**
- pass elements, not IDs, where possible.
- use this factory more aggressively to eliminate remaining bespoke UI wiring.

---

## Filters

### `filters/filterDefaults.js`
**Status:** okay, but still reinforces scale inconsistency.  
**Issues**
- Opacity defaults are still expressed in 0–100 UI scale, which means every consumer must remember to divide later.
- The defaults object is long and mostly untyped; it is effectively part of the application schema but is not documented as such.

**Recommendation**
- normalize opacity at the form boundary and store 0–1 internally.

### `filters/filterFormState.js`
**Status:** central, but inconsistent with the shared layer.  
**Issues**
- It redefines `STELLAR_CLASSES` locally instead of importing the shared class list.
- It returns opacity-like values in 0–100 scale, preserving the scale ambiguity the previous audit flagged.
- The file mixes parsing, defaults, and domain policy in one function.
- Cloud visibility is inferred from checked files only; there is no explicit “enable cloud overlay” control, which is acceptable UX-wise but should be intentional/documented.

**Recommendation**
- import `STELLAR_CLASSES` from `shared/constants.js`.
- normalize percentages here before returning filter state.

### `filters/filterOverlayState.js`
**Status:** cleaner than before, but still globally coupled.  
**Issues**
- The module still resolves scenes from `window.trueCoordinatesMap`, `window.globeMap`, and `window.mollweideMap`. That is the same hidden dependency problem as before, only concentrated in one file.
- Overlay lifetime is maintained in module-level singletons (`isolationOverlay`, `densityOverlay`) instead of inside application state.
- `needsRebuild()` only considers min distance, max distance, and grid size. If other overlay-affecting parameters are introduced later, this logic will be easy to break.

**Recommendation**
- move overlay ownership into app state and pass scene references in explicitly.

### `filters/filterUISetup.js`
**Status:** improved substantially, but still incomplete.  
**What is good**
- the previous “tons of repeated fieldset boilerplate” problem is materially reduced through shared UI factory helpers.

**Issues**
- The module still owns side effects, data preloading, legend binding, and fieldset generation all at once.
- It queries `#filters-form` directly and caches it globally.
- The setup path still mixes view generation and data loading (`loadConstellationBoundaries`, `loadConstellationCenters`).
- The naming is a little confusing because `generateStellarClassFilters` is re-exported from a different module.

**Recommendation**
- separate data preload from UI construction.
- inject the target form element instead of globally looking it up.

### `filters/index.js`
**Status:** contains one of the clearest remaining integration bugs.  
**Issues**
- **Bug:** when `showConstellationOverlay` is true, `applyFilters()` adds globe overlay meshes directly to `window.globeMap.scene` at lines 58–63, but `script/constellationManager.js` also rebuilds and adds constellation overlay meshes later. That creates duplicate responsibilities and can lead to duplicate meshes, inconsistent cleanup, or render-order confusion.
- The module still fetches the filter form by ID globally.
- It still imports and exports UI concerns from the filter entry module, which keeps “filter logic” and “filter UI wiring” partially entangled.

**Recommendation**
- remove direct scene mutation from this file entirely.
- make this module return pure filter results only.

### `filters/colorFilter.js`
**Status:** needs consistency cleanup.  
**Issues**
- It still derives the primary class with `star.Stellar_class ? star.Stellar_class.charAt(0).toUpperCase() : 'G'` instead of using `getPrimaryClass()`.
- The fallback class `'G'` is a policy decision that differs from the shared helper’s `'Other'`.
- Galactic-plane coloring hardcodes `'#ffffff'` instead of using `DEFAULT_STAR_COLOR`.
- The file is small, but it bypasses the very abstraction that was created to unify stellar-class parsing.

**Recommendation**
- use `getPrimaryClass()` and one consistent fallback policy.

### `filters/distanceFilter.js`
**Status:** good.  
**Issues**
- Minimal and correct. No urgent change needed.
- Minor note: this module is one of the few places that fully trusts the normalized `distance` field; the rest of the codebase should follow this pattern.

### `filters/opacityFilter.js`
**Status:** still symptomatic of the scale problem.  
**Issues**
- The comment and implementation explicitly preserve mixed opacity scales: “if value > 1, assume 0–100”. That is defensive, but it also cements inconsistency.
- Absolute-magnitude opacity is internal 0–1, while fixed opacity may arrive in 0–100. The normalization boundary is still unclear.

**Recommendation**
- delete the “value > 1” fallback once form state is normalized.

### `filters/sizeFilter.js`
**Status:** improved, but still inconsistent with normalized data.  
**Issues**
- The main processing loop is much cleaner than before, but the distance-size calculation still uses `Distance_from_the_Sun` rather than normalized `distance`.
- If any star record is missing `Distance_from_the_Sun` but has normalized `distance`, this file will behave inconsistently relative to `distanceFilter.js`.

**Recommendation**
- switch entirely to `star.distance`.

### `filters/starsShownFilter.js`
**Status:** good.  
**Issues**
- It reads normalized `apparentMagnitude` correctly.
- No urgent action beyond general schema consolidation.

### `filters/globeSurfaceFilter.js`
**Status:** trivial.  
**Issues**
- Very small wrapper module; acceptable, though it may be unnecessary abstraction depending on the final architecture.

### `filters/stellarClassData.js`
**Status:** acceptable, but simple.  
**Issues**
- Error handling is console-only.
- There is no validation of the loaded JSON structure before storing it.

**Recommendation**
- validate the shape of `stellar_class.json` once at load time.

### `filters/stellarClassFilter.js`
**Status:** much better than the old audit suggested, but still heavy.  
**What is good**
- The giant duplicated “Other” section was removed; the UI is now built through `buildSubcategoryUI()` and shared helpers.
- Grouping now uses `groupStarsByClass()`.

**Issues**
- The file is still doing two jobs: filtering display state and generating a large dynamic sub-UI.
- `generateStellarClassFilters()` rebuilds the entire container each time. Depending on how often the pipeline reruns, this can become expensive and can reset transient UI state unless carefully restored.
- The module still depends on direct DOM lookups (`stellar-class-container`, `filters-form`).
- Individual per-star controls can become very large for dense classes; there is no virtualization or lazy rendering.

**Recommendation**
- split filtering logic from DOM generation.
- consider incremental updates or memoized rendering for the stellar-class UI.

### `filters/constellationFilter.js`
**Status:** functionally rich, but still uneven.  
**Issues**
- It still logs directly to console during normal successful operation.
- Rendering constants remain local in several functions (`const R = 100` in multiple places) instead of using the shared radius constant.
- Label generation still uses canvas text creation inline instead of a shared label/sprite helper.
- The loader methods silently replace failed data with empty arrays/maps, which can conceal load regressions.

**Recommendation**
- remove routine success `console.log`.
- finish constant extraction and centralize text-sprite/label creation.

### `filters/constellationOverlayFilter.js`
**Status:** one of the most computationally expensive modules and still under-refactored.  
**Issues**
- It still hardcodes `const R = 100`.
- Globe and Mollweide overlay creation still duplicate the boundary grouping and ordering logic, even though the old audit already identified that pattern.
- The file allocates heavily in hot geometry paths (`clone()`, `new Vector3()`, repeated conversions).
- Greedy color assignment is acceptable, but palette and tolerance values are embedded locally rather than centralized.
- `lambda0` is computed in `createConstellationOverlayForGlobe()` but unused.

**Recommendation**
- extract shared ordering/grouping logic.
- centralize render constants.
- preallocate temporary vectors where possible.

### `filters/connectionsFilter.js`
**Status:** materially improved.  
**What is good**
- The spatial hash replaced the old all-pairs scan for the general star set.
- Position caching via symbol is a real performance improvement.

**Remaining issues**
- Rendering configuration is still managed through module-level mutable variables (`connectionMaxWidth`, `connectionFadePower`, `connectionLabelSize`), which makes the module stateful and harder to test.
- `GC_SEGMENTS` remains local even though circle/arc segment constants now exist centrally.
- There is still significant geometry allocation during render/update paths.

**Recommendation**
- move line configuration into explicit parameters or a passed config object.

### `filters/cloudsFilter.js`
**Status:** workable, but still inefficient and partly hardcoded.  
**Issues**
- The overlay still hardcodes a 100 LY cap (`if (distance > 100) return;`) instead of using the current distance filter or a named constant.
- For each cloud star, the file still computes neighbors with an O(n²) scan inside the cloud subset.
- The file retains local comments and behavior around “three nearest neighbors”, but the code actually uses `Math.min(4, neighbors.length)` and pushes four neighbors, not three.
- `greatCircleToMollweide(..., 100, ...)` still hardcodes the radius.
- Error handling during overlay update is `console.error(e)` only.

**Recommendation**
- fix the comment/code mismatch.
- replace local `100` usages with the shared radius or a named cloud-range constant.
- consider spatial indexing for cloud subsets if datasets grow.

### `filters/cloudDensityFilter.js`
**Status:** improved but still contains duplicated geometry/projection logic.  
**Issues**
- This class still duplicates a lot of the same grid/projection/heatmap logic found in `densityFilter.js`.
- Even after partial constant extraction, there are still embedded transform details and repeated overlay creation logic.
- The module imports `getDustCloudColor` but uses `uniqueColorFromName()` for the actual cloud color path, so imports are not fully clean.
- It allocates many cloned materials/meshes per cell.

**Recommendation**
- factor out a shared grid-overlay base or shared geometry builders with `densityFilter.js`.
- remove unused imports.

### `filters/densityColorUtils.js`
**Status:** acceptable.  
**Issues**
- The file still mixes generic color transformations with label-material creation.
- That is manageable now, but it is a concern-boundary smell.

**Recommendation**
- keep color math and material factories separate when the rendering layer is cleaned up.

### `filters/densityData.js`
**Status:** simple but weakly typed.  
**Issues**
- On failure, it silently falls back to `[]`.
- Callers cannot distinguish missing density reference data from load failure.

**Recommendation**
- use explicit error reporting or a status object.

### `filters/densityFilter.js`
**Status:** still a major refactor candidate.  
**Issues**
- This class remains large and handles grid generation, density computation, edge rendering, and texture generation together.
- Although constants were partially extracted, `mollXFactor` and `mollY` still use literal `100` at lines 108–109.
- The module still does heavy per-cell object/material creation.
- DOM-independent render logic is mixed with off-screen canvas texture logic, which reduces testability.
- Like isolation/cloud-density overlays, this should eventually become a composition of smaller focused parts.

**Recommendation**
- continue extracting shared projection/grid code.
- replace remaining literal `100` values with `GLOBE_RADIUS`.

### `filters/densitySegmentation.js`
**Status:** partly improved, partly still inefficient.  
**What is good**
- `buildCellMap()` and `neighbors()` now use `Map`, which fixes one of the old audit’s concerns.

**Remaining issues**
- `segmentOceanCandidate()` still performs repeated linear scans over candidate sets (`filter`, `includes`, nested comparisons).
- `computeInterconnectedCell()` remains O(n²) inside a cluster.
- The module still mixes geometry helpers and segmentation heuristics in one file.

**Recommendation**
- continue the Map/set-based optimization work into the segmentation routines.

### `filters/dustCloudColors.js`
**Status:** good.  
**Issues**
- Clean and efficient enough.
- Only minor point: if cloud names are ever normalized more aggressively elsewhere, keep the normalization strategy aligned.

### `filters/dustCloudDataCache.js`
**Status:** fixed relative to the old audit.  
**Issues**
- Bounded cache is good.
- There is still no cache invalidation by version or source freshness; acceptable for local static assets, but note it if the data becomes dynamic.

### `filters/isolationFilter.js`
**Status:** still one of the heaviest modules.  
**Issues**
- This file still mixes geometry, overlay construction, DOM reads, segmentation, and constellation assignment in one class/module.
- It still contains many hardcoded radius values (`100`) and projection constants instead of using the shared constants.
- It still performs direct DOM lookups in the update path (`isolation-slider`, `isolation-tolerance-slider`).
- Several geometry/update sections still allocate aggressively with clones/new vectors.
- Comments indicate assumed availability of constellation helpers; that coupling should be cleaner.

**Recommendation**
- split into grid construction, rendering, and labeling/assignment units.
- remove direct DOM reads from update logic.
- finish constant extraction.

### `filters/planesFilter.js`
**Status:** mixed quality.  
**What is good**
- Context checks for canvas creation are now present.
- The module is feature-rich and mathematically coherent.

**Issues**
- Plane construction and label creation are still tightly mixed.
- Text sprite/plane creation logic is duplicated between `createTextSprite()` and `createTextPlane()`; the old “sprite utility” idea is still not fully realized.
- Default radius values remain local in many exported functions.
- The mathematical constants and transform basis are not documented with provenance.

**Recommendation**
- extract shared text-rendering helper(s).
- centralize radius defaults and document coordinate-conversion sources.

### `filters/ConcaveGeometry.js`
**Status:** still risky by design.  
**Issues**
- The brute-force tetrahedra approach remains expensive for larger point sets.
- The file is isolated enough that the performance concern is manageable if inputs are guaranteed small, but that assumption should be documented in-code.

**Recommendation**
- add a hard guard or an explicit comment documenting expected point-count bounds.

---

## Script submodules

### `script/filterPipeline.js`
**Status:** good refactor step, but not yet cleanly pure.  
**What is good**
- This file successfully removed a lot of orchestration work from `script.js`.

**Issues**
- It still reads the DOM directly (`document.getElementById('filters-form')`) in cloud overlay paths.
- It still converts many opacities from 0–100 to 0–1 on the fly, which proves the normalization problem is unresolved.
- It writes many flags back into app state, including flags that duplicate the current filter result. That state synchronization burden is still high.
- It contains cloud overlay mutation, constellation rebuild triggers, plane updates, and map refreshes all in one pipeline.

**Recommendation**
- move DOM extraction up to the form-state layer.
- normalize percentages before they ever reach this pipeline.

### `script/constellationManager.js`
**Status:** generally better than direct handling in `script.js`, but it exposes an integration flaw elsewhere.  
**Issues**
- The manager correctly owns rebuild/clear logic, but its responsibility overlaps with `filters/index.js`, which is still adding overlay meshes directly. The manager should be the only place mutating constellation scene objects.
- Mollweide refresh logic rebuilds labels/overlays by dispose-and-recreate; acceptable, but expensive.

**Recommendation**
- make this the sole owner of constellation visuals.

### `script/planeManager.js`
**Status:** cleaner than before, but still has constant leakage.  
**Issues**
- It still embeds hardcoded globe radius values (`100`) in config lambdas instead of importing the shared radius.
- Configuration is cleaner than the old duplicated plane setup, but the manager still owns too much knowledge about concrete plane constructors.

**Recommendation**
- import `GLOBE_RADIUS`.
- consider passing a projection config rather than hardwiring constructor calls here.

### `script/starInteractions.js`
**Status:** usable, but tightly coupled to map internals.  
**Issues**
- It depends on specific structure (`map.starGroup.children`, `map.starObjects`, `map.camera`, `map.canvas`) instead of a clearer interaction interface.
- Click/hover both re-implement the same picking logic with mostly duplicated code.
- Tooltip hit-testing via `document.getElementById('tooltip')` is local and imperative.

**Recommendation**
- extract shared pick logic.
- define a thinner map adapter interface for interactions.

---

## Rendering/utilities

### `cameraControls.js`
**Status:** functional, but still globally coupled.  
**Issues**
- Both control classes still call `window.requestRender?.()` instead of receiving a render invalidation callback.
- Optional chaining on pointer capture/release is acceptable, but this file is another example of hidden dependency on global render invalidation.

**Recommendation**
- inject `requestRender` into the control constructors.

### `labelManager.js`
**Status:** featureful, but still expensive and somewhat ad hoc.  
**Issues**
- The 2D canvas null check is fixed, but label generation still rebuilds canvas textures often.
- The manager keys rendered objects by star object identity while caching rebuild metadata by derived string key. That split keying model is workable, but it increases conceptual overhead.
- The file still creates many temporary vectors per update.
- Globe/Mollweide/TrueCoordinates behavior branches are all intertwined in one method.

**Recommendation**
- split projection-specific label placement into dedicated helpers.
- consider memoizing label texture generation more aggressively.

### `utils/geometryUtils.js`
**Status:** important core module, still with adoption gaps.  
**Issues**
- Many default values remain hardcoded in function signatures (`R = 100`, `segments = 32`).
- Some of those should now import shared constants.
- The cache maps are unbounded. For a browser app with repeated rotations/projections this may be acceptable, but it is still a memory-growth vector.
- The module is doing projection math, parsing, subdivision, wrapping, and caching all together.

**Recommendation**
- centralize defaults through shared constants.
- consider cache pruning if the app is used for very long sessions.

### `utils/renderUtils.js`
**Status:** good utility layer.  
**Issues**
- This is one of the cleaner files.
- Minor note: `disposeMaterial()` iterates over object values broadly; it works, but it is slightly aggressive/introspective and should be documented carefully.

---

## Data/reference assets (format review only)

### `stellar_class.json`
**Format:** stable mapping from stellar class letter to `{ color, size, hierarchy }`.  
**Assessment:** good format.  
**Improvement**
- validate it at load time in `filters/stellarClassData.js`.

### `constellation_center.json`
**Format:** array of `{ name, raDeg, decDeg }`.  
**Assessment:** good runtime format.

### `constellation_boundaries.json`
**Format:** array of polygon/boundary objects with constellation identifiers and RA/Dec sequences.  
**Assessment:** good runtime format, but large enough that load failure should be surfaced clearly.

### `constellation_full_names.json`
**Format:** abbreviation/full-name mapping.  
**Assessment:** fine.

### `constellation_center.txt`
**Format:** reference/raw text source.  
**Assessment:** acceptable as source/reference asset.  
**Improvement**
- README should state whether it is authoritative input or historical raw data only.

### `constellation_boundaries.txt`
**Format:** raw/reference boundary input.  
**Assessment:** acceptable as source/reference asset.  
**Improvement**
- same as above: document authority and generation path.

### `data/manifest.json`
**Format:** object with `version`, `generatedBy`, and `files`.  
**Assessment:** good.  
**Improvement**
- `app/starData.js` should validate `version` and `files` more explicitly.

### `data/stars_0_20_LY.json` through `data/stars_90_100_LY.json`
**Format:** arrays of star records with raw catalog-style fields.  
**Assessment:** format is consistent enough for current use.  
**Improvement**
- the project should eventually either normalize these offline or commit to the runtime-normalization contract and stop using raw legacy fields in the rendering/filter code.

### `data/*cloud*.json`
**Files reviewed by format only**
- `Aquila_cloud_data.json`
- `Auriga_cloud_data.json`
- `Blue_cloud_data.json`
- `Ceti_cloud_data.json`
- `Dorado_cloud_data.json`
- `Eridani_cloud_data.json`
- `Galactic_cloud_data.json`
- `Gemini_cloud_data.json`
- `Hyades_cloud_data.json`
- `Leo_cloud_data.json`
- `Local_interstellar_cloud.json`
- `Microscopi_cloud_data.json`
- `North_Galactic_Pole_cloud_data.json`
- `Ophiucus_cloud_data.json`
- `Vela_cloud_data.json`

**Format:** arrays of cloud-observation rows with star identifiers, distances/velocities, cloud labels, and RA/DEC.  
**Assessment:** format is usable and consistent enough.  
**Improvement**
- if cloud matching becomes more important, add a normalization step for cloud star names/IDs during load rather than normalizing repeatedly in overlay code.

---

# Priority fixes to do next

## Priority 1 — correctness / architecture
1. **Remove direct scene mutation from `filters/index.js`** and let `script/constellationManager.js` own constellation visuals exclusively.
2. **Delete `script_backup_before_split.js`** from the repository.
3. **Eliminate `window.*` scene and render coupling** in:
   - `filters/filterOverlayState.js`
   - `cameraControls.js`
   - `script.js`
4. **Replace `Object.defineProperties` state wrapping in `script.js`** with a real application state object.

## Priority 2 — consistency
5. **Normalize all opacity values to 0–1 inside `filters/filterFormState.js`.**
6. **Use normalized star fields consistently**:
   - prefer `distance` over `Distance_from_the_Sun`
   - prefer `apparentMagnitude` / `absoluteMagnitude`
   - use `getPrimaryClass()` everywhere
7. **Finish constant extraction** for remaining `100`, segment counts, border values, and palette/tolerance constants.

## Priority 3 — maintainability / performance
8. **Split large hybrid modules**:
   - `script.js`
   - `filters/isolationFilter.js`
   - `filters/densityFilter.js`
   - `filters/constellationOverlayFilter.js`
9. **Deduplicate remaining helper logic**:
   - `utils.js` vs `shared/colorUtils.js`
   - inline text sprite/plane creation in `filters/planesFilter.js` and `filters/constellationFilter.js`
10. **Reduce repeated DOM lookups and full UI rebuilds**, especially in the filter pipeline and stellar-class UI generation.

---

# Replacement verdict

This codebase is in a **meaningfully better state** than the previous audit claimed, because several of the earlier structural recommendations have already been implemented. The current problems are less about obvious missing utilities and more about **finishing the refactor consistently**.

The main theme now is:

- the shared abstractions exist,
- but too many modules still bypass them,
- and the application still relies on hidden global coupling at the orchestration layer.

That is where the next cleanup pass should focus.
