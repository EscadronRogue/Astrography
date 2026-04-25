/**
 * @file 3D-printable STL kit exporter for the True Coordinates map.
 *
 * Produces a ZIP file containing one STL per star system.  Each STL is a
 * single solid mesh comprising:
 *
 *   1. The star's sphere (no holes)
 *   2. Half-length connection tubes fused into the sphere via CSG union,
 *      each ending with either a male pin or female socket so two halves
 *      snap together without glue.
 *   3. A flat name-tag "flag" extending from the sphere with the star's
 *      name rendered as raised pixel-font text.
 *
 * Pin/socket assignment is balanced: a greedy algorithm alternates male
 * and female ends across each star's connections so no star is all-male
 * or all-female.
 *
 * Each piece is exported at the origin for easy slicing / printing.
 */

import { CSG } from '../../vendor/csg.js';
import {
  MM_PER_LY,
  TUBE_RADIUS,
  getExportRadius,
  filterMainStars,
  buildSphereTriangles,
  buildTubeTriangles,
  trianglesToBinarySTL
} from './stlExporter.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Pin & socket dimensions (mm)
const PIN_RADIUS    = 0.6;   // narrower than tube (TUBE_RADIUS = 1)
const PIN_LENGTH    = 3.0;   // how far the pin protrudes past the cut
const SOCKET_RADIUS = 0.65;  // slight clearance around pin
const SOCKET_DEPTH  = 3.2;   // slightly deeper than pin for easy insertion

// Name-tag dimensions (mm)
const TAG_PLATE_THICK  = 0.4;
const TAG_PLATE_PAD    = 0.5;  // padding around text on plate
const TAG_PLATE_INSET  = 0.3;  // how far plate sinks into sphere for overlap
const TAG_TEXT_RAISE   = 0.25; // how much text protrudes above plate
const TAG_MAX_WIDTH    = 18;   // max plate width in mm
const TAG_PIXEL_MAX    = 0.35; // max pixel size
const TAG_PIXEL_MIN    = 0.15; // min pixel size (below this we truncate)
const FONT_CHAR_W      = 5;   // character width in pixels
const FONT_CHAR_H      = 7;   // character height in pixels
const FONT_CHAR_GAP    = 1;   // gap between characters in pixels
const FONT_LINE_GAP    = 2;   // vertical gap between lines in pixels

// ---------------------------------------------------------------------------
// Pixel font — 5×7 uppercase, digits & basic punctuation
// Each character is 7 rows of 5-bit masks (bit 4 = left, bit 0 = right)
// ---------------------------------------------------------------------------

