# Applied refactor update — April 14, 2026

This audit has now been partially executed in code. The following high-risk items from the action list are no longer pending:

- Mollweide export logic was extracted from `script.js` into `script/exportManager.js`.
- Mollweide label/line editing logic was extracted from `script.js` into `script/editManager.js`.
- Opacity values are now normalized at the form boundary and propagated internally as 0–1 values.
- Distance-based sizing/isolation/density/cloud code now uses normalized distance access instead of scattered legacy reads.

The previous highest-priority architectural item has now been addressed: the `script.js` state facade was replaced with a plain application state object, and map/bootstrap responsibilities were split into dedicated modules. The next refactor target is deeper lifecycle cleanup and reducing remaining DOM coupling inside filter modules.

---

# Astrography — Code Audit (replacement)

**Date:** April 14, 2026  
**Scope:** all non-data source files reviewed directly; large data assets reviewed for format and contract only.  
**Standard applied:** professionalism, efficiency, consistency.  
**Purpose:** this file is intended to replace the existing `CODE_AUDIT.md`.

---

# What is already fixed relative to older audit notes

The repository is not in the same state as the earlier audit baseline. These points are already improved and should not remain on an active issue list:

- `script_backup_before_split.js` is gone.
- constellation visuals are now rebuilt through `script/constellationManager.js` instead of the earlier duplicate mutation path.
- `filters/filterOverlayState.js` no longer reaches into `window.*` maps; scenes are passed in explicitly.
- `cameraControls.js` no longer depends on `window.requestRender`; it uses `shared/renderScheduler.js`.
- `filters/colorFilter.js` now uses `getPrimaryClass()` for stellar-class coloring.
- `styles.css` is syntactically healthier than the older broken-selector version.
- several 2D canvas call sites now guard against missing contexts.
- `dustCloudDataCache.js` has a bounded cache instead of an unbounded forever-growing map.
- the general nearest-neighbor connection path is no longer the old naïve all-pairs scan.

Those are meaningful improvements. The remaining issues are mostly about finishing the refactor consistently and reducing architectural drag.

---

# Repository-wide findings

## 1. The main technical debt is now orchestration debt, not missing utility debt
The codebase already has the right direction: shared constants, shared color helpers, shared star helpers, a render scheduler, and dedicated managers for planes and constellations. The problem is that those abstractions are adopted unevenly. Some modules use normalized fields and shared helpers correctly; others still read legacy raw fields directly or perform DOM lookups from deep inside rendering/filter modules.

## 2. `script.js` is still the largest maintainability risk
The file remains the single biggest source of complexity. It still owns bootstrap, map classes, render invalidation, export selection, label editing, line editing, preset persistence coordination, and startup wiring. The file is no longer the only place where logic lives, but it is still the file where too many subsystems are tied together.

## 3. Internal value conventions are still inconsistent
This is the most pervasive consistency problem left in the tree:

- opacity is still represented as 0–100 in form state, then divided by 100 later in the pipeline
- distance is normalized into `star.distance`, but multiple modules still use `Distance_from_the_Sun`
- some modules use shared stellar-class parsing, some still carry their own local class assumptions

## 4. DOM and runtime state are still too interleaved
Several modules are still not really “logic modules”; they are logic-plus-DOM modules. This makes them harder to test, harder to reuse, and more fragile during future UI changes.

## 5. Performance work is partially done, but hotspot allocation remains
The big connection-path improvement is real. The remaining performance issues are now more localized:

- repeated dispose-and-recreate paths for overlays and labels
- repeated full rebuilds of dynamic UI fragments
- repeated temporary allocation inside geometry-heavy overlay code
- repeated `new FormData(form)` and repeated document lookups in orchestration code

---

# File-by-file audit

## Root files

### `.gitattributes`
**Status:** acceptable.  
**What is fine**
- simple LF normalization only

**Improve**
- no urgent change needed

