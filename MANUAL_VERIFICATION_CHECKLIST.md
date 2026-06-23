# Manual verification checklist

Use this checklist after each structural refactor wave.

## Core app boot
- [ ] `index.html` loads without console errors.
- [ ] Star data loads and stars render in the default projection.
- [ ] Switching between true coordinates, globe, and Mollweide works.
- [ ] Labels render and update after projection changes.
- [ ] Toggling legacy projections on/off does not break visible map sync or page layout.

## Filters
- [ ] Distance, size, color, opacity, stars shown, and stellar class filters all update the visible star set.
- [ ] Filter changes do not leave stale labels, lines, or overlays behind.
- [ ] Resetting filters returns the app to the expected default state.

## Feature overlays
- [ ] Plane overlays toggle on and off correctly.
- [ ] Constellation boundaries, names, and overlay rendering still work.
- [ ] Density overlay rebuilds cleanly when relevant settings change.
- [ ] Isolation overlay rebuilds cleanly when relevant settings change.
- [ ] Density, isolation, and cloud-density grid cells render after pan/zoom/filter changes without stale cells from previous settings.
- [ ] Connections render correctly in all projections.
- [ ] Cloud and cloud-density overlays still load and render.

## Editing
- [ ] Label edit mode can select, move, rotate, and scale labels.
- [ ] Line edit mode can hide line segments and undo changes.
- [ ] Saved edit state can be exported and re-applied, including hidden line segments and hidden line objects.
- [ ] Preset persistence still works after an edit.

## Export
- [ ] PNG export completes successfully.
- [ ] PDF export completes successfully.
- [ ] STL kit export completes successfully and the UI remains responsive while CSG/STL files are generated.
- [ ] Exported output reflects current overlays and label edits.
- [ ] UV/PNG/PDF cloud-density output excludes inactive cells after radius/opacity changes.

## Cleanup gate before removing compatibility shims
- [ ] No active imports still depend on the old transitional file paths.
- [ ] Compatibility re-export files are reduced only after the new paths are in use.
- [ ] Smoke-check pass completed after the latest move set.
