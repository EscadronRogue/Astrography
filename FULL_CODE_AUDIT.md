# Astrography Full Current Code Audit

Date: 2026-06-23

Status note: this document is the original issue inventory. The current open/closed status is tracked in `AUDIT_STATUS.md`.

## Scope and verification baseline

- Static verifier: `npm.cmd test` passes. The verifier covers syntax, import hygiene, renderer sizing, export helpers, SVG label helpers, disposal rules, storage safety, color parsing, edit lifecycle, UV signatures, overlay instancing, and several behavior invariants.
- Browser visual smoke test: not completed. The local server started, but the in-app browser was blocked from `http://127.0.0.1:8124/` by enterprise/network policy. This means canvas nonblank checks, real pointer interaction checks, export-download checks, and browser-specific layout checks still need to run outside this restricted browser context.
- This report focuses on issues still present in the current code, including gaps not covered by the verifier.

## Executive summary

The project is in much better shape than a raw prototype: modules exist, core validation is present, there is a broad static verifier, render disposal is partially centralized, and most features have been split into feature folders. The remaining risk is concentrated in five areas:

1. Some filter state is computed but never consumed by renderers, so controls can silently do the wrong thing.
2. Raster, SVG, UV, PDF, and STL exports are not driven by one shared scene model, so fidelity differs by format.
3. Density/isolation/cloud overlays can create enormous grids and sorted distance caches with no hard budget.
4. App orchestration still mixes DOM access, filter logic, scene mutation, export wiring, and global state.
5. Cross-browser/mobile/export confidence is based on static rules rather than automated browser and visual tests.

## Critical and high-priority issues

### 1. Per-star opacity filter is effectively broken

Evidence:

- `src/features/filters/logic/opacityFilter.js:18`, `:42`, and `:52` write `star.displayOpacity`.
- No renderer reads `displayOpacity`.
- `src/app/mapManager.js:39-71` has a star shader with only a global `opacity` uniform.
- `src/app/mapManager.js:582-591` only applies global star opacity.
- `src/app/uvMapManager.js:200-201` and `:428` only apply global star opacity.
- `index.html:210` uses `value="75"` for the 75 percent opacity radio, but `opacityFilter.js:14-18` clamps numeric values to `0..1`, so `75` becomes `1`.

Impact:

- Fixed 75 percent opacity renders as 100 percent.
- Absolute-magnitude opacity computes values but does not affect 3D, globe, Mollweide, UV, PNG, PDF, or SVG output.

Fix method:

- Normalize fixed opacity values as `0.75`, or parse numbers greater than `1` as percentages.
- Add per-star opacity to render data:
  - Mollweide `Points`: add a `customOpacity` buffer attribute and multiply `texColor.a * opacity * vOpacity` in the fragment shader.
  - True coordinates and globe `InstancedMesh`: either use a shader with an instanced opacity attribute or batch stars by opacity bands if shader work is deferred.
  - UV/canvas rendering: use `clamp01((star.displayOpacity ?? 1) * this.starOpacity)`.
  - SVG export: multiply `starOpacity` by `star.displayOpacity`.
- Add verifier/browser tests that fail if `displayOpacity` is not consumed by render/export code.

### 2. Size-by-distance uses Sol distance even after viewpoint changes

Evidence:

- `src/features/filters/logic/distanceFilter.js:19` correctly filters by `star.viewpointDistance ?? star.distance`.
- `src/features/filters/logic/sizeFilter.js:42` and `:58` use `star.distance`.
- `src/features/filters/logic/starDisplayStats.js:20` uses `star.distance`.

Impact:

- After changing viewpoint, distance filtering and distance labels can reflect the viewpoint, while size-by-distance still reflects distance from Sol. This creates inconsistent visual meaning.

Fix method:

- Add a shared helper such as `getDisplayDistance(star)`.
- Use it in `distanceFilter`, `sizeFilter`, `starDisplayStats`, labels, and any distance-dependent export sizing.
- Add a behavior test with synthetic stars where `distance` and `viewpointDistance` differ.

### 3. Distance min/max controls can produce an empty map

Evidence:

