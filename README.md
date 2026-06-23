# Astrography

Astrography is a browser-based stellar cartography app for exploring nearby stars across synchronized projections:

- **True Coordinates**: primary 3D cartesian star layout.
- **Map**: primary UV/equirectangular source map.
- **Globe**: primary globe projected from the UV atlas.
- **Legacy Globe**: older scene-based spherical plotting workflow.
- **Legacy Mollweide**: older flat-sky projection used for label/line editing and vector-style export.

The app supports distance, stellar class, color, size, opacity, cloud, density, isolation, constellation, and plane controls. It also supports editable labels/lines, local presets, PNG/PDF picture exports, Mollweide SVG export, simple STL export, and a 3D-printable STL kit export.

## Running Locally

The app fetches JSON/text assets at runtime, so serve it over HTTP from the repository root:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

On Windows PowerShell, the npm wrapper may be blocked by execution policy. Use `npm.cmd test` for the local verifier.

## Verification

Run:

```bash
npm.cmd test
```

The verifier checks:

- JavaScript syntax for all `src/**/*.js` files.
- Relative ES module imports.
- Centralized Three.js imports through `src/vendor/three.js`.
- Centralized string hashing for render signatures and generated fallback colors.
- CSS brace balance.
- Required export controls in `index.html`.
- Orphaned JavaScript source files.
- Pure edit import/export schema content and behavior, including hidden line round-trips and invalid import rejection.
- Export renderer color/clear-setting propagation for raster exports.
- Centralized PDF/ZIP runtime dependency and browser-download capability checks.
- Centralized canvas PNG blob/download handling with no direct export `toBlob` callbacks outside the helper.
- Mollweide SVG export preserves edited star-label position, rotation, and scale state.
- Fullscreen controls use cross-browser API fallbacks and disable unsupported buttons.
- The mobile sidebar toggle exposes and synchronizes its controlled/open state for assistive tech.
- UV map rendering remains decoupled from direct filter-form reads.
- UV layer signatures are extracted into a pure module and behavior-checked.
- Density and isolation overlay updates remain decoupled from direct filter-form reads.
- Range-dependent display filters use centralized stats.
- Normal and fallback/default filter results share angular projection viewpoint-star exclusion so Globe/Mollweide/UV do not drift.
- Connection render keys, visual signatures, and distance-bounds caching live in `src/features/connections/connectionRenderState.js`.
- Runtime data loaders validate manifest, star, cloud, constellation, and stellar-class payloads.
- Behavioral smoke checks for distance/visibility filters, filter-state parsing, cloud-name matching, connection cache signatures, STL kit metadata/glyph layout/feature directions, and edit import/export round-trips.
- Export and edit-import failures use a shared non-blocking notification helper instead of direct browser alerts.
- Star tooltip action/link styling lives in CSS classes rather than inline JS styles.
- Form ID lookups use a shared scoped helper with a `CSS.escape` fallback for older browser/WebView compatibility.
- Edit-file import uses a shared local text-file reader with a FileReader fallback for browsers without `File.text()`.
- Preset persistence uses `src/shared/storageUtils.js`, and the single-theme boot path no longer depends on `localStorage`.
- Edit UI controls register event listeners through the edit manager so button/overlay listeners are removed on disposal.
- Map canvases use shared safe sizing and pixel-ratio clamping so hidden/mobile layout transitions do not create zero-size or infinite-aspect renderers.
- Hot density/isolation/cloud-density overlays use shared instanced grid-cell rendering instead of one scene mesh per cell.
- UV cloud-density rendering skips inactive cells so canvas/PDF/PNG output matches current filter state.

Manual browser verification is still required after rendering or UI changes. Use `MANUAL_VERIFICATION_CHECKLIST.md` for scenario coverage.

## Runtime Dependencies

The repository is still a no-build browser ES module app. Runtime dependencies are loaded by the page:

- Three.js is centralized through `src/vendor/three.js`.
- jsPDF and JSZip are provided by `index.html` for PDF and ZIP exports.

## Source Layout

