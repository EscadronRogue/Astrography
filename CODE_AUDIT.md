# Astrography — Code Audit (Replacement)

**Date:** April 15, 2026  
**Scope:** every source file in the repository was reviewed end to end. Data assets were format-checked only, not fully read.  
**Standard applied:** professionalism, efficiency, consistency.  
**This file is intended to replace the current `CODE_AUDIT.md`.**

---

## Audit principles used

This audit is intentionally file-specific rather than thematic. Each file is evaluated for:

- architectural clarity
- runtime correctness risk
- consistency with the newer shared modules
- duplication
- hidden coupling
- performance characteristics
- maintainability of future refactors

Where the previous audit was already fixed, the issue is not repeated as active debt.

---

## Root files

### `.gitattributes`
**Status:** acceptable.  
**Findings**
- Minimal and correct for a small browser project.
- No repo-health issue found here.

**Action**
- No change required.

### `.gitignore`
**Status:** acceptable, but still underspecified for local work products.  
**Findings**
- The largest stale risk from the previous audit (`script_backup_before_split.js`) is already gone.
- There are still no explicit ignore rules for local export output or ad hoc audit artifacts, which increases the chance of noisy commits during local experimentation.

**Action**
- Add ignore entries for local export/debug artifacts if they are created during regular use.

### `CODE_AUDIT.md`
**Status:** outdated again.  
**Findings**
- The current file correctly recognizes some already-fixed issues, but it is still partially transitional.
- It mixes active findings with refactor-history notes, which makes it less useful as a current engineering document.
- Several modules have moved since the last meaningful rewrite of this file, especially around filter pipeline integration.

**Action**
- Replace this file with the present audit so the repository’s main audit matches the current tree.

### `HIGH_RISK_REFACTOR_NOTES.md`
**Status:** useful historical note, but not an active source of truth.  
**Findings**
- The file accurately records a completed refactor pass.
- Its “remaining follow-up work” is still directionally correct.
- It overlaps with the audit and can become stale quickly if treated as a live backlog.

**Action**
- Keep it as a refactor log, but do not use it as the authoritative issue tracker.
- Add a one-line note at the top pointing readers to `CODE_AUDIT.md` for current findings.

### `README.md`
**Status:** decent but incomplete.  
**Findings**
- It documents features and startup flow reasonably well.
- It still understates the real architecture: `script.js` remains the entrypoint, but the effective runtime now depends heavily on `script/filterPipeline.js`, `script/planeManager.js`, `script/constellationManager.js`, shared helpers, and the filter modules.
- It says downstream code can rely on normalized fields, but the codebase still mixes normalized fields (`distance`, `apparentMagnitude`, `absoluteMagnitude`, `starId`) with legacy raw fields (`Distance_from_the_Sun`, `Stellar_class`, etc.). That is the most important documentation gap.
- It does not document the state bridge pattern in `script.js`, the map managers exposed to other modules, or the render scheduling mechanism.

**Action**
- Add a “runtime architecture” section.
- Define the canonical star schema explicitly.
- Document which files own the pipeline, map construction, label editing, export, and overlay subsystems.

### `index.html`
**Status:** functional, but structurally inconsistent.  
**Findings**
- The file mixes static form markup with dynamically generated sections. That hybrid pattern is the main UI maintenance risk because defaults now live in three places: HTML, JS UI generators, and filter default/state code.
- The visible product name still says **“Starmap Visualization”** in both `<title>` and `<h1>`, while the repository/project name is **Astrography**.
- External CDN assets are loaded without subresource integrity metadata.
- There is partial accessibility work (`aria-label` on buttons), but not a consistent accessibility model for the sidebar, collapsible groups, fullscreen controls, generated fieldsets, or export/editor modes.
- The tooltip skeleton in HTML does not match how `tooltips.js` actually rebuilds tooltip contents dynamically, so some of the placeholder elements are effectively misleading scaffolding.
- Several repeated control pairs are manually authored in markup instead of being generated from one schema.

**Action**
- Align naming to Astrography.
- Move form definition toward one source of truth.
- Add SRI where possible.
- Improve semantic grouping and ARIA attributes for collapsible/filter/editor UI.

### `styles.css`
**Status:** stable enough to use, but not easy to maintain.  
**Findings**
- The CSS is no longer broken, but it remains one large file that mixes layout, theme tokens, filter styling, map containers, export overlays, label editor affordances, tooltip styling, and responsive behavior.
- The same accent and neutral colors are repeated instead of centralized as CSS variables.
- Sizing is still largely hand-tuned for one layout regime.
- The stylesheet is doing too much for a project that already has clear UI subsections.

**Action**
- Split into at least `base`, `layout`, `filters`, `maps`, and `editor/export`.
- Promote repeated colors and spacing to CSS custom properties.
- Group responsive rules by component rather than by appearance order.