/* eslint-disable no-multi-spaces */
const PIXEL_FONT = {
  A: [0x0E, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
  B: [0x1E, 0x11, 0x11, 0x1E, 0x11, 0x11, 0x1E],
  C: [0x0E, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0E],
  D: [0x1C, 0x12, 0x11, 0x11, 0x11, 0x12, 0x1C],
  E: [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x1F],
  F: [0x1F, 0x10, 0x10, 0x1E, 0x10, 0x10, 0x10],
  G: [0x0E, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0E],
  H: [0x11, 0x11, 0x11, 0x1F, 0x11, 0x11, 0x11],
  I: [0x0E, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0E],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0C],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1F],
  M: [0x11, 0x1B, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x11, 0x19, 0x15, 0x13, 0x11, 0x11],
  O: [0x0E, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
  P: [0x1E, 0x11, 0x11, 0x1E, 0x10, 0x10, 0x10],
  Q: [0x0E, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0D],
  R: [0x1E, 0x11, 0x11, 0x1E, 0x14, 0x12, 0x11],
  S: [0x0F, 0x10, 0x10, 0x0E, 0x01, 0x01, 0x1E],
  T: [0x1F, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0E],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0A, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x15, 0x0A],
  X: [0x11, 0x11, 0x0A, 0x04, 0x0A, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0A, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1F, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1F],

  '0': [0x0E, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0E],
  '1': [0x04, 0x0C, 0x04, 0x04, 0x04, 0x04, 0x0E],
  '2': [0x0E, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1F],
  '3': [0x1F, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0E],
  '4': [0x02, 0x06, 0x0A, 0x12, 0x1F, 0x02, 0x02],
  '5': [0x1F, 0x10, 0x1E, 0x01, 0x01, 0x11, 0x0E],
  '6': [0x06, 0x08, 0x10, 0x1E, 0x11, 0x11, 0x0E],
  '7': [0x1F, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0E, 0x11, 0x11, 0x0E, 0x11, 0x11, 0x0E],
  '9': [0x0E, 0x11, 0x11, 0x0F, 0x01, 0x02, 0x0C],

  ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  '-': [0x00, 0x00, 0x00, 0x0E, 0x00, 0x00, 0x00],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x0C, 0x0C],
  "'": [0x04, 0x04, 0x08, 0x00, 0x00, 0x00, 0x00],
  '+': [0x00, 0x04, 0x04, 0x1F, 0x04, 0x04, 0x00],
  '/': [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
  '(': [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ')': [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
};
/* eslint-enable no-multi-spaces */

// ---------------------------------------------------------------------------
// General helpers
// ---------------------------------------------------------------------------

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function getSystemName(star) {
  return star.Common_name_of_the_star_system
      || star.Common_name_of_the_star
      || star.starId
      || 'Unknown';
}

function vecNormalise(x, y, z) {
  const len = Math.sqrt(x * x + y * y + z * z) || 1;
  return [x / len, y / len, z / len];
}

function vecDot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function vecCross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

// ---------------------------------------------------------------------------
// Low-level geometry: oriented box (12 triangles)
// ---------------------------------------------------------------------------

/**
 * Build triangles for a box defined by a centre, three orthogonal half-axes,
 * and their half-lengths.  Useful for arbitrarily-oriented cuboids.
 *
 * @param {number[]} c          – centre [x,y,z]
 * @param {number[]} axisR      – "right" unit vector
 * @param {number[]} axisU      – "up" unit vector
 * @param {number[]} axisF      – "forward" unit vector
 * @param {number}   halfR,halfU,halfF – half-extents along each axis
 * @returns {Array} triangles [{a,b,c}, …]
 */
function buildOrientedBoxTriangles(c, axisR, axisU, axisF, halfR, halfU, halfF) {
  // 8 corners
  const corner = (sr, su, sf) => [
    c[0] + axisR[0] * sr * halfR + axisU[0] * su * halfU + axisF[0] * sf * halfF,
    c[1] + axisR[1] * sr * halfR + axisU[1] * su * halfU + axisF[1] * sf * halfF,
    c[2] + axisR[2] * sr * halfR + axisU[2] * su * halfU + axisF[2] * sf * halfF,
  ];
  const v = [
    corner(-1, -1, -1), // 0
    corner(+1, -1, -1), // 1
    corner(+1, +1, -1), // 2
    corner(-1, +1, -1), // 3
    corner(-1, -1, +1), // 4
    corner(+1, -1, +1), // 5
    corner(+1, +1, +1), // 6
    corner(-1, +1, +1), // 7
  ];
  // 6 faces × 2 triangles, outward-facing normals
  const faces = [
    [0,3,2,1], // -F face
    [4,5,6,7], // +F face
    [0,1,5,4], // -U face
    [2,3,7,6], // +U face
    [0,4,7,3], // -R face
    [1,2,6,5], // +R face
  ];
  const tris = [];
  for (const f of faces) {
    tris.push({ a: v[f[0]], b: v[f[1]], c: v[f[2]] });
    tris.push({ a: v[f[0]], b: v[f[2]], c: v[f[3]] });
  }
  return tris;
}

// ---------------------------------------------------------------------------
// Pin & socket tube builders
// ---------------------------------------------------------------------------

/**
 * Build a half-tube with a MALE pin at its cut end.
 * Tube: from 1 mm inside sphere centre → midpoint.
 * Pin:  from midpoint → midpoint + PIN_LENGTH (narrower radius).
 * Both are unioned via CSG.
 */
function buildHalfTubeMaleCSG(nx, ny, nz, distance) {
  if (distance < 1e-10) return CSG.fromPolygons([]);

  const halfDist = distance / 2;
  const inset = -1; // 1 mm inside the sphere

  // Main tube body
  const tubeStart = [nx * inset, ny * inset, nz * inset];
  const tubeEnd   = [nx * halfDist, ny * halfDist, nz * halfDist];
  const tubeTris  = buildTubeTriangles(
    tubeStart[0], tubeStart[1], tubeStart[2],
    tubeEnd[0], tubeEnd[1], tubeEnd[2],
    TUBE_RADIUS, 16
  );

  // Pin extending past the cut
  const pinEnd = [nx * (halfDist + PIN_LENGTH), ny * (halfDist + PIN_LENGTH), nz * (halfDist + PIN_LENGTH)];
  const pinTris = buildTubeTriangles(
    tubeEnd[0], tubeEnd[1], tubeEnd[2],
    pinEnd[0], pinEnd[1], pinEnd[2],
    PIN_RADIUS, 16
  );

  // Union via CSG to get a clean manifold join
  const tubeCSG = CSG.fromTriangles(tubeTris);
  const pinCSG  = CSG.fromTriangles(pinTris);
  return tubeCSG.union(pinCSG);
}

/**
 * Build a half-tube with a FEMALE socket at its cut end.
 * Tube: from 1 mm inside sphere centre → midpoint.
 * Socket: a cylindrical bore subtracted from the tube end, SOCKET_DEPTH deep.
 */
function buildHalfTubeFemaleCSG(nx, ny, nz, distance) {
  if (distance < 1e-10) return CSG.fromPolygons([]);

  const halfDist = distance / 2;
  const inset = -1;

  // Main tube body
  const tubeStart = [nx * inset, ny * inset, nz * inset];
  const tubeEnd   = [nx * halfDist, ny * halfDist, nz * halfDist];
  const tubeTris  = buildTubeTriangles(
    tubeStart[0], tubeStart[1], tubeStart[2],
    tubeEnd[0], tubeEnd[1], tubeEnd[2],
    TUBE_RADIUS, 16
  );
  let result = CSG.fromTriangles(tubeTris);

  // Socket bore — cylinder subtracted from the cut end going inward
  const socketStart = [
    nx * (halfDist + 1),                   // slightly past the face
    ny * (halfDist + 1),
    nz * (halfDist + 1),
  ];
  const socketEnd = [
    nx * (halfDist - SOCKET_DEPTH),
    ny * (halfDist - SOCKET_DEPTH),
    nz * (halfDist - SOCKET_DEPTH),
  ];
  const socketTris = buildTubeTriangles(
    socketStart[0], socketStart[1], socketStart[2],
    socketEnd[0], socketEnd[1], socketEnd[2],
    SOCKET_RADIUS, 16
  );
  const socketCSG = CSG.fromTriangles(socketTris);
  result = result.subtract(socketCSG);

  return result;
}

// ---------------------------------------------------------------------------
// Male/female assignment — balanced greedy
// ---------------------------------------------------------------------------

/**
 * For every unique connection pair, decide which system gets the male end.
 * Uses a greedy approach: the system with fewer male assignments so far gets
 * the next male end.  Ties broken alphabetically.
 *
 * @param {Map} systemConnections  – system → connection list
 * @returns {Map<string, string>}  – pairKey → system name that gets the male end
 */
function assignMaleFemale(systemConnections) {
  // Collect unique pairs in sorted order for determinism
  const pairsSet = new Set();
  for (const [sys, conns] of systemConnections) {
    for (const c of conns) {
      const pair = sys < c.otherSystem ? `${sys}|${c.otherSystem}` : `${c.otherSystem}|${sys}`;
      pairsSet.add(pair);
    }
  }
  const sortedPairs = [...pairsSet].sort();

  const maleCount = new Map(); // system → number of male ends assigned
  const maleMap = new Map();   // pairKey → system that is male

  for (const pair of sortedPairs) {
    const [sA, sB] = pair.split('|');
    const cA = maleCount.get(sA) || 0;
    const cB = maleCount.get(sB) || 0;

    // Give male to the system with fewer males; break ties alphabetically
    const maleSystem = cA <= cB ? sA : sB;
    maleMap.set(pair, maleSystem);
    maleCount.set(maleSystem, (maleCount.get(maleSystem) || 0) + 1);
  }

  return maleMap;
}

// ---------------------------------------------------------------------------
// Name-tag placement — find direction furthest from all tubes
// ---------------------------------------------------------------------------

const TAG_CANDIDATES = (() => {
  const dirs = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (x === 0 && y === 0 && z === 0) continue;
        const len = Math.sqrt(x * x + y * y + z * z);
        dirs.push([x / len, y / len, z / len]);
      }
    }
  }
  return dirs; // 26 candidate directions
})();