- `src/main.js`: browser entry point.
- `src/app/`: bootstrap, app state, map managers, projection visibility, render coordination, presets.
- `src/data/`: shared fetch timeout helper and star data loading/normalization.
- `src/features/`: feature modules for filters, clouds, constellations, density, isolation, planes, labels, editing, export, and connections.
- `src/render/`: Three.js disposal helpers plus camera, tooltip, and star interaction handling.
- `src/shared/`: constants, geometry, star, color, form, UV, and UI helpers.
- `src/ui/`: sidebar and UI enhancement wiring.
- `styles/`: CSS for base layout, sidebar, panels, overlays, responsiveness, and theme.
- `data/`: runtime star buckets and dust-cloud JSON assets.

## Export Behavior

- True Coordinates, Map, Globe, and Legacy Globe have direct PNG/PDF snapshot exports.
- Legacy Mollweide supports selection-based PNG/PDF export and SVG export.
- True Coordinates supports STL export and a ZIP-based 3D-print kit.
- STL scale is centralized in `src/features/export/stlScale.js`.
- STL kit metadata, filename sanitation, rank maps, and README manifest text live in `src/features/export/stlKitMetadata.js`.
- STL kit worker payload serialization and transferable-buffer selection live in `src/features/export/stlKitWorkerPayload.js`.
- STL kit vector math lives in `src/features/export/stlVectorMath.js` and is shared by geometry generation and feature-direction selection.
- STL kit vector glyph data and digit layout metrics live in `src/features/export/stlTextGlyphs.js`.
- STL kit feature-direction selection lives in `src/features/export/stlFeatureDirections.js`.
- STL kit tube-label flat-crown layout and label basis selection live in `src/features/export/stlTubeLabelLayout.js`.
- STL kit print orientation and build-plate placement live in `src/features/export/stlPrintOrientation.js`.
- STL kit star-facet depth, diameter, trim-box sizing, and local point projection live in `src/features/export/stlFacetGeometry.js`.
- STL kit socket clustering, forced-merge planning, and tube-component graph assembly live in `src/features/export/stlSocketPlanning.js`.
- The 3D-print kit includes `README.txt` in the ZIP with scale, counts, and skipped connection details.
- The 3D-print kit builds CSG/STL buffers in a module worker when supported, then ZIPs/downloads on the main thread with a fallback path.
- Mollweide SVG exports use live label sprite state so edited star-label transforms are reflected in vector output.
- PDF and ZIP exports use shared runtime dependency checks before using CDN-provided libraries.
- PNG exports use shared canvas-to-Blob handling so unsupported or failed image encoding surfaces as a normal export error.
- Blob downloads use a shared defensive helper with URL revocation and legacy element-removal fallback.
- PDF image embedding uses shared async canvas-to-Blob/data-URL conversion instead of direct per-export `toDataURL` calls.
- Raster exports copy the source renderer's clear color, color space, tone mapping, and visible canvas background for closer on-screen fidelity.
- Export background CSS color parsing lives in `src/shared/cssColorParsing.js` and handles modern computed color formats before raster export renderers choose a fallback background.
- Snapshot and Mollweide crop/SVG export sizing use safe display dimensions and clamped crop pixels so high-DPI or hidden canvases do not skew export aspect or viewBox math.

## Important Architecture Notes