### `constellation_boundaries.json`
**Status:** acceptable runtime asset.  
**Format check**
- JSON array structure is valid.
- This is clearly a normalized runtime representation, and that is preferable to reparsing the text source at runtime.

**Concern**
- It is large enough that accidental manual edits would be high risk.
- There is no checksum/generation provenance in the file.

**Action**
- Treat as generated/normalized data and document its provenance.

### `constellation_boundaries.txt`
**Status:** acceptable reference asset.  
**Format check**
- Line-based raw boundary format appears consistent.
- It is appropriate as a source/reference file, not as a preferred runtime format.

**Concern**
- Runtime code still fetches this text file instead of the normalized JSON in `filters/constellationFilter.js`, which keeps parsing logic in the hot path.

**Action**
- Prefer the normalized JSON at runtime and reserve the `.txt` file for source/reference use only.

### `constellation_center.json`
**Status:** good normalized asset.  
**Format check**
- Clean array-of-objects shape with `name`, `raDeg`, `decDeg`.
- This is the right runtime format.

**Concern**
- Multiple modules load this same file independently.

**Action**
- Centralize loading/caching in one module and share the result.

### `constellation_center.txt`
**Status:** acceptable legacy/reference asset.  
**Format check**
- Plain-text coordinate listing is consistent with a source/reference workflow.

**Action**
- Keep as reference only.
- Avoid dual-runtime ownership with the JSON file.

### `constellation_full_names.json`
**Status:** good lookup asset.  
**Format check**
- Object map from abbreviation to full name is appropriate.

**Concern**
- Loading is still embedded in the constellation filter module instead of a dedicated data layer.

**Action**
- Keep the asset; move ownership to a small constellation data service if refactoring continues.

### `stellar_class.json`
**Status:** acceptable runtime data.  
**Format check**
- Object keyed by class, with `color`, `size`, and `hierarchy`.
- Matches the current filter expectations.

**Concern**
- It omits an explicit `"Other"` entry even though the UI treats `"Other"` as a first-class bucket.

**Action**
- Add an `"Other"` config entry or document the intended fallback centrally.

---

## App layer

### `app/presets.js`
**Status:** useful, but still too DOM-bound and too trusting.  
**Findings**
- The file now catches `localStorage` failures, which is good.
- It still reaches directly into the DOM by form ID and checkbox ID rather than receiving the relevant elements from the caller.
- `deserializeMap()` and `deserializeSet()` trust payload shape too easily. Invalid JSON structure will not crash often, but it can silently produce malformed in-memory state.
- Version handling is accept/reject only. There is no migration path for old payloads.
- All persistence failures are console-only; the user gets no visible signal that saving or restoring failed.

**Action**
- Pass the form element and “remember presets” checkbox in from the caller.
- Add payload validation.
- Add a tiny migration layer for older schema versions.
- Surface persistence failure in the UI.

### `app/starData.js`
**Status:** central, but still too lossy and too permissive.  
**Findings**
- `normalizeStarRecord()` is one of the better changes in the repo and clearly improves downstream consumption.
- `loadStarData()` still collapses all failure modes to `[]`. Manifest failure, partial-bucket failure, invalid manifest shape, and network errors all become indistinguishable “no stars.”
- Bucket fetches happen with `Promise.all`, so one rejected fetch throws the whole load. At the same time, missing-file branches return `[]`. The resulting error semantics are uneven.
- The loader does not memoize successful results for the current session.
- `buildStableStarId()` still falls back to name plus coordinates. That is usable, but it is not truly stable if source naming or float precision changes.

**Action**
- Return `{ stars, errors }` or throw typed errors.
- Memoize successful manifest and bucket loads.
- Define one canonical star identifier strategy and document fallback quality.

### `app/stellarClassState.js`
**Status:** too thin to justify its own module in the current form.  
**Findings**
- It is effectively two wrappers around `captureFormState()` and `restoreFormState()`.
- It hardcodes `document.getElementById('stellar-class-container')`.
- The abstraction is not wrong, but it does not buy enough separation to justify another module boundary.

**Action**
- Either inline it into `script/filterPipeline.js` or make it accept the container element directly.

---

## Shared layer

### `shared/constants.js`
**Status:** strong addition, incomplete adoption.  
**Findings**
- This module is the right direction.
- The codebase still hardcodes major rendering constants elsewhere: globe radius values, Mollweide dimensions, segment counts, convergence tolerances, and UI-derived defaults still appear in many files.
- It currently mixes rendering constants, domain constants, UI constants, and regex/constants used by one module only.

**Action**
- Continue migrating remaining magic numbers here.
- Eventually split by concern once adoption is complete.

### `shared/colorUtils.js`
**Status:** solid, but not yet the single source of truth.  
**Findings**
- Good consolidation of shared color logic.
- `utils.js` still duplicates color conversion/interpolation helpers.
- `getCloudNameFromFileUrl()` reimplements filename parsing directly instead of consuming the shared cloud regex constant.
- The file still mixes generic color math with cloud-specific naming helpers.