### `.gitignore`
**Status:** too minimal for a browser-heavy visualization repo.  
**Issues**
- export artifacts are not ignored even though the app has PNG/PDF export flows
- common local caches and test artifacts are not covered beyond generic build folders
- no ignore rule exists for temporary downloaded audit/output files that are likely to appear during local review

**Improve**
- add ignores for local export outputs, screenshots, generated PDFs/PNGs, and any review scratch files
- keep the file aligned with the actual developer workflow rather than a generic starter ignore list

### `README.md`
**Status:** improved, but still too light for the current architecture.  
**What is good**
- the normalized star contract is now documented
- startup flow is short and readable
- data/reference distinctions are partly documented

**Issues**
- it still does not explain the split of responsibilities between `script.js`, `script/filterPipeline.js`, `script/constellationManager.js`, `script/planeManager.js`, `filters/index.js`, and `ui/filterUI.js`
- it does not describe the edit/export subsystems at all even though they are substantial runtime features
- it says shared rendering helpers live in `utils/renderUtils.js`, but there are also critical shared helpers in `shared/*`; the architecture description is incomplete
- it does not state that some rendering/filter modules still consume legacy raw fields for compatibility

**Improve**
- add a “runtime architecture” section
- document the actual canonical data contract and explicitly call out remaining compatibility reads
- document where filter state, scene state, and edit state live

### `HIGH_RISK_REFACTOR_NOTES.md`
**Status:** useful, but now partially transitional.  
**What is good**
- it records real completed refactor work
- it correctly notes the removal of earlier hidden global dependencies

**Issues**
- it is written as a point-in-time follow-up memo and can drift quickly
- after this audit is updated, some wording about “the current audit” becomes stale unless kept synchronized

**Improve**
- either keep this as a dated changelog note or fold the same information into the audit and shorten this file

### `index.html`
**Status:** functional, but still structurally inconsistent.  
**Issues**
- the filter UI is still split between large static HTML and dynamically generated sections; that hybrid model increases drift risk
- defaults and ranges are encoded in markup while related logic also exists in JS helpers and constants
- the visible title still says **Starmap Visualization** instead of matching the project name **Astrography**
- external CDN imports do not use integrity metadata
- accessibility is only partial: there are labels and legends, but the dynamic sidebar model is not documented with a coherent accessibility strategy
- the document is large enough that future filter additions are likely to reintroduce ID drift and duplicated markup rules

**Improve**
- choose one UI ownership model: schema-driven generation or mostly static declarative markup
- align branding/title with repository naming
- add SRI where possible for CDN assets
- audit control naming and ARIA behavior systematically, not piecemeal

### `styles.css`
**Status:** valid and usable, but still monolithic.  
**Issues**
- one file still owns layout, theme, controls, map containers, overlay handles, export UI, tooltip styling, fullscreen behavior, and responsive tweaks
- colors and spacing are repeated many times instead of being centralized as CSS custom properties
- breakpoint/layout sizing still assumes a narrow range of page shapes
- state styles are largely class-name based and imperative rather than driven by a clearer component structure

**Improve**
- split into base/layout/sidebar/maps/editor/export modules
- promote repeated values into CSS variables
- tighten naming so styles map more clearly to runtime UI components

### `tooltips.js`
**Status:** solid utility with clear remaining coupling.  
**What is good**
- formatting and position logic are straightforward
- URL sanitization exists

**Issues**
- star-field formatting is tightly coupled to the current raw/normalized mixed schema
- DOM construction and data formatting live in the same module
- the module still hardcodes tooltip row IDs and assumes a single global tooltip element

**Improve**
- split pure tooltip view-model construction from DOM rendering
- use normalized/shared schema helpers where possible
- make the element a passed dependency rather than a global lookup target

### `utils.js`
**Status:** partly redundant.  
**Issues**
- it still overlaps conceptually with `shared/colorUtils.js`
- it mixes color conversion, constellation palette generation, RA normalization, and canvas sizing in one bucket
- `resizeCanvas()` still assumes `parentElement` exists
- this file weakens the shared-layer cleanup because developers now have two plausible places to put generic helpers

