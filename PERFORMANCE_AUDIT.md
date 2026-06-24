# Astrography Performance Audit Status

This file tracks current performance risks after the first repair batches.

## Improved

- Star rendering in `MapManager` uses reusable buffers/instancing for major paths.
- Cloud-density overlays no longer rebuild on every filter change when topology is unchanged.
- Cloud-density nearest-distance lookup now uses spatial buckets instead of checking every cloud star for every cell.
- Cloud overlay neighbor selection now uses spatial buckets instead of sorting every other cloud star for each cloud star.
- Mollweide filter updates no longer duplicate `updateStarPositions()` immediately after `addStars()`.
- Connection bounds caching now uses a real connection signature.
- Connection render signatures and distance-bounds caching are extracted into a pure helper and behavior-checked.
- Per-manager render dirty flags are in place for targeted render requests.
- Map and UV renderers now use shared safe canvas sizing and clamped pixel ratios, avoiding accidental zero-size buffers or oversized device-pixel-ratio costs.
- Map and UV star-layer rebuilds now clear children through centralized Object3D disposal, preventing leaked star textures and materials during filter/count changes.
- Map star color buffers, connection color blends, labels, constellation CSS colors, UV atlas CSS colors, and SVG export now normalize colors and clamp alpha through shared dependency-light parsing, avoiding update/export failures from malformed color values.
- Filter, map, label, connection, constellation, and export opacity handoffs clamp non-finite/out-of-range values before they reach materials or SVG attributes.
- Preset storage is centralized behind a safe Web Storage helper, and the single-theme boot path no longer blocks on browser storage availability.
- Tooltip action/link visuals are CSS-owned rather than injected through JS, improving theme consistency and maintainability.
- Export crop/viewBox and snapshot aspect sizing use the same safe display-size helper with crop clamping, reducing hidden/high-DPI canvas mismatch risk.
- Raster export background detection now uses a shared computed CSS color parser that handles modern browser color formats before falling back.
- Render, after-paint scheduling, and scheduled-frame cancellation now use a shared helper, keeping frame coalescing centralized and providing fallbacks for nonstandard embedded runtimes.
- STL kit export now builds CSG/STL buffers through a module worker when available, with a main-thread fallback.
- STL kit metadata, rank maps, and manifest formatting are extracted into a pure module so export naming checks do not require full CSG export.
- STL kit reusable CSG construction is extracted from ZIP/download orchestration into `src/features/export/stlKitCsg.js`.
- STL kit worker payload serialization and transferable-buffer selection are extracted into a pure module so Worker handoff checks do not require launching a Worker.
- STL kit vector math is extracted into a pure module so geometry helper behavior can be tested without full CSG export.
- STL kit text glyph layout is extracted into a pure module so engraving-related checks do not require full CSG export.
- STL kit feature-direction search is extracted into a pure module so engraving placement can be checked without full CSG export.
- STL kit tube-label layout and basis selection are extracted into a pure module so tube engraving placement can be checked without full CSG export.
- STL kit print orientation and build-plate placement are extracted into a pure module so part orientation checks do not require full CSG export.
- STL kit star-facet geometry is extracted into a pure module so rank-engraving surface checks do not require full CSG export.
- STL kit socket clustering, forced-merge planning, and tube-component graph assembly are extracted into a pure module so topology checks do not require full CSG export.
- STL kit printable system/connection planning is extracted into a pure module so de-duplication, skipped endpoint reasons, and printable tube thresholds can be checked without full CSG export.
- UV map layer signatures and drawing now consume the normalized filter snapshot instead of reading filter controls from the DOM.
- UV map layer signatures are extracted into a pure module so atlas invalidation behavior is directly verifier-tested.
- UV atlas canvas drawing is extracted into `src/app/uvAtlasLayerRenderer.js`, reducing `UVMapManager` to lifecycle/signature/interaction responsibilities.
- UV atlas layer-canvas creation and color/alpha conversion are centralized so export-layer sizing and CSS color formatting can be behavior-tested without a browser.
- UV overlay-cell projection, alpha, color, and radius calculations are centralized so density/isolation/cloud-density atlas rendering does not drift between overlays.
- Density and isolation overlays consume normalized filter options instead of reading sliders from the DOM.
- Density and isolation grid cells reuse geometry templates during grid creation.
- Density, isolation, and cloud-density grid cells now render through shared `THREE.InstancedMesh` layers instead of one scene mesh/material per cell.
- Star data can be loaded from generated `data/preprocessed/*.normalized.json` buckets, avoiding repeated coordinate/id derivation for the checked-in dataset.
- Startup, data loading, preprocessing, filter application, UV atlas redraws, and STL kit export now record measurements in `window.__astrographyPerformance`; browser smoke saves these as JSON artifacts.
- Range-dependent size, color, and opacity filters share one display-stat pass when needed.
- Dead re-export/facade modules were removed.
- The verifier enforces centralized Three.js imports, catches broken relative imports, blocks orphaned source files, checks export renderer configuration, prevents UV/density/isolation render code from reintroducing form reads, guards centralized display stats, blocks hot overlay regressions back to per-cell mesh creation, and runs targeted behavior smoke checks for filters/cloud matching/export metadata.

## Remaining Performance Work

- Avoid geometry disposal/rebuild during Mollweide pan for connection, cloud, density, and plane line updates where attribute updates can be used.
- Add explicit performance budgets/FPS assertions on top of the collected browser-smoke timing artifacts.

## Current Verification

Run:

```bash
npm.cmd test
```

This confirms syntax/import/CSS/export-control integrity. It does not measure FPS or canvas fidelity.

Run:

```bash
npm.cmd run test:browser
```

This confirms nonblank canvas output, export downloads, and required startup/filter timing markers on Chromium/WebKit in this local environment. Firefox may still skip locally because of the known Playwright `_page` issue.