**Action**
- Remove duplicated color helpers from `utils.js`.
- Either use `CLOUD_FILE_REGEX` from constants or delete that constant if it is unnecessary.
- Consider separating cloud naming from generic color logic.

### `shared/formUtils.js`
**Status:** useful, but lightweight.  
**Findings**
- It is a sensible primitive for save/restore behavior.
- Validation is still caller-owned, which is acceptable for trusted local persistence but weak for imported payloads or future settings import/export.
- It reports problems through console warnings instead of structured return values.

**Action**
- Add optional validation hooks and a structured warning/error return path.

### `shared/renderScheduler.js`
**Status:** good and appropriately small.  
**Findings**
- This module is doing exactly the kind of decoupling the rest of the project still needs.
- No major issue found here.

**Action**
- Keep as is.

### `shared/starUtils.js`
**Status:** valuable, but not fully adopted.  
**Findings**
- This module should be the canonical place for star ID, coordinate, and projection-precompute behavior.
- It still falls back to raw legacy fields, which is necessary today but reinforces the lack of a clean normalized schema boundary.
- `precalcMollweideData()` still uses the hardcoded convergence threshold `1e-10` instead of the shared epsilon family.
- `script.js` still wraps these functions instead of using them directly, which adds indirection without adding policy.

**Action**
- Make all star-coordinate consumers depend on this module directly.
- Replace embedded convergence thresholds with shared constants.
- Narrow the accepted input schema over time.

### `shared/stellarClassUtils.js`
**Status:** correct direction.  
**Findings**
- The class normalization logic is now centralized, which is a real improvement.
- The rest of the app still depends on fallback behavior (`Other`) rather than on one explicit domain config for that category.
- The helper still works mostly on raw star records because the domain model has not been normalized enough.

**Action**
- Add a first-class `"Other"` entry to the runtime configuration.
- Continue migrating direct `Stellar_class` reads out of the rest of the code.

### `shared/uiFactory.js`
**Status:** useful foundation, but still halfway adopted.  
**Findings**
- It provides good primitives for fieldsets, controls, and slider/number sync.
- `syncSliderPair()` still looks up elements by ID instead of accepting actual nodes, which keeps the API more brittle than necessary.
- Some logic here is still tightly coupled to the current DOM shape.
- UI creation remains split between this file, `ui/filterUI.js`, `filters/filterUISetup.js`, and static HTML.

**Action**
- Prefer element-based APIs over ID-based APIs.
- Push more repeated control creation into this module.
- Move toward one UI schema.

---

## Filters

### `filters/ConcaveGeometry.js`
**Status:** specialized and self-contained, but presently isolated.  
**Findings**
- The implementation is mathematically heavy and not obviously integrated into the current main runtime.
- For a file this specialized, the comments are decent, but the absence of call-site context makes future maintenance harder.
- It likely belongs in a more explicitly named geometry/experimental namespace unless it is core.

**Action**
- Confirm whether it is still active runtime code.
- If active, add one short note describing where it is used.
- If inactive, move it out of the main filter directory.

### `filters/cloudDensityFilter.js`
**Status:** functional, but over-coupled to projection constants and canvas side effects.  
**Findings**
- The overlay class creates meshes and the Mollweide heatmap texture internally, which is reasonable.
- It still bakes in projection dimensions and map assumptions in several places, even after the shared constants pass.
- The code creates and updates heavy scene objects inside one class, so data preparation, mesh generation, and rendering policy are still fused together.
- The cloud overlay color derivation is effectively duplicated with related cloud overlay logic in `filters/cloudsFilter.js`.
- The current API returns a mutable overlay object whose internal members are heavily relied on elsewhere.

**Action**
- Separate cloud-density computation from THREE object creation.
- Consolidate shared cloud metadata logic with `filters/cloudsFilter.js`.
- Reduce the mutable surface area of the returned overlay object.

### `filters/cloudsFilter.js`
**Status:** works, but still expensive and only partially normalized.  
**Findings**
- `loadCachedCloudData()` usage is good.
- Matching cloud stars to the main star list is still name-based. That is fragile and can silently miss stars when names differ slightly between datasets.
- The nearest-neighbor connection generation inside `createCloudOverlay()` is still an O(n²) scan over cloud members. That is acceptable only because cloud datasets are smaller than the main star catalog.
- `mapType` branches are doing too much in one function.
- The module still falls back to legacy raw fields for distance.
- Error handling in `updateCloudsOverlay()` is just `console.error(e)` with no context-rich message.

**Action**
- Introduce a better cross-dataset matching key if one exists.
- Split data preparation from projection-specific geometry creation.
- Use normalized star distance consistently.
- Improve error messages with file/map context.

