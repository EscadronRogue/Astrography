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
// Module-level mutable state
// ---------------------------------------------------------------------------
let cachedStars = null;
let selectedStarData = null;
let selectedHighlightTrue = null;
let selectedHighlightGlobe = null;
let selectedHighlightMollweide = null;
let globeSurfaceSphere = null;
let cloudDensityOverlays = [];
let constellationLinesGlobe = [];
let constellationLabelsGlobe = [];
let constellationOverlayGlobe = [];
let constellationLinesMoll = [];
let constellationLabelsMoll = [];
let constellationOverlayMoll = [];
let galacticPlaneTrue = null;
let eclipticPlaneTrue = null;
let celestialEquatorTrue = null;
let galacticPlaneGlobe = null;
let eclipticPlaneGlobe = null;
let celestialEquatorGlobe = null;
let galacticPlaneMoll = null;
let eclipticPlaneMoll = null;
let celestialEquatorMoll = null;
let galacticDirectionLabelsTrue = [];
let galacticDirectionLabelsGlobe = [];
let galacticDirectionLabelsMoll = [];

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
// State proxy built via createAppState
// ---------------------------------------------------------------------------
export const state = createAppState({
  cachedStars: { get: () => cachedStars, set: v => { cachedStars = v; } },
  currentFilteredStars: { get: () => filterRuntimeState.currentFilteredStars, set: v => { filterRuntimeState.currentFilteredStars = v; } },
  currentConnections: { get: () => filterRuntimeState.currentConnections, set: v => { filterRuntimeState.currentConnections = v; } },
  currentGlobeFilteredStars: { get: () => filterRuntimeState.currentGlobeFilteredStars, set: v => { filterRuntimeState.currentGlobeFilteredStars = v; } },
  currentGlobeConnections: { get: () => filterRuntimeState.currentGlobeConnections, set: v => { filterRuntimeState.currentGlobeConnections = v; } },
  currentMollweideFilteredStars: { get: () => filterRuntimeState.currentMollweideFilteredStars, set: v => { filterRuntimeState.currentMollweideFilteredStars = v; } },
  currentMollweideConnections: { get: () => filterRuntimeState.currentMollweideConnections, set: v => { filterRuntimeState.currentMollweideConnections = v; } },
  selectedStarData: { get: () => selectedStarData, set: v => { selectedStarData = v; } },
  selectedHighlightTrue: { get: () => selectedHighlightTrue, set: v => { selectedHighlightTrue = v; } },
  selectedHighlightGlobe: { get: () => selectedHighlightGlobe, set: v => { selectedHighlightGlobe = v; } },
  selectedHighlightMollweide: { get: () => selectedHighlightMollweide, set: v => { selectedHighlightMollweide = v; } },
  constellationLinesGlobe: { get: () => constellationLinesGlobe, set: v => { constellationLinesGlobe = v; } },
  constellationLabelsGlobe: { get: () => constellationLabelsGlobe, set: v => { constellationLabelsGlobe = v; } },
  constellationOverlayGlobe: { get: () => constellationOverlayGlobe, set: v => { constellationOverlayGlobe = v; } },
  constellationLinesMoll: { get: () => constellationLinesMoll, set: v => { constellationLinesMoll = v; } },
  constellationLabelsMoll: { get: () => constellationLabelsMoll, set: v => { constellationLabelsMoll = v; } },
  constellationOverlayMoll: { get: () => constellationOverlayMoll, set: v => { constellationOverlayMoll = v; } },
  globeSurfaceSphere: { get: () => globeSurfaceSphere, set: v => { globeSurfaceSphere = v; } },
  isolationOverlay: { get: () => filterRuntimeState.isolationOverlay, set: v => { filterRuntimeState.isolationOverlay = v; } },
  densityOverlay: { get: () => filterRuntimeState.densityOverlay, set: v => { filterRuntimeState.densityOverlay = v; } },
  cloudDensityOverlays: { get: () => cloudDensityOverlays, set: v => { cloudDensityOverlays = v; } },
  galacticPlaneTrue: { get: () => galacticPlaneTrue, set: v => { galacticPlaneTrue = v; } },
  eclipticPlaneTrue: { get: () => eclipticPlaneTrue, set: v => { eclipticPlaneTrue = v; } },
  celestialEquatorTrue: { get: () => celestialEquatorTrue, set: v => { celestialEquatorTrue = v; } },
  galacticPlaneGlobe: { get: () => galacticPlaneGlobe, set: v => { galacticPlaneGlobe = v; } },
  eclipticPlaneGlobe: { get: () => eclipticPlaneGlobe, set: v => { eclipticPlaneGlobe = v; } },
  celestialEquatorGlobe: { get: () => celestialEquatorGlobe, set: v => { celestialEquatorGlobe = v; } },
  galacticPlaneMoll: { get: () => galacticPlaneMoll, set: v => { galacticPlaneMoll = v; } },
  eclipticPlaneMoll: { get: () => eclipticPlaneMoll, set: v => { eclipticPlaneMoll = v; } },
  celestialEquatorMoll: { get: () => celestialEquatorMoll, set: v => { celestialEquatorMoll = v; } },
  galacticDirectionLabelsTrue: { get: () => galacticDirectionLabelsTrue, set: v => { galacticDirectionLabelsTrue = v; } },
  galacticDirectionLabelsGlobe: { get: () => galacticDirectionLabelsGlobe, set: v => { galacticDirectionLabelsGlobe = v; } },
  galacticDirectionLabelsMoll: { get: () => galacticDirectionLabelsMoll, set: v => { galacticDirectionLabelsMoll = v; } },
  showConstellationBoundariesFlag: { get: () => filterRuntimeState.showConstellationBoundariesFlag, set: v => { filterRuntimeState.showConstellationBoundariesFlag = v; } },
  showConstellationNamesFlag: { get: () => filterRuntimeState.showConstellationNamesFlag, set: v => { filterRuntimeState.showConstellationNamesFlag = v; } },
  showConstellationOverlayFlag: { get: () => filterRuntimeState.showConstellationOverlayFlag, set: v => { filterRuntimeState.showConstellationOverlayFlag = v; } },
  enableIsolationFilterFlag: { get: () => filterRuntimeState.enableIsolationFilterFlag, set: v => { filterRuntimeState.enableIsolationFilterFlag = v; } },
  enableDensityFilterFlag: { get: () => filterRuntimeState.enableDensityFilterFlag, set: v => { filterRuntimeState.enableDensityFilterFlag = v; } },
  showCloudsFlag: { get: () => filterRuntimeState.showCloudsFlag, set: v => { filterRuntimeState.showCloudsFlag = v; } },
  showCloudDensityFlag: { get: () => filterRuntimeState.showCloudDensityFlag, set: v => { filterRuntimeState.showCloudDensityFlag = v; } },
  showGalacticPlaneFlag: { get: () => filterRuntimeState.showGalacticPlaneFlag, set: v => { filterRuntimeState.showGalacticPlaneFlag = v; } },
  showEclipticPlaneFlag: { get: () => filterRuntimeState.showEclipticPlaneFlag, set: v => { filterRuntimeState.showEclipticPlaneFlag = v; } },
  showCelestialEquatorFlag: { get: () => filterRuntimeState.showCelestialEquatorFlag, set: v => { filterRuntimeState.showCelestialEquatorFlag = v; } }
});

// ---------------------------------------------------------------------------
// Direct accessors for values that other modules need by reference
// ---------------------------------------------------------------------------
export function getCachedStars() { return cachedStars; }
export function setCachedStars(v) { cachedStars = v; }

export function getGlobeSurfaceSphere() { return globeSurfaceSphere; }
export function setGlobeSurfaceSphere(v) { globeSurfaceSphere = v; }

export function getConstellationLinesMoll() { return constellationLinesMoll; }
export function getGalacticDirectionLabelsMoll() { return galacticDirectionLabelsMoll; }