- `index.html:75-83` exposes independent min/max distance controls.
- `src/ui/sidebar/buildSidebar.js:340-341` only syncs slider/number pairs.
- `src/features/filters/logic/distanceFilter.js:16-20` rejects all stars if `minDistance > maxDistance`.

Impact:

- Users can accidentally invert the range and make all maps appear broken.

Fix method:

- Normalize distance ranges in one place, preferably `readFilterState()` or a dedicated `normalizeDistanceRange()` helper.
- Either swap min/max, clamp the active handle, or show a clear invalid-state message.
- Add a verifier case for inverted distance input.

### 4. Density and isolation grids can explode in time and memory

Evidence:

- `src/features/filters/state/filterStateReader.js:26-31` returns `2 / (abs(value) + 1)` for negative grid sliders.
- With slider value `-10`, grid size becomes about `0.18 ly`.
- `src/features/density/densityOverlay.js:64`, `src/features/isolation/isolationOverlay.js:61`, and `src/features/clouds/cloudDensityOverlay.js:99` create 3D grids with triple nested loops.
- `src/shared/cellDistanceCache.js:8-35` stores a sorted distance array to every star for every cell.

Impact:

- With the current 100 ly dataset and 9507 stars, a small grid size can produce extreme cell counts and then sort thousands of distances per cell. This can freeze the UI or exhaust memory.

Fix method:

- Add a hard cell budget before grid construction, for example 50k to 100k cells.
- Compute the minimum allowed grid size from the active volume and max cell budget.
- Use a spatial index for nearest-star and radius queries instead of sorting all distances per cell.
- Move expensive overlay builds into a worker with cancellation.
- Show a UI estimate and disable/apply-clamp controls when a setting would exceed budget.

### 5. UV density opacity is applied twice

Evidence:

- `src/features/density/densityOverlay.js:277` stores `densityOpacity`.
- `src/features/density/densityOverlay.js:322` multiplies material alpha by that opacity.
- `src/app/uvMapManager.js:567-595` reads `densityOpacity` again and passes it as `opacityFactor` to UV overlay alpha helpers.

Impact:

- UV atlas, globe texture, PNG, and PDF can show density overlays dimmer than the 3D map. For example, 50 percent opacity becomes effectively 25 percent.

Fix method:

- Decide whether overlay mesh/material opacity is already final.
- If material opacity is final, remove the extra UV `opacityFactor` multiplication.
- Add an export fidelity test for a known overlay opacity.

### 6. UV cloud-density radius and opacity are not faithful to the source overlay

Evidence:

- `src/features/clouds/cloudDensityOverlay.js:324` stores `overlay.opacityFactor`.
- `src/app/uvMapManager.js:674` applies `cloudDensityOpacity` again.
- `src/app/uvMapManager.js:678` uses `const radius = Math.max(6, 18);`, which is always `18`.

Impact:

- Cloud-density UV output can differ from the interactive map. Opacity is multiplied twice, and radius changes may not map to exported UV appearance.

Fix method:

- Use the overlay material alpha directly or pass raw alpha into a single shared alpha function.
- Replace the fixed radius with a shared radius calculation that includes `cloudDensityRadius`.
- Add tests proving radius and opacity changes affect UV output predictably.

### 7. Async UV map updates can race

Evidence:

- `src/app/uvMapManager.js:288-292` has an async `updateMap()` that awaits boundary and constellation metadata loading.
- Callers in the filter pipeline invoke UV updates without awaiting them.

Impact:

- An older filter/update request can finish after a newer one and redraw a stale UV atlas.

Fix method:

- Add a monotonic update token to `UVMapManager.updateMap()`.
- After every `await`, return early if the token is stale.
- Optionally preload boundary/meta data before first filter application.
- Add a test with delayed metadata promises and rapid filter changes.

### 8. SVG export is not full-fidelity

Evidence:

- `src/features/export/exportManager.js:265-319` exports only a background, connections, stars, star labels, and a fixed border.
- It does not serialize visible density, isolation, cloud-density, cloud outlines, galactic plane, constellation boundaries, constellation names, edited overlay layers, or all style controls.

Impact:

- PNG/PDF can include what the WebGL/canvas scene renders, while SVG omits many visible layers. Users expecting SVG to match the screen get a partial map.