### `filters/colorFilter.js`
**Status:** notably improved, but still schema-dependent.  
**Findings**
- This file has been cleaned up meaningfully. It now uses `getPrimaryClass()`, which fixes a key issue from older audits.
- The galactic-plane color branch still assumes `z_coordinate` exists as the raw source field and does not use a normalized schema abstraction.
- It mutates stars in place, which matches the current pipeline, but that mutation-heavy contract should be explicit.

**Action**
- Keep this file small and disciplined.
- Migrate remaining raw-field reads behind star helpers or a normalized schema.

### `filters/connectionsFilter.js`
**Status:** materially improved, still not fully cleaned up.  
**Findings**
- The switch from the old naive all-pairs scan to a spatial grid is a real performance improvement.
- `STAR_POSITION_CACHE_KEY` caches true positions directly on star objects. That is fast, but it makes cached geometry state implicit and mutation-prone.
- `createConnectionLines()` still takes a `stars` parameter it does not need.
- The file mixes pair computation, classic line rendering, custom wide-line rendering, label placement, and Mollweide wrap logic. It is still too broad in responsibility.
- Several rendering constants and assumptions remain embedded in the module.
- There is no explicit invalidation strategy for the per-star position cache if the source object model changes in the future.

**Action**
- Remove unused parameters.
- Split pure pair computation from rendering.
- Move projection constants to shared constants.
- Consider caching outside star records if the state model is cleaned up later.

### `filters/constellationFilter.js`
**Status:** important, still carrying old integration debt.  
**Findings**
- The missing full-name loader issue has been fixed.
- The module still fetches `constellation_boundaries.txt` and parses it at runtime instead of preferring the normalized JSON asset.
- It logs successful loads to the console, which is debugging noise in production code.
- It owns too many responsibilities: data loading, parsing, label texture generation, globe geometry creation, Mollweide geometry updates, and name rendering.
- This module and `filters/densityData.js` both load constellation-center data separately.
- Label creation code here overlaps conceptually with general label rendering patterns elsewhere.

**Action**
- Move constellation data loading/caching to a dedicated data module.
- Prefer normalized JSON at runtime.
- Remove success-path console logging.
- Leave only constellation rendering logic here.

### `filters/constellationOverlayFilter.js`
**Status:** algorithmically dense and still hard to maintain.  
**Findings**
- This module contains nontrivial spherical geometry logic and custom overlay generation.
- It is not obviously wrong, but it is difficult to audit quickly because geometry preparation, polygon tests, centroid logic, and overlay mesh construction are tightly interleaved.
- There is a lot of implicit domain knowledge in the code and not enough explanatory comments around invariants and expected input shape.
- Performance may degrade as overlay complexity grows because there is no clear separation between precomputation and per-refresh work.

**Action**
- Document the data assumptions and geometric invariants.
- Break out pure spherical helpers from mesh construction.
- Add a smoke-test harness for representative overlay inputs.

### `filters/densityColorUtils.js`
**Status:** acceptable, small, and useful.  
**Findings**
- Reasonable helper module.
- The function set is a little mixed: generic color transforms, constellation color stability, and custom label shader material all live together.
- The shader material helper is not really the same concern as the color helpers.

**Action**
- Split shader-material helpers from generic color utilities if more rendering helpers accumulate.

### `filters/densityData.js`
**Status:** too duplicative for its size.  
**Findings**
- It caches center data, which is good.
- It independently fetches `constellation_center.json`, duplicating responsibility already present in `filters/constellationFilter.js`.
- It silently converts load failure into an empty array, which has the same “no data vs failure” ambiguity seen elsewhere.

**Action**
- Consolidate constellation-center ownership in one module.
- Return structured errors or share a common loader.

### `filters/densityFilter.js`
**Status:** one of the main complexity hotspots after `script.js`.  
**Findings**
- This module still combines data grouping, topology creation, overlay scene-object creation, Mollweide heatmap rendering, and live update logic.
- It performs DOM lookups inside update paths (`density-slider`, `density-tolerance-slider`, etc.), which couples rendering logic to specific form IDs and makes the class harder to test.
- It still reads legacy source fields like `Distance_from_the_Sun`.
- Several rendering/projection constants remain embedded.
- The returned overlay object has a wide mutable surface, similar to the cloud-density overlay.
- The code is functional, but it is still much too large for one filter module.

**Action**
- Separate state reading from overlay computation.
- Use normalized distance consistently.
- Split data analysis, scene object creation, and texture rendering into smaller units.

### `filters/densitySegmentation.js`
**Status:** computationally interesting, but still expensive and under-documented.  
**Findings**
- The file contains meaningful segmentation logic and some improvements such as a pre-built cell map for certain paths.
- Other paths still do repeated local scans (`candidateCells.filter`, repeated neighbor counting over full arrays), which are acceptable on modest grids but not ideal.
- The geometric and segmentation heuristics are only lightly explained, which makes correctness maintenance difficult.
- It exports `subdivideGeometry` from another module, which is convenient but slightly odd from an ownership perspective.

