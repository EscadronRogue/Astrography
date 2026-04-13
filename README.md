# Astrography

Astrography is an interactive WebGL atlas for exploring the stellar neighborhood around the Sun. It combines three complementary views of the same dataset:
- **True Coordinates** for physical 3D placement
- **Globe** for spherical context
- **Mollweide** for 2D projection, annotation, and export

The project includes filterable stellar classes, distance and density analysis, connection overlays, constellation boundaries, dust cloud overlays, editable labels, and high-resolution exports.

## Current data scope

The repository currently ships nearby-star datasets in JSON chunks under `data/` and a manifest file used by the app loader. The live app can visualize stars out to 100 light years, with distance filters used to focus the current view.

## Project structure

```text
.
├── index.html
├── styles.css
├── script.js
├── cameraControls.js
├── labelManager.js
├── tooltips.js
├── ui/
├── filters/
├── utils/
├── app/
└── data/
```

### Notable modules

- `script.js` — application bootstrap and high-level orchestration
- `ui/filterUI.js` — DOM wiring for the filter sidebar
- `filters/index.js` — filter state parsing and derived visualization state
- `filters/*.js` — rendering and analysis modules for overlays and transformations
- `labelManager.js` — label creation, caching, and placement
- `cameraControls.js` — 3D and 2D interaction controls
- `utils/starData.js` — star normalization helpers
- `utils/geometryUtils.js` — projection and spherical geometry utilities

## Running locally

Because the application fetches local JSON files, it must be served from a local web server rather than opened directly from the file system.

### Option 1: Python

```bash
git clone https://github.com/EscadronRogue/Astrography.git
cd Astrography
python -m http.server 8000
```

Then open `http://localhost:8000`.

### Option 2: Any static-file server

Any static HTTP server works as long as it serves the repository root and preserves the relative paths in `data/`, `filters/`, `ui/`, and `utils/`.

## Editing and exports

The Mollweide map includes tools for:
- editing star labels
- rotating and scaling labels
- hiding line segments
- undoing edits
- exporting selected regions as PNG or PDF

Saved presets and edits are stored locally in the browser.

## Data and provenance

This repository includes source files for:
- nearby star records
- constellation boundaries and centers
- stellar classification metadata
- dust cloud overlay datasets

If you extend or replace the data, keep the schema stable or update the normalization logic in `utils/starData.js`.

## Known limitations

- The application still uses vanilla JavaScript modules and browser-loaded CDN dependencies rather than a packaged build system.
- Some analysis overlays can become expensive when many layers are enabled at once.
- The visualization is optimized for desktop exploration first, with responsive behavior for smaller screens.

## Attribution

If you use Astrography in your own work, please credit:

> This work utilizes Astrography, developed by Antoine Paulet.

## Contributing

Improvements, bug fixes, and data corrections are welcome. When contributing, prefer small focused changes and keep rendering, UI, and data-normalization logic separated where possible.
