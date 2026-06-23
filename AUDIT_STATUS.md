# Astrography Audit Status

Date: 2026-06-23

## Current verification

- `npm.cmd test` passes.
- `npm.cmd audit --audit-level=moderate` passes after moving runtime dependencies to local npm packages.
- Browser visual smoke testing now has a `npm run test:browser` harness, but running it is still blocked in this Codex environment by local-browser policy. Real Chromium, Firefox, WebKit, iOS Safari, Android Chrome, Edge, gesture, and download checks still need to run outside this restricted browser.

## Closed in this repair pass

- Per-star opacity now reaches 3D, globe, Mollweide, UV, SVG, PNG, and PDF paths.
- Distance-dependent filtering, stats, and sizing now use viewpoint-relative display distance.
- Inverted min/max distance input is normalized.
- Density, isolation, and cloud-density grids are budget-clamped.
- Density/isolation distance caches no longer store full sorted `cells * stars` arrays.
- K-nearest connections now use a dependency-light spatial index.
- UV density/cloud-density opacity and cloud-density radius now share final overlay values.
- UV redraws are protected against stale async updates.
- SVG export now includes live overlay/state layers, heatmaps, planes, constellation layers, cloud lines, per-star opacity, edited labels, and live border style.
- SVG export now uses a collected Mollweide scene model instead of ad hoc state traversal inside the serializer.
- PNG/PDF scene snapshots and Mollweide SVG now share an `exportSceneModel` contract for format metadata, dimensions, filenames, and renderer family.
- Raster/PDF Mollweide export is single-flight guarded.
- STL scale docs were corrected and generated STL buffers are validated.
- Runtime dependencies now load from pinned local npm packages instead of cdnjs.
- jsPDF was upgraded to an audit-clean local version.
- WebGL availability and context-loss handling were added.
- Canvas keyboard controls and focus labels were added.
- A Playwright-based browser smoke harness was added for desktop/mobile viewports, nonblank canvas sampling, and export download checks.
- Export dependency health disables unavailable export controls.
- STL kit export reports progress and ARIA busy state.
- STL kit worker and main-thread generation now report fine-grained build progress during system, connection, star, and tube generation.
- STL kit export can now be cancelled from the progress button, including worker termination and main-thread/ZIP abort checks.
- STL kit worker payloads now strip non-cloneable UI callbacks/signals so worker generation is not forced into main-thread fallback.
- Runtime logging is centralized.
- Tooltip constellation lookup uses normalized/fallback fields.
- Stellar-class per-star rows lazy-render.
- Inline viewpoint-banner styles were moved into CSS.
- CSS `!important` overrides were removed.
- `color-mix()` declarations now have plain fallback values.
- Filter overlay instances and filter form access are scoped through runtime context instead of module globals.
- Runtime filter form, stellar-class container, and dust-cloud selection lookups are centralized in `src/features/filters/filterControls.js`.
- Export button wiring was extracted from `createApp` into `src/app/exportBindings.js`.
- Loading progress DOM/state handling was extracted from `createApp` into `src/app/loadingProgress.js`.
- Map star texture/material factories were extracted from `MapManager` into `src/app/mapStarMaterials.js`.
- True-coordinate connection distance label sprites were extracted from `MapManager` into `src/app/mapConnectionLabels.js`.
- UV projection camera/control/surface construction was extracted from `UVMapManager` into `src/app/uvSurfaceFactory.js`.
- UV galactic/ecliptic/equator plane curve drawing was extracted from `UVMapManager` into `src/app/uvPlaneDrawing.js`.
- UV cloud overlay line drawing was extracted from `UVMapManager` into `src/app/uvCloudOverlayDrawing.js`.
- STL kit abort/yield/progress helpers were extracted into `src/features/export/stlKitProgress.js`.

## Still open

- Automated browser/visual test matrix is implemented as `npm run test:browser`, but could not be run here.
- `MapManager`, `UVMapManager`, and `stlKitExporter` are still sizeable orchestration files, though repeated rendering/setup/progress helpers have been extracted and guarded by tests. `createApp` has been reduced to bootstrap orchestration.
- Export formats share a scene-model foundation, but raster/PDF still render from WebGL snapshots while SVG renders vector layers.
- Mobile ergonomics and professional visual polish still need real-device/browser review.

## Acceptance gate before calling the audit complete

- Node verifier and npm audit pass.
- Browser tests pass in Chromium, Firefox, and WebKit.
- Manual or automated checks pass on iOS Safari, Android Chrome, and Edge.
- Canvas pixel checks prove all maps render nonblank.
- Export downloads are verified for PNG, PDF, SVG, simple STL, and STL kit.
- Remaining large-file architecture work is either completed or explicitly accepted as deferred.