**Action**
- Document the intended segmentation criteria and thresholds.
- Reduce repeated array scans in hot paths.
- Keep ownership boundaries clearer.

### `filters/distanceFilter.js`
**Status:** good and simple.  
**Findings**
- One of the cleanest modules in the repo.
- It correctly uses normalized `distance`.

**Action**
- No significant change required.

### `filters/dustCloudColors.js`
**Status:** acceptable, but domain consistency should improve.  
**Findings**
- The predefined cloud palette is straightforward.
- `getDustCloudColor(name)` assumes `name.toLowerCase()` is safe; that is fine today because callers pass strings, but the function could be trivially hardened.
- The canonical names are embedded here without provenance or documentation.

**Action**
- Add a defensive string cast.
- Document how these colors were chosen if they are part of the product identity.

### `filters/dustCloudDataCache.js`
**Status:** improved, but not a true LRU cache.  
**Findings**
- The bounded cache is better than the previous unbounded map.
- Accessing an existing key does not refresh recency, so this is FIFO-on-insert rather than true LRU.
- It does not validate that the fetched payload is actually an array.

**Action**
- Refresh key order on cache hits if true LRU behavior is intended.
- Validate the response shape before caching.

### `filters/filterDefaults.js`
**Status:** useful, but currently duplicative.  
**Findings**
- The object is effectively application schema and fallback config.
- Many of the same defaults also exist in HTML control values and in `readFilterState()` fallbacks.
- Opacity and percentage-like values are still represented in UI scale rather than internal normalized scale, forcing repeated divisions throughout the pipeline.

**Action**
- Make this the single defaults source.
- Normalize percent/opacity values at the form boundary.

### `filters/filterFormState.js`
**Status:** central and mostly clean, but still not the canonical schema layer it should be.  
**Findings**
- The helper functions are sensible.
- It is doing the real work of translating form data to runtime state, which makes it the natural schema boundary.
- Internal values are still mostly UI-shaped rather than runtime-shaped. The repeated `/ 100` conversions elsewhere are the visible symptom.
- `readClassScaleMap()` assumes recognized class names plus `"Other"`, but that convention is not defined in the stellar-class runtime data itself.

**Action**
- Normalize units here, especially percentages/opacities.
- Make this the single runtime schema adapter.

### `filters/filterOverlayState.js`
**Status:** meaningfully improved, still a little too stateful.  
**Findings**
- The removal of `window.*` dependencies was a real improvement.
- The module still keeps overlay singletons in module scope (`isolationOverlay`, `densityOverlay`). That is less harmful than browser-global state, but it still hides ownership from the caller.
- Cleanup removes scene membership but does not itself own object disposal in a comprehensive way; that responsibility is still spread across modules.

**Action**
- Consider moving overlay ownership into explicit application state.
- Clarify disposal ownership.

### `filters/filterUISetup.js`
**Status:** okay, but another symptom of split UI ownership.  
**Findings**
- It builds several fieldsets and wires UI behavior, which is fine.
- It overlaps with both static HTML and `ui/filterUI.js`.
- The result is that the project’s UI definition is fragmented across three files plus the defaults/state code.

**Action**
- Merge UI ownership under one schema-driven layer.

### `filters/globeSurfaceFilter.js`
**Status:** too trivial and too stateful for what it does.  
**Findings**
- The module is only storing one mutable exported boolean plus a setter.
- This is an awkward abstraction because it pretends to be a filter module but is really just shared mutable state.

**Action**
- Fold this into filter state reading or an explicit app state object.

### `filters/index.js`
**Status:** important coordinator, but still doing too much indirect work.  
**Findings**
- It is the filter composition point, which is good.
- It still reads the filter form internally through a cached DOM lookup, rather than taking a parsed filter state from the caller.
- It mixes filter composition, connection computation, globe-surface state, and overlay lifecycle orchestration.
- It still exports UI setup helpers, which blurs the boundary between filtering and filter UI.

**Action**
- Keep this module focused on pure filter composition.
- Move DOM acquisition and UI exports out of this file.

### `filters/isolationFilter.js`
**Status:** another major complexity hotspot.  
**Findings**
- This file still combines data analysis, geometry generation, labeling/segmentation logic, and scene updates.
- It performs DOM lookups inside the filter logic.
- It still uses raw source fields for star distance and embeds projection constants.
- Console warnings remain in runtime paths.
- The module is algorithmically interesting, but the lack of clearer separation between computation and rendering makes it expensive to maintain.

**Action**
- Separate configuration acquisition from computation.
- Use normalized star schema consistently.
- Break out segmentation/labeling helpers into smaller modules.

### `filters/opacityFilter.js`
**Status:** clean enough, but the unit boundary is in the wrong place.  
**Findings**
- The logic is clear.
- The need to infer whether a numeric opacity is in `0–1` or `0–100` scale is a direct sign that internal and UI units are still mixed.