Fix method:

- Either label SVG as a simplified vector export in the UI, or implement complete layer export.
- Create a shared `ExportSceneModel` that lists visible layers, style values, projection positions, labels, and opacity for all export formats.
- Add a feature-format matrix test: screen, PNG, PDF, SVG, UV texture, STL.

### 9. PNG/PDF export mutates live Mollweide scene state

Evidence:

- `src/features/export/exportManager.js:98` scales Mollweide scene elements for export.
- `src/features/export/exportManager.js:186` applies scaling during raster/PDF export and restores in `finally`.

Impact:

- The `finally` block is good, but the export still depends on mutating the live scene. Parallel exports, interrupted exports, or future async rendering changes can leave visible state inconsistent.

Fix method:

- Render from a cloned scene or an export-only scene adapter.
- If cloning is too expensive, guard exports with a lock and keep all mutations in a small reversible transaction object.
- Add tests for failed export restore and duplicate click/parallel export.

### 10. STL scale documentation conflicts with runtime constants

Evidence:

- `src/features/export/stlExporter.js:11` documents standard star diameter as 8 mm.
- `src/features/export/stlScale.js:4-6` defines standard star diameter as 16 mm and tube diameter as 4 mm.
- `src/features/export/stlKitExporter.js:13-14` documents 16 mm and 4 mm.

Impact:

- Simple STL export comments and current constants disagree. This can confuse print setup and validation.

Fix method:

- Correct `stlExporter.js` comments.
- State clearly whether simple STL is visual-only and STL kit is printable/socketed.
- Add a mesh metadata test that exported comments/logs match constants.

### 11. STL geometry fidelity is not automatically validated

Evidence:

- `src/features/export/stlExporter.js` and `src/features/export/stlKitExporter.js` generate binary meshes and ZIP content.
- The verifier covers many helper invariants, but there is no slicer-style validation for manifoldness, nonzero normals, scale, or expected part counts from a real exported file.

Impact:

- Regressions in printable kit geometry can pass static tests but fail in slicers or after printing.

Fix method:

- Add a headless STL validation script that parses generated binary STL.
- Check triangle count, bounding box scale, finite normals, nonzero area triangles, part count, and socket/tube naming.
- Keep one tiny fixture export for CI and one larger manual print smoke test.

## Performance issues

### 12. Per-star class controls can create a very large DOM

Evidence:

- `src/features/filters/logic/stellarClassFilter.js:107-170` and `:180-236` create individual star rows and checkboxes.
- The full manifest contains 9507 stars.

Impact:

- Expanding all class sections can create thousands of checkboxes and labels, which hurts mobile performance and sidebar usability.

Fix method:

- Virtualize or lazy-render only the expanded class.
- Add class-level bulk controls first, then reveal per-star overrides on demand.
- Persist overrides in a map separate from DOM state.

### 13. K-nearest connection mode is still O(n^2)

Evidence:

- `src/features/connections/connectionPairs.js:172-181` computes distances to every other system and sorts neighbors.

Impact:

- Current data size may be acceptable, but 9507 stars makes this expensive if enabled broadly or recalculated often.

Fix method:

- Use a k-d tree, octree, or grid spatial index.
- Cache positions/signatures by viewpoint and active star set.
- Add a performance budget test for 1k, 5k, and full data.

### 14. Mollweide panning can still be expensive

Evidence:

- Existing `PERFORMANCE_AUDIT.md` identifies remaining work around avoiding geometry rebuild during Mollweide pan.
- `src/app/mapManager.js:123-134` changes Mollweide central longitude and refreshes overlays during controls.

Impact:

- Desktop may tolerate it, but phone browsers can stutter when panning with overlays enabled.

Fix method:

- Update shader/projection uniforms or position buffers only where necessary.
- Debounce expensive overlay refresh during drag and do final high-quality refresh on pointer up.
- Add browser frame-timing checks for pan/zoom with overlays enabled.

### 15. Overlay distance caches store too much data

Evidence:

- `src/shared/cellDistanceCache.js:13-33` stores and sorts all star distances per cell.

Impact:

- Memory scales as `cells * stars`, which becomes unsustainable before the UI warns the user.

Fix method:

- Store only nearest distance for isolation and radius-limited counts for density.
- Use bounded heaps or spatial queries instead of full sorted arrays.
- Make tolerance handling explicit without keeping all distances when tolerance is small.

## Architecture and maintainability issues

### 16. `MapManager` still has too many responsibilities

Evidence:

- `src/app/mapManager.js` is 679 lines.
- It owns renderer creation, projection-specific geometry, camera controls, connection labels, Mollweide wrapping, border styling, edit hooks, label refresh, resizing, disposal, and render loops.

Impact:

- Small changes risk unrelated rendering modes. Tests and review become harder because projection behavior is mixed into one class.

Fix method:

- Split into `BaseMapRenderer`, `TrueCoordinatesRenderer`, `GlobeRenderer`, and `MollweideRenderer`.
- Move star-layer rendering, connection-layer rendering, labels, controls, and export adapters behind narrow interfaces.
- Keep `MapManager` as composition/orchestration only if the public API must remain stable.

### 17. `UVMapManager` combines atlas rendering, data loading, feature drawing, and interaction geometry

Evidence:

- `src/app/uvMapManager.js` is 815 lines.
- It loads boundaries/meta, computes signatures, draws stars/connections/overlays/labels, updates 3D UV globe geometry, and manages filter options.

Impact:

- Export fidelity bugs are likely because one file reinterprets many feature layers independently.

Fix method:

- Split into `UvAtlasRenderer`, `UvLayerProjector`, `UvOverlayPainter`, and `UvGlobeSurface`.
- Reuse feature-layer state from the interactive scene rather than recomputing hidden assumptions.
- Keep layer signatures close to the layer renderers.

### 18. STL kit exporter remains too large

Evidence:

- `src/features/export/stlKitExporter.js` is 926 lines.
- It still combines CSG setup, printable part planning, tube labels, ZIP packaging, yielding, and worker fallback behavior.

Impact:

- Printable geometry is high risk, but the file is still large enough that changes are hard to review.

Fix method:

- Split into `stlKitPlan`, `stlKitGeometry`, `stlKitLabels`, `stlKitPackage`, and `stlKitWorkerAdapter`.
- Keep pure planning functions testable without Three/CSG.
- Keep browser-yield and ZIP concerns out of geometry generation.

### 19. Filter pipeline mixes pure state, DOM, scenes, and async effects

Evidence:

- `src/features/filters/pipeline/filterPipeline.js:47-48`, `:150`, `:239`, and `:289-290` call `document.getElementById()`.
- The same pipeline mutates map scenes and overlay objects.
- `src/features/filters/state/filterOverlayState.js:9-10` keeps overlay instances in module globals.

Impact:

- The pipeline is hard to test in isolation and brittle if the app ever supports multiple instances.

Fix method:

- Make `readFilterState()` and filter application pure.
- Move all DOM querying into `src/ui`.
- Make overlay instances part of an app-scoped context object, not module globals.
- Return a render/update command object from filter logic, then apply it in a scene adapter.

### 20. `createApp.js` is an orchestration hotspot

Evidence:

- `src/app/createApp.js:37-39` defines map globals.
- The file also wires progress, forms, map construction, star interactions, viewpoint banner, exports, STL kit, presets, and error handling.

Impact:

- App startup is hard to reason about and changes can create hidden ordering bugs.

Fix method:

- Extract `createMaps()`, `createExportBindings()`, `createViewpointBindings()`, `createFilterBindings()`, and `createInteractionBindings()`.
- Replace mutable module globals with an explicit `AppRuntime` object.

### 21. Data validation does not require true cartesian coordinates

Evidence:

- `src/data/dataValidation.js:41-54` validates distance, RA, DEC, and identity.
- `src/data/loaders/loadStarData.js:24-36` normalizes `x_coordinate`, `y_coordinate`, and `z_coordinate`.
- `src/shared/starUtils.js:48-61`, `src/app/mapManager.js:246`, and several label/export paths rely on cartesian coordinates or fallback behavior.

Impact:

- A malformed record with finite RA/DEC but missing cartesian coordinates can enter the app and render at fallback/generated positions in some views while other views expect true coordinates.

Fix method:

