# Astrography Code Audit Status

This file reflects the current repair state after the code audit work. Older findings about removed facade files, missing package metadata, direct Three.js CDN imports, and absent SVG export are no longer current.

## Fixed

- Removed unused facade/orphan modules that were not imported by the app.
- Centralized Three.js through `src/vendor/three.js`.
- Centralized string hashing through `src/shared/hashUtils.js` for render signatures and auto-color helpers.
- Removed an unnecessary renderer dependency from the app state factory.
- Added `package.json` and `scripts/verify.mjs`.
- Fixed malformed mobile CSS in `styles/theme.css`.
- Changed individual star filters to key by stable `starId` instead of common name.
- Normalized cloud-density star matching to match cloud overlay behavior.
- Extracted shared cloud-name normalization into a pure helper used by both cloud renderers.
- Fixed connection distance-bound caching to use a connection signature instead of only connection count.
- Extracted connection render keys, visual signatures, and distance-bounds caching into a pure helper module with behavior tests.
- Added shared aborting fetch timeout handling for star, cloud, constellation, and stellar-class data.
- Added direct PNG/PDF snapshot export for primary map views.
- Added Mollweide SVG export.
- Improved Mollweide SVG fidelity by exporting edited star-label positions, rotations, and scales.
- Export raster renderers now copy source renderer clear color, transparency background, color space, and tone mapping settings.
- Export background CSS color parsing is centralized and covers hex, legacy RGB/RGBA, modern space-separated RGB, percentages, and `color(srgb/display-p3 ...)` computed styles.
- Export crop/viewBox and scene snapshot sizing now use safe display dimensions and clamped crop pixels instead of raw canvas client dimensions.
- Centralized PDF/ZIP runtime dependency checks and browser-download capability errors.
- Hardened Blob downloads with injectable browser APIs, URL revocation, and fallback DOM element removal.
- Centralized canvas PNG blob creation/download handling so async `toBlob` failures are caught consistently.
- Centralized PDF canvas image conversion through async Blob/FileReader helpers instead of direct per-export `toDataURL` calls.
- Centralized STL scale constants and added STL kit export metadata.
- Split STL kit generation into a pure file-buffer builder, module-worker bridge, and main-thread ZIP/download wrapper.
- Extracted STL kit metadata, filename sanitation, rank maps, and README manifest formatting into a pure helper module with behavior tests.
- Extracted STL kit worker payload serialization and transferable-buffer selection into a pure helper module with behavior tests.
- Extracted shared STL vector math into a pure helper module used by kit geometry and feature-direction selection.
- Extracted STL kit vector glyph data and digit layout metrics into a pure helper module with behavior tests.
- Extracted STL kit feature-direction candidate search into a pure helper module with behavior tests.
- Extracted STL kit tube-label flat-crown layout and label-basis selection into a pure helper module with behavior tests.
- Extracted STL kit print orientation and build-plate placement into a pure helper module with behavior tests.
- Extracted STL kit star-facet geometry into a pure helper module with behavior tests.
- Extracted STL kit socket clustering, forced-merge planning, and component graph assembly into a pure helper module with behavior tests.
- Added a pure edit import/export schema module with versioning and validation, including line-edit round-tripping.
- Added cleanup paths for map managers and pointer-based star interactions.
- Added cross-browser fullscreen fallbacks and disabled unsupported fullscreen controls explicitly.
- Added accessible mobile-sidebar toggle state with `aria-controls` and synchronized `aria-expanded`.
- Hardened projection visibility setup so missing optional map containers do not crash app boot.
- Replaced direct blocking alert calls for export/edit errors with a shared accessible notification helper and verifier guard.
- Centralized tooltip action/link styling in CSS classes instead of inline JS styles.
- Replaced direct `CSS.escape` form lookups with a scoped ID helper that works when `CSS.escape` is unavailable.
- Replaced direct edit-import `File.text()` usage with a shared local text-file reader and FileReader fallback.
- Replaced direct preset `localStorage` access with a shared storage helper and removed stale theme storage lookup from the boot script.
- Centralized repeated canvas text-label measurement for distance and plane labels.
- Centralized UV atlas color conversion, alpha clamping, and layer canvas creation with fake-DOM behavior tests.
- Centralized edit UI listener registration and fixed edit overlay/transform listener cleanup with individual drag-listener disposers.
- Centralized dynamic map star-layer child disposal so texture uniforms are released when star point/sphere layers are rebuilt.
- Centralized dependency-light hex color parsing and alpha clamping for UV canvas CSS colors, map star/connection render buffers, label leader lines, constellation label CSS, and Mollweide SVG export.
- Clamped filter, map, label, connection, constellation, and export opacity entry points through shared `clamp01` handling.
- Centralized map canvas sizing and device-pixel-ratio clamping to avoid zero-size/infinite-aspect renderers during hidden or mobile layout transitions.
- Centralized render-frame scheduling/cancellation and added timeout fallbacks for runtimes without `requestAnimationFrame`.
- Added per-manager dirty render state so targeted interaction renders can avoid repainting unchanged maps.
- Decoupled UV map layer rendering from direct filter-form reads.
- Extracted UV layer signature hashing into a pure module with behavior tests.
- Extracted UV overlay-cell projection/color/alpha/radius helpers and fixed density/isolation line fallbacks for cells without RA/Dec.
- Decoupled density and isolation overlay updates from direct filter-form reads.
- Reused geometry templates for density and isolation grid cells.
- Added a shared instanced cell renderer and migrated density, isolation, and cloud-density grid cells away from per-cell scene meshes/materials.
- Fixed UV cloud-density drawing so inactive cloud-density cells are not included in canvas/export output.
- Fixed default/no-form filter results so angular projections exclude the active viewpoint star consistently with the main filter path.
- Centralized display-stat calculations for range-dependent filters.
- Added runtime validation for manifest, star, cloud, constellation, and stellar-class data files.
- Removed star records with unknown distance/coordinates from runtime star buckets.
- Added orphan-source, edit-export schema, edit-control lifecycle, runtime-data schema, UV/overlay filter-decoupling, UV layer-signature extraction, UV canvas-layer utility extraction, UV overlay-cell extraction, map star-layer disposal, shared color parsing, render/export color normalization, shared opacity clamping, CSS background color parsing, filter projection consistency, display-stat, instanced-overlay, cloud-density UV active-state, export-runtime dependency, canvas-sizing safety, export-sizing safety, centralized render scheduling, text-canvas centralization, tooltip-style centralization, canvas-PNG helper, SVG label-fidelity, fullscreen compatibility, sidebar accessibility, projection-visibility robustness, user-notification centralization, `CSS.escape` compatibility, local file-read compatibility, storage-access compatibility, centralized-hashing, app-state/render decoupling, STL helper extraction, STL tube-label layout extraction, STL print-orientation extraction, STL facet-geometry extraction, STL socket-planning extraction, and export-renderer configuration checks to the verifier.
- Added verifier behavior checks for distance filtering, visible-star filtering, display-stat computation, FormData-based filter state, cloud-name normalization, connection cache signatures, shared color fallback/interpolation, STL kit metadata/glyph layout/feature directions/print orientation/facet geometry/socket planning, and edit import/export round-tripping.

## Remaining High-Value Refactors

- Split `src/app/mapManager.js` by projection/rendering strategy.
- Split `src/app/uvMapManager.js` into atlas state, layer renderers, interaction geometry, and projection-specific renderers.
- Split `src/features/export/stlKitExporter.js` into graph planning, CSG geometry, glyph engraving, and ZIP packaging modules.
- Broaden automated behavioral coverage around rendered output, editing flows, and browser-only interactions.
- Add Playwright-style browser visual checks once browser tooling is available.

## Verification Gate

Use:

```bash
npm.cmd test
```

This is a structural verifier plus targeted behavior smoke coverage, not complete browser/e2e coverage.
