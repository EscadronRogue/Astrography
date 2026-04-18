# Astrography

Astrography is a browser-based stellar cartography application for exploring nearby stars across multiple synchronized views. The primary presentation now uses a UV-first pipeline:

- **Map** — equirectangular UV source map
- **Globe** — the UV map projected onto a sphere
- **True Coordinates** — 3D spatial layout of nearby stars

Legacy views are still available on demand:

- **Legacy Globe** — older scene-based spherical plotting
- **Legacy Mollweide** — older full-sky equal-area projection for editing and export

The application supports filtering, constellation rendering, density and isolation overlays, interstellar cloud overlays, editable labels and line visibility, preset persistence, and PNG/PDF export.

---

## What the project does

Astrography loads nearby-star data from JSON buckets, normalizes the records at runtime, and renders the same filtered star set in three different map representations. The app is designed for interactive visual analysis rather than static display.

Core capabilities include:

- synchronized rendering across the three map views
- star filtering by distance, size, opacity, color, visibility, and stellar class
- constellation boundaries, labels, and overlay regions
- galactic plane, ecliptic plane, and celestial equator overlays
- density and isolation analysis overlays
- interstellar cloud overlays and cloud-density overlays
- editable label positions, label transforms, and hidden line segments
- local preset persistence for filters and edits
- export of the Mollweide map to PNG and PDF

---

## Current architecture

The application is a client-side ES module app with no build step in the repository.
It runs directly in the browser and expects to be served from a local web server because it fetches JSON assets at runtime.

### Runtime entry point

The actual entry point is:

- `src/main.js`

That file waits for `DOMContentLoaded` and calls:

- `bootstrapApp()` in `src/app/createApp.js`

### Bootstrap flow

At startup, the app currently does the following:

1. shows the loader
2. loads star data from `data/manifest.json`
3. normalizes star records for downstream use
4. initializes filter UI
5. creates the three map managers
6. constructs the editing manager
7. loads saved presets from local storage
8. preprocesses star positions and applies stored edits
9. creates shared scene decorations such as the globe grid
10. runs the initial filter/render pipeline
11. wires star interactions, projection toggles, export, and editing controls
12. triggers the first render

The bootstrap coordinator is:

- `src/app/createApp.js`

---

## Project structure

### Top-level files

- `index.html` — application shell, filter form, canvas containers, export and editing controls
- `README.md` — project documentation
- `MANUAL_VERIFICATION_CHECKLIST.md` — manual QA checklist
- `REORGANIZATION_NOTES.md` — notes from the refactor/reorganization work

### Source tree

- `src/main.js` — browser entry point
- `src/app/` — bootstrap, app state, map manager wiring, projection visibility, presets, per-frame render coordination
- `src/data/` — star data loading and normalization entry points
- `src/domain/` — domain-facing re-export layer for coordinates and star metadata
- `src/features/` — feature modules such as clouds, constellations, filters, density, isolation, editing, export, labels, and planes
- `src/render/` — rendering and interaction helpers
- `src/shared/` — shared utilities, constants, geometry helpers, and form helpers
- `src/ui/` — sidebar and UI wiring
- `styles/` — CSS for layout, sidebar, overlays, export, and responsiveness
- `data/` — runtime JSON assets for stars and cloud data

---

## Data sources

### Star data

Star data is loaded through:

- `data/manifest.json`

The manifest lists the JSON buckets that are fetched from `data/`.
Examples include:

- `data/stars_0_20_LY.json`
- `data/stars_20_30_LY.json`
- `data/stars_90_100_LY.json`

The loader normalizes records at runtime so downstream modules can rely on consistent derived fields such as:

- `distance`
- `apparentMagnitude`
- `absoluteMagnitude`
- `starId`

Original source fields are still preserved for compatibility with existing code paths.

### Cloud data

Cloud overlays are loaded on demand from `data/*cloud*.json`.
These records are not globally normalized up front in the same way as the star buckets; feature modules normalize what they need when overlay matching or rendering occurs.

### Constellation and classification data

The repository includes constellation and stellar classification reference files, including:

- `constellation_boundaries.json`
- `constellation_boundaries.txt`
- `constellation_center.json`
- `constellation_center.txt`
- `constellation_full_names.json`
- `stellar_class.json`

At present, the runtime uses a mix of JSON and text-backed sources depending on the feature.
That is functional, but it is important to know that the data layer is not fully standardized yet.
The checked-in constellation boundary and center files are intended to be J2000-aligned display data; they can be regenerated from the authoritative J2000-derived Delporte data via `scripts/generateConstellationJ2000Data.mjs`.

---

## Main modules by responsibility

### Application bootstrap and shared state

- `src/app/createApp.js` — bootstraps the entire application
- `src/app/appStateFactory.js` — central mutable application state and state accessors
- `src/app/appState.js` — application state domains and state factory helpers
- `src/app/renderFrame.js` — render request coordination
- `src/app/presets.js` — save/load/clear preset persistence

### Map construction and projection coordination

- `src/app/mapManager.js` — creates and manages each rendered map
- `src/app/globeSurface.js` — globe surface behavior
- `src/app/mollweideUpdater.js` — deferred Mollweide update scheduling
- `src/app/projectionVisibility.js` — view toggling between map representations
- `src/app/mapDecorations.js` — shared map decorations and helper utilities
- `src/app/starPreprocessor.js` — precomputes star positions used during rendering/editing

### Filters and rendering pipeline