- Decide whether x/y/z are required source data or derived data.
- If required, validate finite x/y/z.
- If derived, compute them centrally during normalization and never leave them undefined.
- Add data-loader tests for malformed and derived-coordinate records.

## Consistency and redundancy issues

### 22. CSS is layered through overrides rather than a single design system

Evidence:

- `index.html:10-16` loads `base.css`, `sidebar.css`, `layout.css`, `panels.css`, `overlays.css`, `responsive.css`, and `theme.css`.
- `styles/theme.css:643-649`, `:714`, and `:801-821` use `!important`.
- `index.html:538-546` contains inline styles for the viewpoint banner that are later overridden by `theme.css`.

Impact:

- Styling is harder to maintain and more likely to regress on mobile or future UI changes.

Fix method:

- Move inline styles into component CSS.
- Establish design tokens in one file and component styles in focused files.
- Remove `!important` by fixing selector ownership and load order.

### 23. Browser compatibility depends on modern CSS without fallbacks

Evidence:

- `styles/theme.css` uses `color-mix(in oklab, ...)` in many places.
- `styles/base.css:120`, `styles/theme.css:154`, and `styles/overlays.css:43-47` use `100vh` patterns.

Impact:

- Older browsers, embedded WebViews, or enterprise browsers can lose color styling or suffer mobile viewport height bugs.

Fix method:

- Add fallback colors before `color-mix()` declarations.
- Use `100dvh` with `100svh`/`100vh` fallback where full-height mobile layouts matter.
- Add browser visual tests for Chromium, Firefox, and WebKit.

### 24. Runtime dependencies are loaded from CDNs

Evidence:

- `src/vendor/three.js:1` imports Three from cdnjs.
- `index.html:553-554` loads jsPDF and JSZip from cdnjs.

Impact:

- Offline use, strict CSP, privacy blockers, or enterprise network policy can break rendering and export.

Fix method:

- Vendor or bundle dependencies locally.
- If external CDN use remains, add SRI and a clear failure message.
- Add a startup dependency health check that disables affected exports gracefully.

### 25. Logging is scattered

Evidence:

- `rg console` finds runtime logging in data loading, app startup, overlays, exports, presets, and UI setup.

Impact:

- Production behavior is noisy and inconsistent. Some errors are only console-visible while users see generic failures.

Fix method:

- Create a tiny `logger` and `userErrorReporter`.
- Gate debug logs behind a flag.
- Route user-action failures through `showNotification()` with actionable text.

## Cross-platform, accessibility, and ergonomics issues

### 26. WebGL support and context loss are not handled explicitly

Evidence:

- `src/app/mapManager.js:82`, `src/app/uvMapManager.js:76`, `src/features/export/exportManager.js:172`, and `src/features/export/sceneSnapshotExporter.js:35` create `THREE.WebGLRenderer` directly.
- There is no discovered `webglcontextlost`/`webglcontextrestored` handling.

Impact:

- Older devices, low-power mobile browsers, remote desktops, and GPU resets can fail with generic startup/export errors.

Fix method:

- Add WebGL capability detection before map creation.
- Add context loss/restored handlers on canvases.
- Lower default pixel ratio or quality on mobile/low memory.
- Show a non-WebGL fallback message with disabled exports where needed.

### 27. Canvas interactions lack keyboard alternatives

Evidence:

- `src/render/interactions/cameraControls.js` handles pointer and wheel input.
- `src/ui/enhance.js:101-114` handles only UI keyboard behavior, not map pan/zoom/rotate.

Impact:

- Keyboard-only and assistive-technology users cannot fully operate the maps.

Fix method:

- Add focused-canvas keyboard controls for pan, zoom, rotate, reset view, and selection.
- Expose visible buttons for common map actions.
- Ensure buttons have icon labels, stable sizing, and tooltips.

### 28. Export controls need clearer state and feedback

Evidence:

- Export buttons are terse labels such as PNG/PDF/STL.
- `src/app/createApp.js:393-411` changes STL kit text to `Generating...` but does not expose progress, cancellation, estimated workload, or dependency availability.

Impact:

- Large exports can feel frozen. Missing CDN dependencies fail late.

Fix method:

