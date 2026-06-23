# Astrography Current Code Audit

Date: 2026-06-23

## Verification Baseline

- `npm.cmd test` passes: 136 JavaScript files and 7 CSS files.
- `npm.cmd run test:browser` fails before opening a browser because Playwright is not installed in `package.json`.
- The in-app browser route was not reliable in this environment, so the phone density issue was audited from code paths plus static verifier coverage.

## Fixed In This Pass

1. Density overlay allocated unused Mollweide adjacency meshes.
   - Previous behavior: `densityOverlay` created and updated hidden `lineM` geometry for every density cell neighbor even though the Mollweide scene only used the heatmap texture.
   - Fix: removed the unused `lineM` allocation/update/disposal path.

2. Mobile/constrained overlay grids used the same cell cap as desktop.
   - Previous behavior: density, isolation, and cloud-density overlays used the default 75k estimated-cell budget regardless of device.
   - Fix: added `getRuntimeOverlayMaxCells()` with a 16k constrained-device cap and applied it to density, isolation, and cloud-density grid builds.

3. Density UI exposed controls with no visible effect.
   - Removed density `Line Thickness`, density `Edge Hardness`, and density/isolation `Cluster Labeling & Segmentation` controls because their values were read but not consumed by a renderer.

## Highest Priority Remaining Issues

### 1. Automated mobile/browser smoke testing is not actually available

Evidence:

- `package.json` defines `test:browser`.
- `scripts/browserSmoke.mjs` imports Playwright dynamically.
- `package.json` has no `playwright` dependency, and `npm.cmd run test:browser` fails immediately.

Impact:

- Phone, Safari/WebKit, Firefox, Edge, touch interaction, canvas readback, export-download, and density-toggle regressions are not gated.

Fix method:

- Add Playwright as a dev dependency or provide a documented external browser-test setup.
- Add a test scenario that loads the phone viewport, opens the sidebar, enables density, waits for the filter pipeline to settle, asserts no console/page errors, and checks canvases remain nonblank.
- Run Chromium, Firefox, and WebKit in CI where possible; keep a manual Safari/iOS checklist for real-device memory behavior.

### 2. UV atlas memory is too high for phones

Evidence:

- `ATLAS_WIDTH = 8192` and `ATLAS_HEIGHT = 4096`.
- Each `UVMapManager` allocates `atlasCanvas`, `baseLayer`, `featureLayer`, `starLayer`, and `labelLayer`.
- The app creates both `uvMap` and `uvGlobeMap`.

Impact:

- A single 8192 x 4096 RGBA canvas is about 128 MB before browser overhead. Five canvases per manager and two managers can exceed practical mobile memory. Enabling density redraws feature layers and can be the action that exposes the crash.

Fix method:

- Introduce runtime atlas sizing based on `MAX_TEXTURE_SIZE`, viewport, device memory, and export requirements.
- Use a lower interactive atlas size on constrained devices, then allocate high-resolution export canvases only during export.
- Avoid duplicating full layer canvases for both UV projections when one atlas can be shared.
- Dispose or null old layer canvases when maps are hidden or projection managers are destroyed.

### 3. Overlay generation still runs synchronously on the main thread

Evidence:

- Density, isolation, and cloud-density overlays build grids with nested loops and then compute cell metrics immediately.
- The new cell cap reduces worst-case size, but the work still blocks input and rendering while it runs.

Impact:

- Phones can appear frozen when density/isolation settings change, especially at large distance ranges.

Fix method:

- Move overlay grid creation and density/isolation metrics into a Worker.
- Use typed-array payloads for cells, positions, density values, and active flags.
- Add cancellation tokens so rapid slider changes abandon stale work.
- Show a lightweight "building overlay" progress state and keep the UI interactive.

### 4. Overlay adjacency lines remain object-heavy

Evidence:

- Density and isolation still build an adjacency list and per-neighbor line objects for the globe path.
- Isolation still maintains both globe and Mollweide line geometry per active edge.

Impact:

- Large grids can produce tens or hundreds of thousands of edge records. This is memory-heavy and difficult to update incrementally.

Fix method:

- Replace per-edge `THREE.Line` objects with merged buffer geometry or instanced line rendering.
- Store adjacency as typed index pairs, not object records with mesh references.
- Rebuild buffers only when topology changes; update color/alpha attributes when filter values change.

### 5. Core managers are still too large

Evidence:

- Largest source files include `stlKitExporter.js` (~869 lines), `uvMapManager.js` (~694), `exportManager.js` (~619), `mapManager.js` (~547), `isolationOverlay.js` (~513), and `constellationLabelPlacement.js` (~568).

Impact:

- Feature work is harder to reason about, review, and test. Cross-feature changes often touch orchestration, rendering, data, and UI at once.

Fix method:

