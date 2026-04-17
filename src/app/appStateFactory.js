/**
 * @file Owns all mutable application state and the filterRuntimeState object.
 * Centralizes state declarations that were previously scattered across createApp.js
 * module-level variables.
 *
 * Exports a factory that builds a state proxy via createAppState(),
 * plus direct accessors for state that other modules need.
 */
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.min.js';
import { createAppState } from './appState.js';

// ---------------------------------------------------------------------------
// Module-level mutable state stored in a single object
// ---------------------------------------------------------------------------
const _state = {
  cachedStars: null,
  selectedStarData: null,
  selectedHighlightTrue: null,
  selectedHighlightGlobe: null,
  selectedHighlightMollweide: null,
  selectedHighlightUv: null,
  selectedHighlightUvGlobe: null,
  globeSurfaceSphere: null,
  cloudDensityOverlays: [],
  constellationLinesGlobe: [],
  constellationLabelsGlobe: [],
  constellationOverlayGlobe: [],
  constellationLinesMoll: [],
  constellationLabelsMoll: [],
  constellationOverlayMoll: [],
  galacticPlaneTrue: null,
  eclipticPlaneTrue: null,
  celestialEquatorTrue: null,
  galacticPlaneGlobe: null,
  eclipticPlaneGlobe: null,
  celestialEquatorGlobe: null,
  galacticPlaneMoll: null,
  eclipticPlaneMoll: null,
  celestialEquatorMoll: null,
  galacticDirectionLabelsTrue: [],
  galacticDirectionLabelsGlobe: [],
  galacticDirectionLabelsMoll: []
};

const filterRuntimeState = {
  currentFilteredStars: [],
  currentConnections: [],
  currentGlobeFilteredStars: [],
  currentGlobeConnections: [],
  currentMollweideFilteredStars: [],
  currentMollweideConnections: [],
  isolationOverlay: null,
  densityOverlay: null,
  showConstellationBoundariesFlag: false,
  showConstellationNamesFlag: false,
  showConstellationOverlayFlag: false,
  enableIsolationFilterFlag: false,
  enableDensityFilterFlag: false,
  showCloudsFlag: false,
  showCloudDensityFlag: false,
  showGalacticPlaneFlag: false,
  showEclipticPlaneFlag: false,
  showCelestialEquatorFlag: false
};

// ---------------------------------------------------------------------------
// Helper: build accessor descriptor targeting the correct backing store
// ---------------------------------------------------------------------------
function buildAccessor(key) {
  if (key in filterRuntimeState) {
    return { get: () => filterRuntimeState[key], set: v => { filterRuntimeState[key] = v; } };
  }
  return { get: () => _state[key], set: v => { _state[key] = v; } };
}

// ---------------------------------------------------------------------------
// All field names that feed the proxy
// ---------------------------------------------------------------------------
const stateFields = [
  ...Object.keys(_state),
  ...Object.keys(filterRuntimeState)
];

// ---------------------------------------------------------------------------
// State proxy built via createAppState
// ---------------------------------------------------------------------------
const accessors = {};
for (const key of stateFields) {
  accessors[key] = buildAccessor(key);
}

export const state = createAppState(accessors);

// ---------------------------------------------------------------------------
// Direct accessors for values that other modules need by reference
// ---------------------------------------------------------------------------
export function getCachedStars() { return _state.cachedStars; }
export function setCachedStars(v) { _state.cachedStars = v; }

export function getGlobeSurfaceSphere() { return _state.globeSurfaceSphere; }
export function setGlobeSurfaceSphere(v) { _state.globeSurfaceSphere = v; }

export function getConstellationLinesMoll() { return _state.constellationLinesMoll; }
export function getGalacticDirectionLabelsMoll() { return _state.galacticDirectionLabelsMoll; }