- `src/features/filters/pipeline/filterPipeline.js` — main render/filter orchestration
- `src/features/filters/pipeline/index.js` — filter UI setup and pipeline entry points
- `src/features/filters/state/` — reading and storing filter state
- `src/features/filters/logic/` — filtering rules and stellar-class support

### Feature modules

- `src/features/constellations/` — constellation lines, labels, overlays, and data services
- `src/features/clouds/` — cloud overlays, cloud-density overlays, geometry helpers
- `src/features/density/` — density analysis and overlay rendering
- `src/features/isolation/` — isolation analysis and overlay rendering
- `src/features/planes/` — plane definitions and plane rendering
- `src/features/labels/` — label generation and placement
- `src/features/editing/` — label editing, line editing, persistence, and undo-related behavior
- `src/features/export/` — Mollweide export workflow
- `src/features/connections/` — star connection building and line rendering

### Rendering and interactions

- `src/render/engine/renderUtils.js` — Three.js-related rendering/disposal helpers
- `src/render/interactions/cameraControls.js` — camera interaction logic
- `src/render/interactions/starInteractions.js` — hover/select behavior for stars
- `src/render/interactions/tooltips.js` — tooltip DOM behavior

### Shared utilities

- `src/shared/constants.js` — shared constants
- `src/shared/starUtils.js` — star ID and position helpers
- `src/shared/geometryUtils.js` — geometry and projection helpers
- `src/shared/colorUtils.js` — color mapping utilities
- `src/shared/formUtils.js` — form persistence helpers
- `src/shared/renderScheduler.js` — shared render-request hooks
- `src/shared/uiFactory.js` — reusable UI element helpers
- `src/shared/stellarClassUtils.js` — stellar class helpers

---

## How to run the project

Because the app fetches JSON files at runtime, it must be served through HTTP.
Opening `index.html` directly from disk may fail due to browser restrictions on module and fetch behavior.

### Simple local server options

From the repository root, any basic static server is sufficient.
Examples:

```bash
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

If you use another static server, make sure it serves:

- `index.html`
- `src/`
- `styles/`
- `data/`
- top-level JSON and text data files

---

## Runtime dependencies

This repository is structured as a browser app without an included package manifest or build pipeline in the root inspected here.
The application relies on browser ES modules and external/browser-available libraries referenced by the HTML runtime.

In particular, the current code assumes:

- Three.js is available to the browser runtime
- jsPDF is available as `window.jspdf` for PDF export

If either dependency is missing from the runtime page, rendering or export features will fail.

---

## Editing and persistence

Astrography supports editing of:

- star label offsets
- star label rotation
- star label scale
- constellation label offsets
- galactic label offsets
- removed or hidden line segments

Persistence currently happens in two forms:

1. **local preset persistence** through browser storage
2. **manual edit import/export** through JSON download/upload controls

Relevant modules:

- `src/app/presets.js`
- `src/features/editing/editPersistence.js`
- `src/features/editing/editIOControls.js`
- `src/features/editing/editManager.js`

---

## Export behavior

The main export workflow is centered on the Mollweide map.
The export controls support:

- PNG export
- PDF export

Relevant module:

- `src/features/export/exportManager.js`

Because export depends on DOM state, rendered labels, and runtime libraries, it should be verified after any UI or rendering refactor.

---

## Development notes

### What is accurate right now

- The app boots from `src/main.js`, not from a legacy `script.js`
- Shared render helpers live in `src/render/engine/renderUtils.js`
- The project is partially reorganized into `app`, `data`, `domain`, `features`, `render`, `shared`, and `ui`
- The feature structure is real, but several modules are still thin facades or re-export layers

### Important implementation realities

- the app is heavily driven by DOM IDs in `index.html`
- several large feature modules still combine state, rendering, and UI concerns
- runtime data sources are partially standardized but not fully unified
- local persistence and edit import/export are already present and operational
- some feature modules are large enough that they should be treated as active refactor targets rather than stable end-state architecture

---

## Verification

Use:

- `MANUAL_VERIFICATION_CHECKLIST.md`

That file should be treated as a manual test aid, not as exhaustive regression coverage.
For meaningful refactors, priority areas to verify are:

- startup with valid data
- filter changes across all three map views
- projection toggles
- constellation visibility and overlays
- cloud and density overlays
- isolation overlay behavior
- label editing and line editing
- preset save/load behavior
- PNG/PDF export

---

## Known limitations

Based on the current repository state, these are important practical limitations to keep in mind:

- no bundled build or package workflow is defined in the inspected root
- runtime data normalization still happens in the browser instead of a preprocessing pipeline
- some data sources still exist in both raw text and normalized JSON form
- a number of modules act as compatibility facades rather than full abstractions
- several rendering-heavy features are still concentrated in very large files

These do not prevent use of the application, but they matter for maintainability and future refactoring.

---

## Recommended next documentation updates

The next documentation improvements that would add the most value are:

1. a dedicated architecture document with module ownership and data flow
2. a data schema document for star records, cloud records, and edit export JSON
3. a contributor guide covering how to add a feature safely without breaking the render pipeline
4. a testing document with high-risk scenarios and regression checks

---

## Summary

Astrography is a feature-rich client-side stellar cartography application with three synchronized views, substantial interactive analysis features, and a partially modernized source layout.

The repository already has clear functional depth.
The most important thing for a maintainer to understand is that the current source tree is meaningfully modularized, but the implementation is still in a transitional state between older monolithic behavior and cleaner feature boundaries.
