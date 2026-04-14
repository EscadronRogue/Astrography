# High-Risk Refactor Notes

This pass applies the most important structural fixes from the current audit.

## Completed in this refactor

### 1. Removed duplicated constellation overlay creation path
Constellation overlay meshes are now rebuilt only through `script/constellationManager.js`.

Before this change, `filters/index.js` was also creating and attaching globe overlay meshes directly, which could produce duplicate scene objects and mismatched cleanup behavior.

### 2. Removed `window.*` map dependencies from derived overlay management
`filters/filterOverlayState.js` no longer reads scenes from global `window` state.

Overlay creation and teardown now receive scenes explicitly from the filter pipeline, making the code deterministic and reducing hidden coupling.

### 3. Removed global render callback dependency from controls
`cameraControls.js` now uses `shared/renderScheduler.js` instead of calling `window.requestRender`.

The render trigger is registered once from `script.js`, which keeps control code decoupled from browser globals.

### 4. Removed dead backup entrypoint from the repository
`script_backup_before_split.js` was deleted.

The file duplicated a large amount of stale application logic and increased the risk of future regressions during refactors.

### 5. Aligned the repository audit with the current codebase
`CODE_AUDIT.md` was replaced with the updated audit file so the repository now reflects the current state of the project.

## Remaining high-value follow-up work

- Turn `script.js` state into a real application state object rather than a compatibility facade over many top-level variables.
- Normalize opacity values to 0–1 internally across the pipeline.
- Continue extracting export/editing subsystems out of `script.js`.
- Add a lightweight smoke-test workflow for module loading and core filter refresh paths.
