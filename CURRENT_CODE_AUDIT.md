# Astrography Current Code Audit

Date: 2026-06-24

## Verification Baseline

- `npm.cmd test` passes: 137 JavaScript files and 7 CSS files.
- `npm.cmd run test:browser` passes Chromium and WebKit on desktop and phone, including nonblank canvas checks, phone density-toggle coverage, and PNG/PDF/STL/UV/globe export downloads.
- Firefox automation still skips before Astrography loads: Playwright fails at `browserContext.newPage` with `Cannot read properties of undefined (reading '_page')`. Re-running `npx.cmd playwright install firefox` completed, but the failure remained.
- `npm.cmd audit --audit-level=moderate` was not run because the approval reviewer rejected sending dependency metadata to the external npm advisory service. Run it locally or approve that disclosure explicitly if registry-backed dependency audit evidence is required.

## Issues Found And Fixed In This Pass

1. Primary UV projections duplicated atlas memory and redraw work.
   - Evidence: `uvMap` and `sphereMap` each allocated a full atlas canvas plus base/feature/star/label layer canvases.
   - Fix method: added `src/app/uvAtlasStore.js`, a reference-counted shared atlas store used by both primary UV projections. Atlas layer signatures are shared, while projection-specific interaction signatures stay per `UVMapManager` so raycast targets remain correct.

2. Isolation adjacency rendering was object-heavy.
   - Evidence: isolation grid construction created per-edge `THREE.Line`/`THREE.LineSegments` objects and rewrote each edge geometry during updates.
   - Fix method: replaced per-edge scene objects with merged `globeLineLayer` and `mollweideLineLayer` buffers. Adjacency is retained as cell-pair metadata for UV/SVG/export logic, and the line editor now registers the merged Mollweide layer.

3. Density controls were split across duplicated sidebar sections.
   - Evidence: `index.html` exposed two `Density` fieldsets, with enable/radius in one place and tuning controls elsewhere.
   - Fix method: consolidated density controls into one fieldset and moved isolation into a separate adjacent fieldset.

4. Responsive CSS kept stale rules that were overridden later by `theme.css`.
   - Evidence: `responsive.css` still set mobile sidebar/header typography and a `220px` sidebar width that the active theme immediately replaced.
   - Fix method: removed stale responsive overrides so mobile layout is not dependent on accidental cascade order.

5. No-build module delivery had no startup preloads.
   - Evidence: the app serves many ES modules directly.
   - Fix method: added `modulepreload` links for the core startup modules: `src/main.js`, `src/app/createApp.js`, `src/app/mapManager.js`, `src/app/uvMapManager.js`, and `src/features/filters/pipeline/filterPipeline.js`.

6. Hidden viewpoint banner could still render and cover mobile content.
   - Evidence: `#viewpoint-banner` declared `display: flex`, overriding the browser's default `[hidden]` behavior. Phone screenshots showed the hidden banner over the first map heading.
   - Fix method: added `#viewpoint-banner[hidden] { display: none; }`, and retained `body.viewpoint-active` spacing for the legitimate visible-banner state.

7. A reported `editIOControls.js` resource request failed with HTTP 503.
   - Evidence: the standalone module was present and repo static serving returned 200, but the browser reported a failed resource load for that exact startup module.
   - Fix method: removed `src/features/editing/editIOControls.js` and folded its small import/export button wiring into `EditManager`, eliminating that network request while preserving managed listener cleanup and shared `readTextFile` compatibility.

8. Audit guardrails did not cover the above regressions.
   - Fix method: extended `scripts/verify.mjs` to enforce shared UV atlas usage, projection-local interaction signatures, merged isolation line layers, one Density fieldset plus separate Isolation fieldset, mobile CSS cleanup, and startup module preloads.

## Current Residual Gaps

1. Firefox automated coverage is blocked by the local Playwright runtime, not by an Astrography page failure.
   - Fix method: run the same smoke harness in a clean CI/browser environment or on a machine where Playwright Firefox can create pages. Keep manual Firefox verification until that is green.

2. External dependency advisory lookup was not permitted in this environment.
   - Fix method: run `npm.cmd audit --audit-level=moderate` locally, or explicitly approve sending dependency metadata to npm's advisory service.

3. Real-device checks are still outside this workspace.
   - Fix method: manually verify iOS Safari, Android Chrome, Microsoft Edge, and real touch gestures/download behavior. The automated local proxy is Chromium/WebKit desktop and phone emulation.

## Final Assessment

The code issues found in this pass that were safe to repair inside the repository have been fixed and guarded by verification. The remaining items are external validation/dependency-audit gaps rather than source changes that can be completed from this sandbox alone.