- Split managers by responsibility:
  - `UVMapManager`: atlas allocation, layer invalidation, layer drawing, projection surface, label placement.
  - `MapManager`: projection strategy, star layer, connection layer, controls, resize/render lifecycle.
  - `ExportManager`: selection UI, raster/PDF transaction, SVG rendering, export command wiring.
  - `stlKitExporter`: CSG body creation, engraving, socket cutting, tube generation, ZIP packaging.

### 6. CSS is layered, duplicated, and harder to maintain than necessary

Evidence:

- `base.css`, `sidebar.css`, `layout.css`, and `panels.css` define legacy coral/dark styles.
- `theme.css` then overrides most of those rules with a second token system.
- `responsive.css` sets mobile sidebar width to `220px`, while later `theme.css` overrides it to `86vw`.

Impact:

- Final styling depends on file order and override knowledge. This makes polish, theming, and mobile fixes more fragile.

Fix method:

- Collapse active styles into one token system.
- Remove legacy rules that are always overridden.
- Keep responsive rules in the final active stylesheet or import them after theme rules intentionally.
- Add a visual regression check for desktop and phone layout.

### 7. Density UX is split across two fieldsets

Evidence:

- `index.html` has an early `Density` fieldset for enable/radius and a later `Density` fieldset for advanced density/isolation controls.

Impact:

- Users can enable density in one section but need to find another section to tune it. This is especially awkward on a phone sidebar.

Fix method:

- Consolidate density controls into one fieldset.
- Keep advanced settings behind a nested details/advanced row.
- Keep isolation as a separate fieldset or separate clearly labeled subsection.

### 8. Sidebar search enhancement is bolted on with a timeout

Evidence:

- `src/ui/enhance.js` calls `setTimeout(buildFilterSearch, 800)` in addition to DOMContentLoaded boot.

Impact:

- UI enhancement timing depends on a fixed delay and has no lifecycle disposal. This can race with slower startup or duplicate future UI mounting patterns.

Fix method:

- Move search construction into `setupFilterUI()` after dynamic sidebar content is created.
- Return a disposer for search event listeners.
- Remove the fixed timeout fallback.

### 9. No-build ES module delivery is expensive on mobile cold start

Evidence:

- The app ships many separate ES modules plus large JSON/text data assets directly to the browser.
- Runtime fonts are loaded from Google Fonts.

Impact:

- Mobile cold start pays many request/parse costs and depends on an external font service. Offline/local demos and stricter CSP/privacy environments are weaker.

Fix method:

- Add a production build that bundles application modules while keeping data files cacheable.
- Add `modulepreload` or a bundler manifest for key startup modules if staying no-build.
- Self-host fonts or define robust system fallbacks.

### 10. Runtime data normalization remains browser-heavy

Evidence:

- Star buckets and constellation/cloud data are fetched and normalized at app boot or feature activation.

Impact:

- Large data loads compete with first render and filter interactions on lower-end devices.

Fix method:

- Preprocess stable catalog data into a compact runtime format.
- Version the processed data manifest.
- Consider binary/typed-array star position payloads for render-heavy paths.
- Move expensive normalization to a Worker if runtime preprocessing must remain.

### 11. Browser-only behavior has more static checks than runtime checks

Evidence:

- The verifier checks many source tokens and pure helper invariants.
- Canvas rendering, pointer/touch controls, fullscreen behavior, downloads, and WebGL context loss are not run automatically here.

Impact:

- A codebase can pass `npm.cmd test` while still failing in Chrome/Firefox/WebKit or on real mobile devices.

Fix method:

- Make browser smoke tests installable and run them before release.
- Add screenshots and canvas-pixel checks for desktop and phone.
- Add targeted export-download checks for PNG/PDF/SVG/STL ZIP.
- Add a WebGL context loss/restoration scenario if supported by the test browser.

## Medium Priority Issues

1. Projection naming is confusing.
   - The UI distinguishes primary `Map`/`Globe` and `Legacy Globe`/`Legacy Mollweide`, but core code still mixes `globeMap`, `uvGlobeMap`, `mollweideMap`, and `legacy` wording.
   - Fix: rename variables and UI labels around "primary UV atlas" versus "legacy editable Mollweide" in one pass.

2. Export architecture is better but still not fully unified.
   - SVG uses `mollweideSvgSceneModel`; raster snapshots use `exportSceneModel`; STL paths are separate.
   - Fix: keep growing a shared scene/layer model so visible layers, opacities, and labels are declared once per projection.

3. WebGL fallback is still mostly fatal.
   - `assertWebGLAvailable()` prevents rendering when WebGL is unavailable.
   - Fix: show a polished unsupported-browser state with data/export limitations and troubleshooting text.

4. Phone ergonomics needs real-device iteration.
   - The sidebar is responsive, but control density remains high and map canvases are tall.
   - Fix: add a mobile interaction review: open filters, change density, close filters, pan/zoom maps, export, and recover from errors.

5. Existing audit files can drift from code.
   - Older audit notes already contain findings that are now fixed.
   - Fix: keep this current audit as the source of truth or replace old audit files with status-linked current findings.