**Improve**
- remove color/helper overlap with `shared/colorUtils.js`
- either narrow the file to a very small purpose or split it by concern
- null-guard `parentElement`

### `script.js`
**Status:** still the core architectural bottleneck.  
**What is improved**
- some responsibilities were extracted into submodules
- render scheduling now has a shared path
- hidden global scene coupling is reduced compared with older versions

**Remaining issues**
- the file is now materially smaller and cleaner, but it still remains the top-level orchestration hub
- the old `Object.defineProperties` compatibility facade is gone; state now lives in `script/appState.js` as a plain tree
- `MapManager` and map rendering helpers now live in `script/mapManager.js`
- startup and feature-manager wiring now live in `script/bootstrapManager.js`
- the remaining burden in this file is orchestration and cross-module coordination rather than raw implementation bulk
- several wrapper helpers still exist and can be reduced further once downstream modules consume the shared contracts more directly

**Improve**
- continue trimming wrapper helpers that only forward to shared helpers
- reduce DOM/event wiring further by pushing more setup concerns into dedicated bootstrap modules
- keep `script.js` as a thin composition root rather than letting behavior drift back into it

---

## App layer

### `app/presets.js`
**Status:** useful and materially better than an ad hoc persistence file, but still under-validated.  
**What is good**
- schema versioning exists
- `localStorage` operations are wrapped in `try/catch`
- form state and edit state are both persisted coherently

**Issues**
- there is still no migration path, only accept/reject logic
- DOM lookup of the remember checkbox and form is still internal to the module
- `deserializeMap()` and `deserializeSet()` trust payload structure too much
- persistence failures are logged only to console and not surfaced to the user

**Improve**
- inject the form and remember checkbox from callers
- validate payload shapes before applying them
- add a lightweight migration layer for future schema changes

### `app/starData.js`
**Status:** important improvement layer, but error semantics are still weak.  
**What is good**
- normalization of `distance`, `apparentMagnitude`, `absoluteMagnitude`, and `starId` is the right move
- manifest-driven loading is cleaner than a hardcoded bucket list

**Issues**
- load failure still collapses to `[]`, which makes “no data” indistinguishable from “data failed to load”
- one missing bucket silently becomes `[]` and the app continues with partial data without surfacing that fact
- `buildStableStarId()` still falls back to human-readable fields plus coordinates, which is only semi-stable
- there is no session-level memoization of already-loaded data

**Improve**
- return `{ stars, warnings, errors }` or throw typed errors upward
- memoize successful loads for the current session
- make the canonical star schema stronger and migrate consumers fully to it

### `app/stellarClassState.js`
**Status:** tiny convenience wrapper, but too DOM-specific to justify its own module in current form.  
**Issues**
- it hardcodes `document.getElementById('stellar-class-container')`
- the abstraction value is low because the module is basically two one-liners around shared helpers

**Improve**
- either inline this at the call site or convert it to functions that accept the container element explicitly

---

## Shared layer

### `shared/constants.js`
**Status:** strong addition, but not fully adopted.  
**What is good**
- central render/domain constants now exist
- the file already removes a lot of magic-number pressure from the rest of the tree

**Issues**
- adoption is incomplete: many modules still hardcode `100`, `180`, `200`, line widths, or projection defaults instead of importing these constants
- the file mixes domain constants, UI constants, parser constants, and render constants in one place
- `STELLAR_CLASSES` excludes `'Other'`, but other parts of the UI/state logic still explicitly use `'Other'`

**Improve**
- continue migrating remaining hardcoded values into the shared layer
- split by concern later: `render`, `ui`, `domain`, `data-contract`
- define a first-class constant for the “other/unclassified” bucket if the UI will keep using it

### `shared/colorUtils.js`
**Status:** good module with a slight responsibility mismatch.  
**What is good**
- interpolation and color conversion helpers are sensible and reusable

**Issues**
- cloud-file naming logic sits next to general color math, which is not the same concern
- overlap with `utils.js` still exists conceptually
- if `CLOUD_FILE_REGEX` is a shared constant, all cloud-file parsing should use it consistently