/**
 * Pick a direction for the name tag that maximises the minimum angle from
 * any connection tube direction.  Falls back to +Y if no connections.
 */
function findTagDirection(connectionDirs) {
  if (!connectionDirs || connectionDirs.length === 0) return [0, 1, 0];

  let bestDir = [0, 1, 0];
  let bestMinAngle = -Infinity;

  for (const cand of TAG_CANDIDATES) {
    let minAngle = Infinity;
    for (const td of connectionDirs) {
      // angle between candidate and tube direction (smaller = closer)
      const dot = vecDot(cand, td);
      const angle = Math.acos(Math.max(-1, Math.min(dot, 1)));
      if (angle < minAngle) minAngle = angle;
    }
    if (minAngle > bestMinAngle) {
      bestMinAngle = minAngle;
      bestDir = cand;
    }
  }
  return bestDir;
}

// ---------------------------------------------------------------------------
// Name-tag geometry builder
// ---------------------------------------------------------------------------

/**
 * Build an orthonormal basis {right, up, forward} from a forward direction.
 * `forward` = the tag direction (pointing away from sphere).
 * `right` is oriented so that text reads correctly when viewed from outside.
 * `up` will be as close to world-Y as possible.
 */
function buildTagBasis(forward) {
  let ref = [0, 1, 0];
  if (Math.abs(vecDot(forward, ref)) > 0.9) ref = [1, 0, 0];

  // Compute right so text reads correctly from the viewer's perspective
  // (viewer looks along -forward, so their "right" is our -cross(forward, ref))
  const rawRight = vecCross(forward, ref);
  const right = vecNormalise(-rawRight[0], -rawRight[1], -rawRight[2]);
  const up    = vecNormalise(...vecCross(right, forward));
  return { right, up, forward };
}

