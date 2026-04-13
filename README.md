# Astrography

Interactive 3-view stellar cartography application for nearby stars, constellations, density and isolation overlays, cloud overlays, editable labels/lines, and map export.

## Data model

The app loads star data from `data/manifest.json`, then fetches the listed JSON buckets from `data/`.
Each star record is normalized at load time so downstream code can rely on:

- `distance`
- `apparentMagnitude`
- `absoluteMagnitude`
- `starId`
- original source fields preserved for compatibility

Cloud data files in `data/*_cloud*.json` are loaded on demand and normalized only as needed for overlay matching.

## Main features

- True Coordinates, Globe, and Mollweide views
- Distance, size, opacity, color, visibility, and stellar-class filters
- Constellation boundaries, labels, and overlays
- Galactic plane, ecliptic plane, and celestial equator overlays
- Density and isolation analysis overlays
- Interstellar cloud overlays and cloud-density overlays
- Editable labels and lines with local preset persistence
- PNG/PDF export including Mollweide projection export

## Startup flow

1. `script.js` loads and normalizes star data from `data/manifest.json`
2. UI controls are initialized
3. Three map managers are created
4. Filters build the rendered subsets and overlays
5. Editing, export, and interaction handlers are attached

## Development notes

- `constellation_center.json` is the normalized runtime source for constellation centers.
- `constellation_center.txt` and `constellation_boundaries.txt` are retained as raw/reference inputs.
- Shared rendering helpers live in `utils/renderUtils.js`.

## Known expectations

This repo is intended to run as a browser app served from a local web server. Opening the files directly from disk may break fetch-based data loading.