**Improve**
- deduplicate utility ownership with `utils.js`
- consider moving cloud-name parsing out of color utilities

### `shared/formUtils.js`
**Status:** useful foundation.  
**Issues**
- warnings are console-based only, so callers cannot respond programmatically
- `restoreFormState()` is permissive, which is acceptable for trusted local state but weak for imported/edited payloads

**Improve**
- allow optional validation hooks or schema maps
- return structured warnings/errors instead of only logging

### `shared/renderScheduler.js`
**Status:** simple and good.  
**Issues**
- single global callback storage is acceptable here, but it still limits future multi-root rendering or more formal scheduler ownership

**Improve**
- no urgent change needed for current app scale
- document intended lifecycle and single-owner assumption

### `shared/starUtils.js`
**Status:** important shared module, not yet authoritative enough across the codebase.  
**What is good**
- it centralizes coordinate derivation and projection helper behavior
- normalized distance access exists

**Issues**
- `getStarId()` still falls back to mutable/human-readable identifiers after `starId`
- `precalcMollweideData()` still embeds `1e-10` instead of using `EPSILON`
- some consumers still bypass this module and read raw star fields manually

**Improve**
- make this the single source of truth for star coordinates, IDs, and normalized field access
- import `EPSILON`
- migrate remaining raw-field consumers onto these helpers

### `shared/stellarClassUtils.js`
**Status:** good direction.  
**What is good**
- central parsing of primary class is now in place

**Issues**
- the repository still has multiple places where class lists or fallbacks are defined separately
- the relationship between `STELLAR_CLASSES` and the UI’s `'Other'` bucket is still implicit rather than formalized

**Improve**
- align all stellar-class lists and fallback categories with this module and `shared/constants.js`

### `shared/uiFactory.js`
**Status:** genuinely useful, but still not the sole UI-construction path.  
**What is good**
- fieldset, checkbox, range-control, and sync helpers reduce a lot of duplication

**Issues**
- `syncSliderPair()` still depends on global DOM IDs rather than concrete element references
- not all UI creation goes through this factory yet, so the UI layer remains fragmented
- some helpers are generic UI factory primitives, others are Astrography-specific shaping helpers

**Improve**
- pass elements rather than IDs where feasible
- keep pushing remaining bespoke dynamic controls toward this layer

---

## Filters

### `filters/filterDefaults.js`
**Status:** serviceable schema-like defaults, but still tied to mixed units.  
**Issues**
- opacity-related defaults are still expressed in UI percent scale
- the object behaves like application schema but is not treated/documented as such

**Improve**
- normalize opacity at the form boundary
- document this file as the default filter-state contract

### `filters/filterFormState.js`
**Status:** central and important, but still inconsistent with the shared layer.  
**Issues**
- it still redefines `STELLAR_CLASSES` locally instead of importing the shared list
- it still returns percent-like values in 0–100 scale, leaving the pipeline to normalize later
- it mixes parsing, fallback policy, and domain choices in a single function
- cloud visibility is inferred from selected files rather than from an explicit enable flag; that is acceptable, but it should be treated as intentional behavior

**Improve**
- import class constants from `shared/constants.js`
- normalize percentages here and keep internal state numeric conventions consistent
- consider exposing a typed filter-state object contract

### `filters/filterOverlayState.js`
**Status:** improved meaningfully.  
**What is good**
- scenes are passed in explicitly now
- overlay add/remove logic is centralized and clearer than the older global-coupled version

**Issues**
- overlay ownership still lives in module-level singletons rather than application state
- `needsRebuild()` only keys on min distance, max distance, and grid size; overlay behavior can silently become stale if new structural overlay inputs are introduced later
- the module is still stateful and therefore harder to test in isolation

**Improve**
- move overlay instances into application state
- make rebuild keys explicit and future-proof

### `filters/filterUISetup.js`
**Status:** materially improved, still doing too much.  
**What is good**
- shared UI helpers have removed a large amount of repeated boilerplate