- Disable export buttons when dependencies are unavailable.
- Show progress and cancellation for STL kit and large raster exports.
- Display selected export area dimensions and expected output size before download.

### 29. Tooltip constellation field is not normalized

Evidence:

- `src/render/interactions/tooltips.js:76` uses `star.Constellation`.
- Normalization also creates lowercase `star.constellation`.

Impact:

- Future normalized-only data can show `N/A` even when constellation data exists.

Fix method:

- Use `star.constellation || star.Constellation`.
- Add a tooltip formatting unit test.

### 30. Full mobile/projection/browser matrix is not automated

Evidence:

- The verifier is Node/static based.
- Browser smoke test was blocked in this environment.

Impact:

- Regressions in Safari/WebKit, Firefox, Edge, Android Chrome, iOS Safari, high-DPI canvases, touch gestures, and export downloads can ship unnoticed.

Fix method:

- Add Playwright tests for Chromium, Firefox, and WebKit.
- Check desktop and mobile viewport screenshots.
- Include canvas pixel nonblank checks, pointer/touch gesture checks, and export download checks.
- Run a manual matrix on real iOS Safari and Android Chrome before release.

## Professional polish issues

### 31. The UI still has override-heavy visual details

Evidence:

- The theme layer contains many overrides and some decorative radial gradients.
- Sidebar controls can become dense and text-heavy, especially with per-star options.

Impact:

- The app can feel less professional under complex filter configurations, especially on phone widths.

Fix method:

- Reduce decoration and rely on spacing, contrast, hierarchy, and icon buttons.
- Keep long labels out of narrow button surfaces.
- Add tooltips for compact controls and stable dimensions for export/tool buttons.

### 32. Existing audit docs can drift from the current code

Evidence:

- `CODE_AUDIT.md` and `PERFORMANCE_AUDIT.md` describe previously completed work and remaining work.
- This report identifies additional current runtime/fidelity issues.

Impact:

- Multiple audit documents can disagree over time.

Fix method:

- Keep one living `AUDIT_STATUS.md` with open/closed issue IDs.
- Move historical notes to a dated archive section.
- Tie each issue to a test or acceptance criterion.

## Recommended repair roadmap

### Phase 1: Correctness fixes

1. Fix opacity values and make `displayOpacity` affect all render/export paths.
2. Centralize display distance and use viewpoint distance consistently.
3. Normalize invalid min/max distance ranges.
4. Fix UV double-opacity and cloud-density radius mismatch.
5. Add async token protection to `UVMapManager.updateMap()`.

### Phase 2: Export fidelity

1. Define a shared export scene model.
2. Decide whether SVG is simplified or full-fidelity.
3. Add feature-format matrix tests.
4. Validate STL scale docs and generated STL geometry.

### Phase 3: Performance safety

1. Add grid/cell budgets and UI estimates.
2. Replace all-distance-per-cell caches with spatial queries.
3. Virtualize per-star filter controls.
4. Add frame-time tests for pan/zoom/filter changes.

### Phase 4: Architecture cleanup

1. Split `MapManager`, `UVMapManager`, and `stlKitExporter`.
2. Make filter logic pure and app/runtime state explicit.
3. Move DOM lookups into UI modules.
4. Centralize logging, dependency health, and user-facing errors.

### Phase 5: Cross-platform and polish

1. Vendor or bundle CDN dependencies.
2. Add WebGL capability/context-loss handling.
3. Add keyboard alternatives for canvas interactions.
4. Run and record Chromium, Firefox, WebKit, iOS Safari, Android Chrome, Edge, desktop, tablet, and phone checks.

## Minimum acceptance checklist after fixes

- `npm.cmd test` passes.
- Browser tests pass in Chromium, Firefox, and WebKit.
- Mobile viewport screenshots have no clipped controls or overlapping labels.
- Canvas pixel checks confirm every map renders nonblank after initial load.
- Opacity, distance, density, isolation, cloud-density, constellation, and galactic-plane settings match between screen, PNG, PDF, SVG where SVG claims support, and UV exports.
- STL simple and STL kit exports have valid scale metadata, finite triangles, nonzero normals, and expected part counts.
- Density/isolation controls cannot exceed the configured cell budget.
- No critical user action fails only in the console.
