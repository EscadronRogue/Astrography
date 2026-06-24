# Astrography Audit Status

Date: 2026-06-24

## Completed

- Shared the primary UV map/globe atlas through `src/app/uvAtlasStore.js`.
- Kept UV interaction geometry signatures per projection to preserve hit testing.
- Replaced isolation per-edge line scene objects with merged line layers.
- Updated the line editor to use the merged isolation Mollweide layer.
- Consolidated Density controls and split Isolation into its own nearby fieldset.
- Removed stale mobile CSS overrides from `styles/responsive.css`.
- Added startup `modulepreload` links for critical ES modules.
- Fixed hidden viewpoint-banner CSS so it cannot cover mobile map headings while hidden.
- Removed the standalone `editIOControls.js` startup module after a reported 503 resource failure; edit import/export wiring now lives in `EditManager` while still using shared file-reading and managed listener helpers.
- Expanded `scripts/verify.mjs` with static checks for the new architecture and UI rules.

## Verification

- `npm.cmd test` passes: 137 JavaScript files and 7 CSS files.
- `npm.cmd run test:browser` passes Chromium and WebKit desktop/phone canvas and export checks.
- `npx.cmd playwright install firefox` was run, but Firefox smoke coverage still skips because Playwright cannot create a Firefox page in this environment.

## Not Completed Here

- `npm.cmd audit --audit-level=moderate`: blocked by approval policy because it sends dependency metadata to npm's advisory service.
- Real-device validation on iOS Safari, Android Chrome, Microsoft Edge, and physical touch/download workflows.

## Acceptance Gate

The source-level audit fixes are complete for this pass. Final release confidence still needs external dependency audit approval plus real Firefox/Edge/mobile-device validation outside this local Playwright limitation.