**Issues**
- the module still combines DOM lookup, data preload, legend behavior, and fieldset generation
- it still owns side effects and runtime initialization ordering
- the naming relationship between this file and the filter entry file is still a little confusing because UI concerns are re-exported through `filters/index.js`

**Improve**
- separate preload/setup concerns from DOM construction
- inject the target form rather than resolving it globally

### `filters/index.js`
**Status:** improved, but still not cleanly pure.  
**What is good**
- the earlier duplicate constellation scene mutation path is gone
- the filter application sequence is readable

**Issues**
- the module still caches the filter form by DOM ID globally
- UI setup/generation is still re-exported from the filter entry module, which keeps filter logic and filter UI tangled conceptually
- overlay updates and globe-surface side effects still happen inside what should ideally become a purer filter composition layer

**Improve**
- keep this module focused on filter computation and explicit side-effect boundaries
- stop letting the filter entry point be both logic API and UI wiring API

### `filters/colorFilter.js`
**Status:** improved and mostly consistent now.  
**What is good**
- it now uses `getPrimaryClass()`
- it uses shared constants for default color and epsilon

**Remaining issues**
- galactic-plane mode still hardcodes `'#ffffff'` instead of using `DEFAULT_STAR_COLOR`
- it mutates stars in place, which is fine for performance here, but it should be an intentional documented convention across all filters

**Improve**
- use the shared default color in all branches
- document in-place mutation as the expected filter contract

### `filters/distanceFilter.js`
**Status:** good.  
**What is good**
- small, clear, and already based on normalized `distance`

**Improve**
- use this file as the consistency target for other distance-consuming modules

### `filters/opacityFilter.js`
**Status:** acceptable, but still preserving mixed-unit debt.  
**Issues**
- the “if value > 1 assume percent” logic is pragmatic but it also cements internal inconsistency
- fixed opacity and magnitude-derived opacity still come from different assumptions about units

**Improve**
- remove mixed-scale fallback once `filterFormState` normalizes values

### `filters/sizeFilter.js`
**Status:** still inconsistent with normalized data usage.  
**Issues**
- size-by-distance still uses `Distance_from_the_Sun`
- `Math.min(...stars.map(...))` and `Math.max(...stars.map(...))` assume the raw field exists and is numeric everywhere
- this diverges from the normalized contract already established in `app/starData.js`

**Improve**
- switch completely to `star.distance`
- harden against missing/invalid values without falling back to legacy raw fields in scattered places

### `filters/starsShownFilter.js`
**Status:** good.  
**What is good**
- it uses normalized `apparentMagnitude`
- the file is small and consistent

### `filters/globeSurfaceFilter.js`
**Status:** tiny wrapper, acceptable.  
**Issues**
- could become unnecessary depending on where globe-surface state ultimately belongs

### `filters/stellarClassData.js`
**Status:** acceptable loader with weak validation.  
**Issues**
- error handling is console-only
- loaded JSON shape is not validated before being stored as shared runtime data

**Improve**
- validate the dictionary structure once at load time

### `filters/stellarClassFilter.js`
**Status:** much better than older versions, still heavy.  
**What is good**
- duplication was reduced
- grouping and UI creation are more structured

**Issues**
- the file still mixes filtering behavior with large dynamic UI generation responsibilities
- the entire stellar-class UI container is rebuilt, which is simple but potentially expensive and easy to disrupt transient UI state
- the module still reaches directly into the DOM
- large class groups can produce very large control trees without virtualization or lazy rendering

**Improve**
- separate class-filter logic from UI generation
- move toward incremental or memoized UI updates

### `filters/constellationFilter.js`
**Status:** feature-rich, but still uneven.  
**Issues**
- successful data loads still log to console during normal operation
- shared render constants are still not fully adopted
- label creation logic still duplicates canvas-text sprite creation patterns found elsewhere
- failed loads often degrade to empty collections, which keeps the app alive but can hide data regressions

**Improve**
- remove routine success logging
- centralize repeated label sprite generation
- surface load failures more explicitly

