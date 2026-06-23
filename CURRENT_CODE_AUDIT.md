# Astrography Current Code Audit

Date: 2026-06-23

## Verification Baseline

- `npm.cmd test` passes: 137 JavaScript files and 7 CSS files.
- `npm.cmd run test:browser` passes Chromium and WebKit on desktop and phone, including a phone density-toggle scenario and export-download checks.
- The local Playwright Firefox engine is installed but skipped because it fails before page creation with `browserContext.newPage: Cannot read properties of undefined (reading '_page')`.

## Fixed In This Pass

1. Density overlay built object-heavy geometry on phone even for true-coordinate-only viewing.
   - Previous behavior: `densityOverlay` created per-cell globe and Mollweide visual states and built a `THREE.Line` adjacency graph with great-circle sampling for every neighboring density cell.
   - Fix: density now keeps only the true-coordinate instanced cell layer plus the Mollweide heatmap canvas. The density adjacency line path and unused globe/Mollweide per-cell visual state were removed, and the verifier now blocks reintroducing density line geometry.

2. Mobile/constrained overlay grids used the same cell cap as desktop.
   - Previous behavior: density, isolation, and cloud-density overlays used the default 75k estimated-cell budget regardless of device.
   - Fix: added `getRuntimeOverlayMaxCells()` with a 16k constrained-device cap and applied it to density, isolation, and cloud-density grid builds.

3. Density UI exposed controls with no visible effect.
   - Removed density `Line Thickness`, density `Edge Hardness`, and density/isolation `Cluster Labeling & Segmentation` controls because their values were read but not consumed by a renderer.

4. Sidebar search enhancement depended on a fixed startup delay.
   - Previous behavior: `src/ui/enhance.js` retried search setup with `setTimeout(buildFilterSearch, 800)`.
   - Fix: `setupFilterUI()` dispatches an `astrography:filters-ready` event after dynamic sidebar setup, and the search enhancement attaches from that lifecycle signal with disposable event listeners.

5. UV atlas canvases used the desktop resolution on constrained phones.
   - Previous behavior: each UV map manager allocated 8192 x 4096 atlas/layer canvases regardless of device.
   - Fix: added runtime atlas sizing. Desktop remains 8192 x 4096 by default, constrained/mobile browsers use a 2048 x 1024 interactive atlas, and WebGL `MAX_TEXTURE_SIZE` caps either path.

6. Browser smoke testing was defined but not runnable or aligned with the current app.
   - Previous behavior: Playwright was missing, the smoke script double-navigated during startup, used stale export IDs, treated hidden projection canvases as failures, and used in-page WebGL readback that produced false blank-canvas failures.
   - Fix: added Playwright, installed browsers locally, switched canvas validation to Playwright element screenshots, updated current export IDs, added phone density-toggle coverage, and made unavailable browser engines explicit skips.

7. The app made an external Google Fonts request on every load.
   - Previous behavior: local/browser tests emitted network-denied resource errors and the app depended on an external font service.
   - Fix: removed the Google Fonts stylesheet request from `index.html`; CSS and canvas text now fall back through local/system font stacks.

## Highest Priority Remaining Issues

### 1. Firefox browser smoke coverage is unavailable in this local Playwright runtime

Evidence:

- `npm.cmd run test:browser` validates Chromium and WebKit desktop/phone targets.
- The same script skips Firefox because Playwright fails at `browserContext.newPage` before the app is loaded.

Impact:

- Mozilla/Firefox behavior is not currently covered by the automated local smoke run.

Fix method:

- Reinstall or pin Playwright if the Firefox runtime remains broken.
- Add a CI/browser environment where Playwright Firefox can create pages reliably.
- Keep a manual Firefox checklist until automated Firefox coverage is green.

### 2. UV atlas layering still duplicates memory

Evidence:

- Runtime atlas sizing now caps constrained/mobile browsers to 2048 x 1024.
- Each `UVMapManager` still allocates `atlasCanvas`, `baseLayer`, `featureLayer`, `starLayer`, and `labelLayer`.
- The app creates both `uvMap` and `uvGlobeMap`.

Impact:

- The phone path is much smaller than before, but duplicated full-layer canvases can still consume meaningful memory during density/cloud/label redraws.

Fix method:

- Avoid duplicating full layer canvases for both UV projections when one atlas can be shared.
- Dispose or null old layer canvases when maps are hidden or projection managers are destroyed.
- Keep high-resolution export canvases allocated only during export transactions.

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

### 4. Isolation adjacency lines remain object-heavy

Evidence:

- Density no longer builds adjacency line geometry.
- Isolation still builds an adjacency list and maintains both globe and Mollweide line geometry per active edge.

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

### 8. No-build ES module delivery is expensive on mobile cold start

Evidence:

- The app ships many separate ES modules plus large JSON/text data assets directly to the browser.

Impact:

- Mobile cold start pays many request/parse costs. Offline/local demos are better now that external fonts are removed, but module/data loading still has no production bundle.

Fix method:

- Add a production build that bundles application modules while keeping data files cacheable.
- Add `modulepreload` or a bundler manifest for key startup modules if staying no-build.

### 9. Runtime data normalization remains browser-heavy

Evidence:

- Star buckets and constellation/cloud data are fetched and normalized at app boot or feature activation.

Impact:

- Large data loads compete with first render and filter interactions on lower-end devices.

Fix method:

- Preprocess stable catalog data into a compact runtime format.
- Version the processed data manifest.
- Consider binary/typed-array star position payloads for render-heavy paths.
- Move expensive normalization to a Worker if runtime preprocessing must remain.

### 10. Browser-only behavior has more static checks than runtime checks

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
