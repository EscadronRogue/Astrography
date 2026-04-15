# Astrography reorganization notes

This repository was reorganized to move runtime ownership out of the root-level `script.js` entrypoint and into a `src/` application structure.

## Key changes

- Entry point moved to `src/main.js`
- App composition moved to `src/app/createApp.js`
- State binding moved to `src/app/appState.js`
- Feature modules moved under `src/features/*`
- Rendering interactions moved under `src/render/*`
- Shared utilities consolidated under `src/shared/*`
- UI sidebar logic moved under `src/ui/sidebar/*`
- Styles split into `styles/*.css`
- Legacy root/module paths were kept as compatibility re-export shims during transition (now removed)

## Important limitation

This was done as a structural refactor intended to minimize breakage. Large legacy feature implementations such as the density, isolation, constellation, and cloud systems were relocated into feature folders and supplemented with clearer facade modules, but not every internal implementation was fully rewritten into analyzer/renderer/state slices.

The biggest functional extractions completed directly are:

- app bootstrap separation (`src/main.js`, `src/app/createApp.js`)
- app state binding extraction (`src/app/appState.js`)
- editing state/persistence extraction (`src/features/editing/editState.js`, `src/features/editing/editPersistence.js`)
- stylesheet split (`styles/*.css`)

## Suggested next pass

The next architectural pass should finish decomposing the remaining large feature files:

- `src/features/density/densityFilter.js`
- `src/features/isolation/isolationFilter.js`
- `src/features/constellations/constellationFilter.js`
- `src/features/connections/connectionsFilter.js`
- `src/features/planes/planesFilter.js`
- `src/features/clouds/cloudDensityFilter.js`

These files are now in the correct feature homes, which makes the next decomposition step far safer than before.

## Additional continuation pass

Completed after the first reorganization snapshot:
- extracted constellation data ownership into `src/features/constellations/constellationDataService.js`
- updated constellation rendering modules to consume the dedicated data service instead of mixed data/render globals
- extracted plane math and definitions into `src/features/planes/planeDefinitions.js`
- separated connection parameter ownership into `src/features/connections/connectionSettings.js`
- clarified connection module boundaries so pipeline code consumes `connectionsBuilder.js` and render code consumes `connectionsRenderer.js`
- extracted editing IO control wiring into `src/features/editing/editIOControls.js`
- extracted edit command helpers into `src/features/editing/editCommands.js`
- updated imports so app composition and pipeline code target the newer module boundaries

Still not fully complete relative to the ideal target:
- `src/app/createApp.js` remains too large and should be split further into app composition, scene bootstrap, and feature lifecycle wiring
- `src/features/density/densityFilter.js` still needs a true split between analyzer/state/renderer responsibilities
- `src/features/isolation/isolationFilter.js` still needs a true split between analyzer/state/renderer responsibilities
- `src/features/clouds/cloudsFilter.js` and `src/features/clouds/cloudDensityFilter.js` still contain legacy-shaped implementations under the correct feature home
- `src/features/editing/editManager.js` still needs deeper extraction into dedicated label and line editors
- line-edit pointer handling and undo replay were extracted into `src/features/editing/lineEditor.js` and `src/features/editing/editCommands.js`, reducing the manager's direct responsibility surface

- 2026-04-15: Moved filter-result synchronization into `src/features/filters/state/filterStateStore.js` and grouped filter-driven runtime fields inside `createApp.js` under a dedicated `filterRuntimeState` backing object. This reduces ad hoc pipeline mutation and makes the filter subsystem a clearer state owner ahead of further feature extraction.

- 2026-04-15: Split `src/app/createApp.js` further by extracting map decoration helpers, the `MapManager` implementation, projection visibility wiring, and frame rendering coordination into dedicated `src/app/*` modules. This makes app composition easier to trace and keeps `createApp.js` focused on bootstrap wiring.
- 2026-04-15: Split remaining edit interaction responsibilities out of `src/features/editing/editManager.js` into `labelDragControls.js` and `transformControls.js`, so the manager now coordinates dedicated editing modules instead of owning drag/rotate/scale behavior directly.

## Final reorganization pass (2026-04-15)

Completed the migration from transitional structure to clean architecture:

### createApp.js decomposition
- Extracted all mutable state and filterRuntimeState into `src/app/appStateFactory.js` — single explicit state owner
- Extracted globe surface rendering into `src/app/globeSurface.js`
- Extracted Mollweide position updates and scheduler into `src/app/mollweideUpdater.js`
- Extracted star data preprocessing (position calc + edit offset application) into `src/app/starPreprocessor.js`
- `createApp.js` is now a thin bootstrap orchestrator (~160 lines) that wires services and calls start

### Legacy shim removal
- Removed all 48+ compatibility re-export shims from root-level directories:
  - `filters/` (25 files), `script/` (6 files), `shared/` (7 files), `ui/` (1 file), `app/` (2 files)
  - Root-level `script.js`, `cameraControls.js`, `labelManager.js`, `tooltips.js`
  - Root-level `styles.css` wrapper
- All imports now resolve entirely within `src/`

### Barrel file cleanup
- Removed 7 unused barrel re-export files from features/:
  - `densityFilter.js`, `isolationFilter.js`, `constellationFilter.js`, `connectionsFilter.js`, `planesFilter.js`, `cloudsFilter.js`, `cloudDensityFilter.js`
- All code imports directly from source modules

### index.html
- Fixed truncated HTML (missing tooltip div, closing tags)
- Updated script entry point from `script.js` to `src/main.js` directly
- All CSS links already pointed to `styles/*.css`

### Verification
- All 166 imports across 90 source files verified to resolve to existing files
- Zero broken imports, zero legacy path references remaining