- `src/app/createApp.js` remains the main bootstrap coordinator.
- `src/features/filters/pipeline/filterPipeline.js` remains the main filter/render orchestration path.
- `src/app/mapManager.js`, `src/app/uvMapManager.js`, and the planning/geometry sections of `src/features/export/stlKitExporter.js` are still large and should be treated as active refactor targets.
- Connection render invalidation and bounds caching are isolated from `MapManager` so cache signatures can be tested directly.
- User-facing error notifications live in `src/shared/userNotifications.js` so blocking alert behavior is centralized and verifier-guarded.
- Form restoration and preset migration use `src/shared/formUtils.js` for scoped ID lookup instead of assuming `CSS.escape` is available.
- Local preset storage goes through `src/shared/storageUtils.js` so browsers that block Web Storage fail gracefully.
- Projection visibility uses safe optional DOM lookups so legacy/embedded map containers can be omitted without breaking app boot.
- Local text-file reading lives in `src/shared/fileUtils.js` so edit import is not tied to only modern File APIs.
- Repeated canvas text-label measurement lives in `src/shared/textCanvas.js` so distance and plane labels share sizing behavior.
- UV atlas color conversion, alpha clamping, and layer canvas creation live in `src/app/uvCanvasLayers.js` so export-layer assumptions are directly testable.
- Edit-manager UI listener lifecycle is centralized through `EditManager.addManagedEventListener`, including disposable document listeners for rotate/scale drags.
- Dynamic map star layers clear children through `src/render/engine/renderUtils.js` so geometry, materials, texture maps, and shader-uniform textures are disposed consistently.
- Canvas sizing and renderer pixel-ratio setup live in `src/shared/canvasSizing.js`.
- Render-frame scheduling, after-paint yielding, and scheduled-frame cancellation live in `src/shared/renderScheduler.js` with timeout fallbacks for embedded or test runtimes without native animation frames.
- UV atlas invalidation signatures live in `src/app/uvLayerSignatures.js` so redraw decisions can be tested without the renderer.
- UV overlay-cell projection, alpha, color, and radius calculations live in `src/app/uvOverlayCells.js` so density/isolation/cloud-density atlas behavior can be tested directly.
- STL kit metadata and manifest formatting are isolated from CSG generation so export naming and ranking can be tested directly.
- STL kit worker payload serialization is isolated so structured-clone compatibility can be tested without spawning a Worker.
- STL vector math is isolated from CSG generation so geometry basis calculations share one tested implementation.
- STL text glyph/layout data is isolated from CSG generation so engraving behavior can be tested without running the full exporter.
- STL feature-direction candidate selection is isolated from CSG generation so star engraving placement can be tested directly.
- STL tube-label layout is isolated from CSG generation so tube engraving placement can be tested directly.
- STL print orientation and build-plate placement are isolated from CSG generation so exported part orientation can be tested directly.
- STL star-facet geometry is isolated from CSG generation so rank-engraving surface dimensions can be tested directly.
- STL socket planning is isolated from CSG generation so overlapping holes, forced merges, and component graph assembly can be tested directly.
- Runtime data fetching now uses an aborting timeout helper, but the app still normalizes data in the browser.
- Runtime data payloads are validated before being normalized or cached.
- Star buckets no longer include records with unknown distance/coordinates, which cannot be rendered.
- Render signatures and generated fallback colors share `src/shared/hashUtils.js`.
- Hex color parsing and alpha clamping for render buffers, labels, connection lines, constellation CSS colors, UV atlas CSS colors, and SVG export live in `src/shared/colorParsing.js`, so display colors normalize before reaching Three.js or exported markup.
- Filter, map, label, connection, constellation, and export opacity entry points clamp non-finite/out-of-range values before updating WebGL materials or SVG opacity attributes.
- The app state factory stays decoupled from the Three.js renderer stack.
- Render scheduling has per-manager dirty state, but line-heavy overlay geometry still needs deeper incremental updates.
- UV map layer signatures use the normalized filter snapshot rather than querying form controls directly.
- Default/no-form filter results use the same angular projection star exclusion as the main filter pipeline.
- Density, isolation, and cloud-density overlays use normalized state plus shared instanced grid-cell layers.
- Size, color, and opacity filters share display statistics when their active modes need ranges.
- Fullscreen buttons use browser-specific fallbacks where available and expose disabled/pressed state for unsupported or active cases.
- The sidebar menu button controls `#filters-sidebar` and keeps `aria-expanded` aligned with the visible sidebar state.
- The project has a lightweight verifier, not a complete unit/e2e test suite.

## Current Known Work

The largest remaining engineering work is:

- Full browser smoke and visual tests across Chromium, Firefox, and WebKit/Safari-sized viewports.
- Further decomposition of the large map/export managers.
- Broader automated coverage for rendered output, editing, export downloads, and browser-only interactions.