### `filters/constellationOverlayFilter.js`
**Status:** still one of the heaviest modules.  
**Issues**
- hardcoded radius/segment-style values remain local
- globe and Mollweide paths still duplicate some grouping/ordering work
- there is still a lot of temporary vector allocation in geometry-heavy code
- local palette/tolerance choices are embedded instead of shared
- there are still signs of uneven cleanup from earlier iterations, such as locally computed values that do not clearly justify their presence

**Improve**
- extract shared boundary ordering/grouping logic
- centralize render constants and palette choices
- reduce hot-path allocation where practical

### `filters/connectionsFilter.js`
**Status:** materially improved and one of the stronger performance-oriented modules now.  
**What is good**
- the general O(n²) path is gone for the main use case
- cached projected positions are a real improvement

**Remaining issues**
- rendering config still lives in mutable module-level variables
- geometry-heavy update paths still allocate noticeably
- some constants still live locally instead of in shared configuration

**Improve**
- pass explicit config into line-building/update logic
- continue trimming allocation in hot render/update paths

### `filters/cloudsFilter.js`
**Status:** workable, but still one of the more expensive and assumption-heavy overlays.  
**Issues**
- cloud-star neighbor computation is still quadratic inside cloud subsets
- the 100 LY cutoff is still hardcoded
- comments and behavior are not perfectly aligned in the neighbor-count logic
- projection constants are still hardcoded in some Mollweide calls
- error handling is still mostly `console.error` without broader runtime signaling

**Improve**
- replace hardcoded distance limits with named/shared policy
- align comments and behavior precisely
- revisit neighbor search strategy for larger cloud subsets

### `filters/cloudDensityFilter.js`
**Status:** useful specialized overlay, still quite imperative.  
**Issues**
- it still does a lot of canvas/texture work inline
- scene mutation responsibilities remain embedded in the overlay update path
- some projection/render constants are still local

**Improve**
- separate overlay data computation from scene attachment/update
- centralize remaining constants

### `filters/densityColorUtils.js`
**Status:** acceptable helper module.  
**Issues**
- color-hash policy is local and undocumented
- if stable palette semantics matter, this should be documented as contract rather than incidental behavior

### `filters/densityData.js`
**Status:** very small loader; acceptable.  
**Issues**
- error handling is console-only
- loaded structure is not validated

### `filters/densityFilter.js`
**Status:** still a large mixed-responsibility module.  
**Issues**
- the file still mixes data segmentation, canvas rendering, overlay object mutation, and DOM reads
- it still reads sliders directly from the DOM inside update logic
- it still uses `Distance_from_the_Sun` in the segmentation/update path
- it remains expensive because substantial work is redone when controls change

**Improve**
- split pure density computation from overlay rendering
- remove DOM reads from the core update path
- use normalized `distance`

### `filters/densitySegmentation.js`
**Status:** useful algorithmic helper, but still tightly tied to current overlay assumptions.  
**Issues**
- segmentation behavior should be documented more explicitly because it materially affects displayed analysis results

### `filters/dustCloudColors.js`
**Status:** acceptable static mapping.  
**Issues**
- if these colors are part of product identity, they should move into shared config/documentation rather than remain an isolated map

### `filters/dustCloudDataCache.js`
**Status:** improved.  
**What is good**
- bounded cache is a real improvement over the previous unbounded approach

**Remaining issues**
- cache policy is simple and undocumented; if cloud usage grows, explicit policy comments would help

### `filters/isolationFilter.js`
**Status:** still large and still one of the hardest files to reason about.  
**Issues**
- the file still combines grid building, geometry generation, labeling/segmentation concerns, DOM reads, and update behavior
- it still uses `Distance_from_the_Sun` in multiple places
- warning/error behavior is still mostly console-driven
- the mental model is difficult because data computation and scene-product construction are tightly interleaved

**Improve**
- split pure isolation-analysis logic from overlay/render output
- migrate fully to normalized distance access
- reduce DOM dependence and make configuration explicit