// ---------------------------------------------------------------------------
// Compact text layout — word-wrap targeting a roughly square label
// ---------------------------------------------------------------------------

/**
 * Split `name` into wrapped lines that produce the most compact (closest to
 * square) label.  Honours word boundaries when possible; falls back to
 * character-level breaks for single very long words.
 *
 * @param {string} name      – raw star system name
 * @param {number} pixelSize – mm per pixel
 * @returns {{ lines: string[], widthPx: number, heightPx: number, pixelSize: number }}
 */
function computeCompactLayout(name) {
  const text = name.toUpperCase();
  const words = text.split(/\s+/);
  const charPx = FONT_CHAR_W + FONT_CHAR_GAP; // 6 px per character cell
  const linePx = FONT_CHAR_H + FONT_LINE_GAP;  // 9 px per line cell

  // Total length if everything were on one line
  const totalLenPx = text.length * charPx - FONT_CHAR_GAP;

  // If short enough at max pixel size, single line is fine
  const maxAvailPx = Math.floor((TAG_MAX_WIDTH - 2 * TAG_PLATE_PAD) / TAG_PIXEL_MAX);

  if (totalLenPx <= maxAvailPx) {
    return {
      lines: [text],
      widthPx: totalLenPx,
      heightPx: FONT_CHAR_H,
      pixelSize: TAG_PIXEL_MAX
    };
  }

  // Target a roughly square label: find target line width (in pixels) that
  // makes  (widthPx * pixelSize) ≈ (heightPx * pixelSize)  →  widthPx ≈ heightPx
  // With N lines: heightPx ≈ N * linePx, widthPx ≈ totalLenPx / N
  // Square when  totalLenPx / N ≈ N * linePx  →  N ≈ sqrt(totalLenPx / linePx)
  const idealLines = Math.max(1, Math.round(Math.sqrt(totalLenPx / linePx)));

  // Try wrapping at a few target widths around the ideal, pick best
  let bestLayout = null;
  let bestRatio  = Infinity;

  for (let targetLines = Math.max(1, idealLines - 1);
       targetLines <= idealLines + 2;
       targetLines++) {
    const targetWidthPx = Math.ceil(totalLenPx / targetLines);
    const lines = wrapWords(words, targetWidthPx, charPx);

    let maxW = 0;
    for (const line of lines) {
      const w = line.length * charPx - FONT_CHAR_GAP;
      if (w > maxW) maxW = w;
    }
    const h = lines.length * linePx - FONT_LINE_GAP;
    const ratio = maxW > h ? maxW / h : h / maxW; // how far from square

    if (ratio < bestRatio) {
      bestRatio = ratio;
      bestLayout = { lines, widthPx: maxW, heightPx: h };
    }
  }

  // Determine pixel size to fit within TAG_MAX_WIDTH
  let pixelSize = TAG_PIXEL_MAX;
  const neededWidth = bestLayout.widthPx * pixelSize + 2 * TAG_PLATE_PAD;
  if (neededWidth > TAG_MAX_WIDTH) {
    pixelSize = (TAG_MAX_WIDTH - 2 * TAG_PLATE_PAD) / bestLayout.widthPx;
    if (pixelSize < TAG_PIXEL_MIN) pixelSize = TAG_PIXEL_MIN;
  }

  return { ...bestLayout, pixelSize };
}

