# Astrography

Astrography is an interactive mapping tool for the local stellar neighborhood. It renders nearby stars in three complementary views:

- **True Coordinates** for spatial position
- **Globe** for an intuitive spherical overview
- **Mollweide** for a projection-friendly analytical map

The project is aimed at exploration, education, and visual analysis of nearby stellar structure.

## Current focus

This revision improves the project in four areas:

- safer and more predictable UI behavior
- cleaner accessibility and layout defaults
- deterministic label placement instead of random placement
- more stable camera, tooltip, and geometry utilities

## Project structure

- `index.html` – static shell, canvases, and top-level controls
- `script.js` – application bootstrap and map orchestration
- `styles.css` – layout, controls, overlays, and responsive styling
- `cameraControls.js` – custom 3D and 2D camera interactions
- `labelManager.js` – label creation, caching, layout, and connector lines
- `tooltips.js` – tooltip rendering and positioning
- `filters/` – filters, overlays, and projection-specific visual layers
- `ui/` – filter UI wiring and generated filter panels
- `utils/` – geometry and projection helpers
- `data/` – star and cloud data files

## Running locally

Serve the repository with a local web server.

```bash
git clone https://github.com/EscadronRogue/Astrography.git
cd Astrography
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Notes on data

Astrography uses repository data files under `data/` together with supporting constellation and stellar-class metadata in the repository root. If you expand the dataset or add derived data, keep the source files, derived files, and schema notes clearly separated.

## Development priorities

The codebase is still evolving from prototype to maintainable application. The next worthwhile steps are:

1. split `script.js` into feature modules
2. move filter parsing toward a single state model
3. make overlay controllers independent from direct DOM reads
4. document the data schema and refresh workflow

## Attribution

If you use Astrography in your work, please include:

> This work utilizes Astrography, developed by Antoine Paulet.