### `filters/planesFilter.js`
**Status:** featureful but still repetitive.  
**Issues**
- hardcoded `100`, `180`, `200`, widths, and colors still appear in multiple places
- text sprite/plane creation is still duplicated inline
- the mathematical basis is not documented, even briefly, despite being core visualization logic

**Improve**
- move remaining constants into shared config
- centralize text label generation helpers
- document the coordinate/projection assumptions in code comments

### `filters/ConcaveGeometry.js`
**Status:** isolated but inherently expensive.  
**Issues**
- brute-force tetrahedra generation remains expensive for larger point sets
- the file assumes small-enough input without stating acceptable bounds clearly

**Improve**
- document expected point-count limits explicitly
- add defensive guards if large input is ever possible

---

## Script submodules

### `script/filterPipeline.js`
**Status:** a useful extraction step, but still orchestration-heavy.  
**What is good**
- it removed a substantial amount of coordination code from `script.js`
- constellation and plane responsibilities are now delegated to dedicated managers

**Issues**
- it still reads the DOM directly for cloud and cloud-density selections
- it still converts many percent values to 0–1 on the fly, proving normalization is still unresolved upstream
- it captures and restores stellar-class UI state around a full rebuild, which is pragmatic but also a sign that the UI update path is too coarse-grained
- it still owns many side effects at once: filters, overlays, constellations, planes, map refreshes, cloud refreshes

**Improve**
- push DOM extraction higher up
- normalize values before this layer
- reduce full dynamic UI rebuild pressure

### `script/constellationManager.js`
**Status:** much cleaner ownership than before.  
**What is good**
- this is now the single place that owns constellation scene mutation
- cleanup helpers are straightforward

**Remaining issues**
- Mollweide refresh still recreates labels/overlay meshes rather than performing finer-grained updates
- object lifecycle is correct enough, but potentially expensive when users rotate frequently with overlays enabled

**Improve**
- explore incremental update paths for Mollweide-only changes where possible

### `script/planeManager.js`
**Status:** cleaner than earlier direct handling, still leaking constants.  
**Issues**
- config lambdas still embed `100` and `200`
- the manager still knows concrete constructor details for every plane type instead of relying on a more uniform descriptor/config contract

**Improve**
- import shared radius/size constants
- keep simplifying the plane descriptor model

### `script/starInteractions.js`
**Status:** usable, but still map-implementation-coupled.  
**Issues**
- it still depends on concrete map internals such as `starGroup.children`, `starObjects`, `camera`, and `canvas`
- hover/click picking logic is still quite close conceptually and could share more structure
- tooltip element lookup is still global/local rather than injected

**Improve**
- define a thinner interaction adapter surface for map implementations
- extract shared picking logic

---

## Rendering and utility modules

### `cameraControls.js`
**Status:** improved; the most important global-coupling issue is fixed.  
**What is good**
- render invalidation now goes through `shared/renderScheduler.js`
- the control classes are readable and self-contained

**Remaining issues**
- pointerdown behavior does not appear to distinguish mouse buttons explicitly
- event listener lifecycle is manual and repetitive; `AbortController` could simplify teardown
- the file still assumes direct DOM ownership rather than receiving a more formal host interface

**Improve**
- add explicit input-policy checks
- consider modernized listener registration/cleanup patterns

### `labelManager.js`
**Status:** feature-rich, but still expensive and conceptually dense.  
**Issues**
- label generation still does a lot of canvas texture work
- multiple projection behaviors are still intertwined in one manager
- it still creates many temporary vectors during refresh/update paths
- object identity and cache-key identity are both used, which works but increases cognitive load

**Improve**
- split projection-specific placement into smaller helpers
- expand texture memoization where safe
- clarify caching strategy in comments

### `utils/geometryUtils.js`
**Status:** important core math module with remaining adoption gaps.  
**Issues**
- many default values are still hardcoded in signatures and internal calls
- cache maps are still unbounded
- the file owns projection math, caching, wrap splitting, and coordinate helpers all together