**Action**
- Normalize opacity before it reaches this module.

### `filters/planesFilter.js`
**Status:** functional, but too broad and still magic-number heavy.  
**Findings**
- The plane and galactic-direction overlay features are well separated conceptually from the rest of the map logic, which is good.
- The module still embeds the globe radius and several other numerical assumptions repeatedly.
- It mixes plane geometry construction, Mollweide conversion, label texture creation, and label update logic.
- Some repeated rendering patterns overlap with other label/overlay modules.

**Action**
- Consolidate repeated constants.
- Split label rendering helpers from plane geometry helpers.

### `filters/sizeFilter.js`
**Status:** still inconsistent with the normalized data model.  
**Findings**
- The module is small and easy to follow.
- The distance-based size path still uses `Distance_from_the_Sun` instead of normalized `distance`.
- It mutates star records in place, which matches the current pipeline but should remain explicit.

**Action**
- Switch fully to normalized `distance`.
- Keep this module focused and simple.

### `filters/starsShownFilter.js`
**Status:** clean and appropriately small.  
**Findings**
- Uses normalized apparent magnitude correctly.
- No structural concern beyond the general schema consistency issue.

**Action**
- No major change required.

### `filters/stellarClassData.js`
**Status:** acceptable, but load-state semantics are thin.  
**Findings**
- The promise memoization is good.
- Returning `getStellarClassData()` before a successful load yields an empty object, so callers can still accidentally rely on unloaded state.
- The path `./stellar_class.json` is fine in context, but the project would benefit from one shared data-loader convention.

**Action**
- Make loading requirements explicit in call sites.
- Consider returning a frozen default config including `"Other"`.

### `filters/stellarClassFilter.js`
**Status:** much improved, but still heavy on DOM work.  
**Findings**
- Centralizing class logic and UI generation here is better than the older scattered approach.
- The UI generation is still fairly large and imperative.
- The module uses star names as checkbox values/keys, which can collide when common names repeat or are empty.
- `container.innerHTML = ''` is acceptable here but reinforces DOM-structure coupling.
- This file should probably own either the stellar-class logic or the stellar-class UI, not both.

**Action**
- Use stable identifiers for per-star controls.
- Split logic from UI generation if this feature continues to evolve.

---

## Script / orchestration layer

### `cameraControls.js`
**Status:** improved and readable.  
**Findings**
- The move away from `window.requestRender` was good.
- The controls are still simple custom controllers without teardown lifecycle integration beyond manual `dispose()`.
- Pointer handling is basic and pragmatic; no major bug is obvious.
- One remaining maintainability issue is that these classes still directly bind DOM events in constructors, making instantiation equal activation.

**Action**
- Keep as is unless a larger app-state/lifecycle refactor happens.
- If refactoring later, separate construction from attachment.

### `labelManager.js`
**Status:** functional, but still a subtle maintenance risk.  
**Findings**
- This module does a lot of heavy lifting for labels across all map types.
- It still depends on `utils.js` for color interpolation even though shared color utilities now exist.
- `sprites` and `lines` are keyed by star object identity, while `labelCache` is keyed by stable star cache key. That mixed key strategy works today but is conceptually messy.
- `systemAngles` and `labelCache` are not obviously pruned when stars disappear permanently, so long sessions can accumulate stale entries.
- Label canvas generation is repeated per rebuild and happens directly in this class, which is expected but still expensive.
- The file is doing placement policy, rendering, cache policy, and object lifecycle all together.

**Action**
- Remove dependency on duplicated color helpers from `utils.js`.
- Normalize cache-key strategy.
- Prune stale `systemAngles` / `labelCache` entries during cleanup.
- Consider extracting canvas label texture generation into a pure helper.

### `script.js`
**Status:** still the highest-risk file in the project.  
**Findings**
- The file is smaller in responsibility than before, but not enough.
- The `state` object is still a compatibility façade over many module-scope variables implemented via `Object.defineProperties`. That preserves complexity instead of removing it.
- The file still owns bootstrap, scene construction, map construction, export selection, PNG/PDF export, label editing, line editing, undo, projection toggles, render invalidation, and compatibility wrappers around shared helpers.
- Wrapper functions like `getStarId()`, `getStarTruePosition()`, `projectStarGlobe()`, `projectStarMollweide()`, and `precalcMollweideData()` add indirection without adding policy.
- Many values are still embedded locally rather than pulled from shared constants.
- The module still publishes app state and map objects to `window` in places, which keeps hidden coupling alive.
- This file remains too large to review safely during future changes.

**Action**
- Convert `state` into a real plain object owned by one module.
- Remove forwarding wrappers around shared helpers.
- Extract export/editor subsystems into dedicated modules.
- Eliminate `window` exposure entirely.