/** Greedy word-wrap to fit within `maxWidthPx` pixels. */
function wrapWords(words, maxWidthPx, charPx) {
  const lines = [];
  let current = '';

  for (const word of words) {
    const testLine = current ? current + ' ' + word : word;
    const testW = testLine.length * charPx - FONT_CHAR_GAP;

    if (testW <= maxWidthPx || !current) {
      current = testLine;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ---------------------------------------------------------------------------
// Name-tag geometry builder
// ---------------------------------------------------------------------------

/**
 * Generate triangles for a name-tag plate with raised pixel text, attached
 * directly to the sphere surface (no stem).
 *
 * The plate is oriented perpendicular to `dir`, inset slightly into the
 * sphere for a solid overlap.  Text wraps across multiple lines to keep
 * the label compact.
 *
 * @param {string}   name         – star system name
 * @param {number[]} dir          – unit direction for the tag
 * @param {number}   sphereRadius – radius of the sphere (mm)
 * @returns {Array} triangles
 */
function buildTagTriangles(name, dir, sphereRadius) {
  const triangles = [];
  const { right, up, forward } = buildTagBasis(dir);

  // ── Layout text into compact wrapped lines ──────────────────────────
  const layout = computeCompactLayout(name);
  const { lines, widthPx, heightPx, pixelSize } = layout;

  const textWidthMM  = widthPx * pixelSize;
  const textHeightMM = heightPx * pixelSize;
  const plateWidth   = textWidthMM + 2 * TAG_PLATE_PAD;
  const plateHeight  = textHeightMM + 2 * TAG_PLATE_PAD;

  // ── Plate — flat box attached to sphere surface ─────────────────────
  // Inner face inset into the sphere for solid overlap with the curved surface
  const plateInnerDist = sphereRadius - TAG_PLATE_INSET;
  const plateCentreDist = plateInnerDist + TAG_PLATE_THICK / 2;

  const plateCentre = [
    forward[0] * plateCentreDist,
    forward[1] * plateCentreDist,
    forward[2] * plateCentreDist
  ];
  const plateTris = buildOrientedBoxTriangles(
    plateCentre,
    right, up, forward,
    plateWidth / 2, plateHeight / 2, TAG_PLATE_THICK / 2
  );
  triangles.push(...plateTris);

  // ── Raised pixel text on the outward plate face ─────────────────────
  const plateFaceDist = plateInnerDist + TAG_PLATE_THICK; // outer face
  const charPx  = FONT_CHAR_W + FONT_CHAR_GAP;
  const linePx  = FONT_CHAR_H + FONT_LINE_GAP;

  // Text block is centred on the plate
  const blockTopY = textHeightMM / 2; // top of first line (in up direction)

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const lineWidthMM = (line.length * charPx - FONT_CHAR_GAP) * pixelSize;
    const lineStartX = -lineWidthMM / 2; // centre each line horizontally
    const lineTopY   = blockTopY - li * linePx * pixelSize;

    for (let ci = 0; ci < line.length; ci++) {
      const ch = line[ci];
      const glyph = PIXEL_FONT[ch];
      if (!glyph) continue;

      const charOffsetX = ci * charPx * pixelSize;

      for (let row = 0; row < FONT_CHAR_H; row++) {
        const bits = glyph[row];
        for (let col = 0; col < FONT_CHAR_W; col++) {
          if (!((bits >> (FONT_CHAR_W - 1 - col)) & 1)) continue;

          // Pixel centre in local tag coordinates
          const lx = lineStartX + charOffsetX + (col + 0.5) * pixelSize;
          const ly = lineTopY - (row + 0.5) * pixelSize;
          const lz = plateFaceDist + TAG_TEXT_RAISE / 2;

          // Transform to world coordinates
          const centre = [
            right[0] * lx + up[0] * ly + forward[0] * lz,
            right[1] * lx + up[1] * ly + forward[1] * lz,
            right[2] * lx + up[2] * ly + forward[2] * lz,
          ];

          const pixTris = buildOrientedBoxTriangles(
            centre, right, up, forward,
            pixelSize / 2, pixelSize / 2, TAG_TEXT_RAISE / 2
          );
          triangles.push(...pixTris);
        }
      }
    }
  }

  return triangles;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Export a 3D-printable kit as a ZIP of individual STL files.
 *
 * Each star system is a single solid mesh: sphere + half-tubes with pin/socket
 * connectors + name-tag flag.
 *
 * @param {Array}  stars        – Currently filtered/displayed stars.
 * @param {Array}  connections  – Current connection pairs (may be empty).
 */
export async function exportPrintableSTLKit(stars, connections) {
  if (!stars || stars.length === 0) {
    console.warn('STL kit export: no stars to export.');
    return;
  }

  const JSZip = window.JSZip;
  if (!JSZip) {
    alert('JSZip library is not loaded. Cannot create ZIP file.');
    return;
  }

  // ── Collapse to main stars ───────────────────────────────────────────
  const mainStars = filterMainStars(stars);

  // Build lookup: system name → { star, posMM }
  const systemInfo = new Map();
  for (const star of mainStars) {
    if (!star.truePosition) continue;
    const sys = getSystemName(star);
    systemInfo.set(sys, {
      star,
      posMM: {
        x: star.truePosition.x * MM_PER_LY,
        y: star.truePosition.y * MM_PER_LY,
        z: star.truePosition.z * MM_PER_LY
      }
    });
  }

  // ── Build per-system connection lists & deduplicate ──────────────────
  const systemConnections = new Map();

  if (Array.isArray(connections)) {
    const seen = new Set();
    for (const { starA, starB } of connections) {
      if (!starA || !starB) continue;
      const sysA = getSystemName(starA);
      const sysB = getSystemName(starB);
      if (sysA === sysB) continue;

      const pairKey = sysA < sysB ? `${sysA}|${sysB}` : `${sysB}|${sysA}`;
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const infoA = systemInfo.get(sysA);
      const infoB = systemInfo.get(sysB);
      if (!infoA || !infoB) continue;

      const dx = infoB.posMM.x - infoA.posMM.x;
      const dy = infoB.posMM.y - infoA.posMM.y;
      const dz = infoB.posMM.z - infoA.posMM.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (!systemConnections.has(sysA)) systemConnections.set(sysA, []);
      systemConnections.get(sysA).push({ otherSystem: sysB, dx, dy, dz, distance });

      if (!systemConnections.has(sysB)) systemConnections.set(sysB, []);
      systemConnections.get(sysB).push({ otherSystem: sysA, dx: -dx, dy: -dy, dz: -dz, distance });
    }
  }

  // ── Assign male / female ends ───────────────────────────────────────
  const maleMap = assignMaleFemale(systemConnections);

  // ── Generate meshes ─────────────────────────────────────────────────
  const zip = new JSZip();
  const starsFolder = zip.folder('stars');
  let starCount = 0;
  let maleCount = 0;
  let femaleCount = 0;

  for (const [sys, info] of systemInfo) {
    const radius = getExportRadius(info.star);

    // Sphere at origin
    const sphereTris = buildSphereTriangles(0, 0, 0, radius, 32, 32);
    let csgResult = CSG.fromTriangles(sphereTris);

    // Connection tubes with pin/socket
    const conns = systemConnections.get(sys);
    const tubeDirs = []; // unit vectors for tag placement avoidance

    if (conns && conns.length > 0) {
      for (const conn of conns) {
        const [nx, ny, nz] = vecNormalise(conn.dx, conn.dy, conn.dz);
        tubeDirs.push([nx, ny, nz]);

        // Determine male or female for this end
        const pair = sys < conn.otherSystem
          ? `${sys}|${conn.otherSystem}`
          : `${conn.otherSystem}|${sys}`;
        const isMale = maleMap.get(pair) === sys;

        const halfTube = isMale
          ? buildHalfTubeMaleCSG(nx, ny, nz, conn.distance)
          : buildHalfTubeFemaleCSG(nx, ny, nz, conn.distance);

        csgResult = csgResult.union(halfTube);
        if (isMale) maleCount++; else femaleCount++;
      }
    }

    // Convert CSG result to triangles
    const meshTris = csgResult.toTriangles();

    // Name tag (appended as raw triangles — overlapping geometry is fine
    // for slicers which auto-union shells)
    const tagDir = findTagDirection(tubeDirs);
    const tagTris = buildTagTriangles(sys, tagDir, radius);

    const allTris = meshTris.concat(tagTris);
    const stlBuffer = trianglesToBinarySTL(allTris);
    const filename = `${sanitizeFilename(sys)}.stl`;
    starsFolder.file(filename, stlBuffer);
    starCount++;
  }

  // ── Download ZIP ────────────────────────────────────────────────────
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'star_map_3d_print_kit.zip';
  link.click();
  URL.revokeObjectURL(url);

  console.log(
    `3D-print kit exported – ${starCount} stars ` +
    `(${maleCount} male + ${femaleCount} female connectors).`
  );
}