**Improve**
- centralize more defaults via shared constants
- consider bounded caches if very long sessions matter
- document cache assumptions and invalidation strategy

### `utils/renderUtils.js`
**Status:** one of the cleaner modules in the tree.  
**Issues**
- `disposeMaterial()` is intentionally broad and should be documented carefully because it walks object values generically

**Improve**
- keep as is, but document disposal assumptions more clearly

---

## Data and reference assets (format review only)

### `stellar_class.json`
**Format:** mapping of class letter to `{ color, size, hierarchy }`.  
**Assessment:** good runtime format.  
**Improve**
- validate on load in `filters/stellarClassData.js`

### `constellation_center.json`
**Format:** array of center records with name and coordinates.  
**Assessment:** good runtime format.

### `constellation_boundaries.json`
**Format:** structured constellation boundary geometry data.  
**Assessment:** usable runtime format; load failure should be surfaced more clearly because downstream visual features depend on it.

### `constellation_full_names.json`
**Format:** abbreviation/full-name mapping.  
**Assessment:** good.

### `constellation_center.txt`
**Format:** raw/reference text source.  
**Assessment:** acceptable.  
**Improve**
- document whether it is authoritative input or archival source material only

### `constellation_boundaries.txt`
**Format:** raw/reference text source.  
**Assessment:** acceptable.  
**Improve**
- document generation/authority path in `README.md`

### `data/manifest.json`
**Format:** manifest object with version-ish metadata and file list.  
**Assessment:** good structure.  
**Improve**
- validate version/files explicitly in `app/starData.js`

### `data/stars_0_20_LY.json` through `data/stars_90_100_LY.json`
**Format:** arrays of star records with raw catalog-style fields.  
**Assessment:** format is consistent enough for current use.  
**Improve**
- either normalize offline or finish the runtime normalization migration so the rest of the code stops reading legacy raw fields directly

### `data/*cloud*.json`
**Format:** arrays of cloud-observation rows with star names/IDs, coordinates, cloud labels, and related values.  
**Assessment:** usable and broadly consistent.  
**Improve**
- add normalization for cloud-name/star-name matching at load time rather than repeatedly inside overlay code

---

# Highest-priority work next

## Priority 1 — finish the internal consistency work
1. Normalize opacity values to 0–1 in `filters/filterFormState.js` and keep them normalized thereafter.
2. Finish the normalized star-schema migration:
   - replace remaining `Distance_from_the_Sun` reads with `distance`
   - keep class parsing centralized through shared helpers
3. Replace the `Object.defineProperties` compatibility state facade in `script.js` with a real state tree.

## Priority 2 — reduce orchestration complexity
4. Extract export logic from `script.js`.
5. Extract label/line editing logic from `script.js`.
6. Push DOM reads out of `script/filterPipeline.js`, `filters/densityFilter.js`, `filters/isolationFilter.js`, and related modules.

## Priority 3 — finish constant and helper consolidation
7. Continue migrating remaining hardcoded render constants into `shared/constants.js`.
8. Deduplicate `utils.js` vs `shared/colorUtils.js` responsibilities.
9. Centralize repeated text-sprite/text-plane creation helpers.

## Priority 4 — performance cleanup after architecture cleanup
10. Reduce full rebuilds of dynamic stellar-class UI.
11. Reduce hot-path allocation in heavy overlay modules.
12. Revisit quadratic neighbor work in cloud overlays.

---

# Bottom-line verdict

This project is **meaningfully better structured than the older audit baseline**, and several important high-risk issues have already been fixed. The codebase is no longer suffering primarily from missing helper modules or obvious broken coupling. The real remaining problem is **incomplete convergence**:

- the shared abstractions exist,
- but not every module follows them yet,
- and `script.js` still carries too much orchestration burden.

The next refactor pass should therefore be disciplined rather than broad:

- finish the data/opacity conventions,
- shrink `script.js`,
- remove remaining DOM reads from lower layers,
- then optimize hotspot modules.

That sequence will improve professionalism, efficiency, and consistency much more than another round of isolated helper extraction.