### `script/constellationManager.js`
**Status:** good extraction, still coupled to mutable global-style state.  
**Findings**
- Pulling constellation rebuild logic out of `script.js` was a good move.
- The manager still relies on the broader mutable context contract rather than a narrower, typed interface.
- Cleanup and rebuild are clearer now, but ownership of scene objects is still distributed across app context state fields.

**Action**
- Keep this extraction.
- Narrow the context contract and formalize the state it expects.

### `script/filterPipeline.js`
**Status:** strong improvement, but still too DOM-aware.  
**Findings**
- This file is the clearest sign of architectural progress.
- It still reaches into the DOM (`filters-form`) when refreshing clouds and cloud density overlays.
- It still has to compensate for mixed units by dividing many values by 100.
- It knows too much about map internals (`setStarOpacity`, `setLabelOpacity`, update methods, border appearance, editable labels), so it is more orchestration-heavy than a pure pipeline module.

**Action**
- Push all form reading and unit normalization earlier.
- Keep this module as orchestration, but narrow how much map-specific imperative logic it contains.

### `script/planeManager.js`
**Status:** useful extraction.  
**Findings**
- Clearer than the old inlined plane handling.
- Still depends on broader mutable context and scene ownership patterns.
- Disposal and recreation logic is explicit, which is good.

**Action**
- Keep the module.
- Continue tightening its inputs.

### `script/starInteractions.js`
**Status:** readable and reasonably contained.  
**Findings**
- Good extraction from the old monolith.
- It still depends directly on tooltip DOM behavior and map object conventions.
- Highlight creation and interaction wiring are coupled, which is acceptable at this size.

**Action**
- Minor cleanup only; no urgent structural issue.

---

## UI layer

### `tooltips.js`
**Status:** generally solid, but still domain-coupled.  
**Findings**
- The URL sanitization is good and necessary.
- The module is entirely DOM-driven and string-field driven, which makes it hard to test outside the browser.
- It still reaches directly into raw star fields (`Stellar_class`, `Mass`, `Size`, `Parallax`, `Catalog_link`) rather than consuming a view model.
- It computes layout positioning directly against window dimensions, which is fine today.

**Action**
- Split “build tooltip data” from “render tooltip DOM”.
- Let a view-model layer decide which star fields are canonical.

### `ui/filterUI.js`
**Status:** useful, but a major part of the UI fragmentation problem.  
**Findings**
- The module does real work: slider sync, group enable/disable logic, fullscreen, dynamic cloud sections, and additional slider wiring.
- It still looks up many elements by ID directly.
- The list of dust cloud files is hardcoded here, which duplicates domain data in a UI file.
- This module overlaps with `filters/filterUISetup.js` and static HTML, which is the main UI consistency problem.
- The cloud fieldsets are generated dynamically here while many neighboring fieldsets remain static in `index.html`.

**Action**
- Move the dust-cloud catalog into a shared data/config file.
- Consolidate UI creation in one place.
- Keep this file for behavior only, or replace it with a schema-driven renderer.

---

## Utility layer

### `utils.js`
**Status:** partially obsolete and should be reduced.  
**Findings**
- This file still contains color helpers duplicated by `shared/colorUtils.js`.
- It mixes unrelated responsibilities: palette generation, color conversion, distance math, canvas resizing, and RA wrap handling.
- `resizeCanvas()` still assumes `parentElement` exists.
- It continues to act as a catch-all even after the project introduced better shared/util modules.

**Action**
- Remove duplicated color helpers.
- Keep only true leftovers that do not belong elsewhere.
- Harden `resizeCanvas()`.

### `utils/geometryUtils.js`
**Status:** essential, but still carries embedded constants and broad scope.  
**Findings**
- This is a core utility module and much of the project depends on it.
- It still embeds many constants directly (`100`, `200`, `400`, `1e-10`) even though shared constants now exist.
- The module spans coordinate parsing, spherical conversions, projection math, caches, Mollweide wrap handling, and great-circle helpers. It is coherent enough, but broad.
- The caches are unbounded Maps keyed by stringified floating-point inputs. That is acceptable for the current app size, but it is worth noting.

**Action**
- Migrate remaining embedded constants to shared constants.
- Consider whether the projection caches need bounding if datasets grow.

### `utils/renderUtils.js`
**Status:** good and focused.  
**Findings**
- This module is one of the cleaner utility modules in the repo.
- `disposeMaterial()` is more careful than most codebases manage.
- No major issue found beyond the general absence of tests.

**Action**
- No urgent change required.

---

## Data directory (format-only review)

### `data/manifest.json`
**Status:** acceptable format.  
**Format check**
- Object with `version`, `generatedBy`, and `files`.
- Reasonable manifest shape.

**Concern**
- The loader in `app/starData.js` supports both array and object manifest shapes, which means the project has not fully committed to this format.

**Action**
- Commit to this manifest format and simplify loader expectations.

### `data/stars_*.json`
**Status:** acceptable raw star-bucket format.  
**Format check**
- JSON arrays of star records.
- Fields include raw source names such as `Distance_from_the_Sun`, `RA_in_degrees`, `DEC_in_degrees`, `Stellar_class`, `Apparent_magnitude`, and `Absolute_magnitude`.
- The runtime normalization layer exists, but the codebase has not fully committed to consuming normalized names only.

**Action**
- Keep the raw files as source data.
- Enforce a normalized runtime schema and stop mixing raw/runtime fields in the rest of the code.

### `data/*cloud*.json` and `data/Local_interstellar_cloud.json`
**Status:** acceptable cloud-dataset format.  
**Format check**
- Arrays of cloud-member records with names, HD IDs, physical properties, and RA/DEC.
- Suitable for overlay generation, but currently matched by human-readable names rather than a more stable key.

**Action**
- Keep format as is unless a better cross-dataset identifier is available.
- Document the matching strategy and its limitations.

---

## Cross-file issues that remain active

This section is not a summary; it is a consolidation of repeated file-level findings that still deserve explicit tracking.

### 1. The normalized star schema is not enforced
Active in:
- `app/starData.js`
- `shared/starUtils.js`
- `filters/sizeFilter.js`
- `filters/densityFilter.js`
- `filters/isolationFilter.js`
- `filters/colorFilter.js`
- `tooltips.js`
- `labelManager.js`

**Problem**
The app now creates normalized fields, but many modules still read raw source fields directly. That undermines the entire normalization layer.

**Required fix**
Create one canonical runtime star schema and migrate all consumers to it.

### 2. UI defaults and runtime defaults are split across too many files
Active in:
- `index.html`
- `ui/filterUI.js`
- `filters/filterUISetup.js`
- `filters/filterDefaults.js`
- `filters/filterFormState.js`

**Problem**
Control defaults, generated controls, and parsed filter defaults do not come from one source of truth.

**Required fix**
Use a single UI/filter schema and derive the rest from it.

### 3. Percent/opacity values are still UI-shaped inside runtime code
Active in:
- `filters/filterDefaults.js`
- `filters/filterFormState.js`
- `filters/opacityFilter.js`
- `script/filterPipeline.js`
- other overlay modules

**Problem**
The app repeatedly converts `0–100` UI values into `0–1` runtime values deep inside the pipeline.

**Required fix**
Normalize units at the form boundary.

### 4. Large algorithmic modules still mix computation with THREE object lifecycle
Active in:
- `filters/densityFilter.js`
- `filters/isolationFilter.js`
- `filters/cloudDensityFilter.js`
- `filters/cloudsFilter.js`
- `filters/constellationFilter.js`
- `filters/planesFilter.js`
- `labelManager.js`

**Problem**
Data processing and rendering object creation remain too intertwined.

**Required fix**
Split pure analysis/data preparation from mesh/sprite/texture construction.

### 5. `script.js` still carries too much orchestration and editor/export logic
Active in:
- `script.js`

**Problem**
It remains the main review bottleneck and regression risk.

**Required fix**
Continue extraction until `script.js` becomes a thin bootstrap module.

---

## Priority order for the next refactor pass

1. **Enforce a canonical normalized star schema** and remove legacy raw-field reads from runtime modules.
2. **Turn filter parsing into the single runtime schema boundary**, including normalized opacity/percentage units.
3. **Split export/editor logic out of `script.js`** and replace the accessor façade state with a real object.
4. **Consolidate UI ownership** across `index.html`, `ui/filterUI.js`, and `filters/filterUISetup.js`.
5. **Centralize constellation data loading** and stop loading/parsing the same data from multiple modules.
6. **Remove duplicated color helper logic from `utils.js`** and finish shared-helper adoption.
7. **Reduce algorithmic/rendering coupling** in density, isolation, cloud, and plane overlay modules.
8. **Add smoke tests** for module loading, filter application, and representative overlay refresh paths.

---

## Fixed since earlier audits and no longer active

These should stay out of the active issue list unless they regress:

- `loadConstellationFullNames()` exists.
- shared utility modules for constants/colors/forms/star helpers/stellar-class helpers/UI factory exist.
- broken CSS selector issues were already fixed.
- `cameraControls.js` no longer depends on `window.requestRender`.
- `dustCloudDataCache.js` is now bounded.
- `connectionsFilter.js` no longer does the old naive all-pairs scan.
- `script_backup_before_split.js` has been removed.

---

## Final verdict

The project is clearly healthier than the older monolithic version, but it is still in a transitional architecture. The biggest remaining issue is not one broken module; it is that several good refactors were started but not completed end to end.

The next pass should not be another broad “cleanup.” It should finish the unfinished boundaries:

- normalized runtime data
- one filter/UI schema
- explicit state ownership
- smaller rendering modules
- a thin entrypoint
