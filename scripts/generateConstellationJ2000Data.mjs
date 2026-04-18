import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const BOUNDARIES_URL = 'https://pbarbier.com/constellations/bound_in_20.txt';
const CENTERS_URL = 'https://pbarbier.com/constellations/centers_20.txt';

function normalizeHours(hours) {
  let value = hours % 24;
  if (value < 0) value += 24;
  return value;
}

function formatSigned(value, digits) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function formatHours(hours) {
  return normalizeHours(hours).toFixed(7);
}

function pointKey(point) {
  return `${formatHours(point.raHours)}|${formatSigned(point.decDeg, 6)}`;
}

function undirectedEdgeKey(a, b) {
  const first = pointKey(a);
  const second = pointKey(b);
  return first < second ? `${first}||${second}` : `${second}||${first}`;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function parseBoundaryPolygons(text) {
  const polygons = new Map();
  const order = [];
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);

  for (const line of lines) {
    const [raHoursRaw, decDegRaw, constellation] = line.split(/\s+/);
    const raHours = Number.parseFloat(raHoursRaw);
    const decDeg = Number.parseFloat(decDegRaw);
    if (!Number.isFinite(raHours) || !Number.isFinite(decDeg) || !constellation) {
      throw new Error(`Unable to parse boundary line: ${line}`);
    }
    if (!polygons.has(constellation)) {
      polygons.set(constellation, []);
      order.push(constellation);
    }
    polygons.get(constellation).push({ raHours, decDeg });
  }

  return order.map(constellation => ({
    constellation,
    points: polygons.get(constellation)
  }));
}

function buildSharedBoundarySegments(polygons) {
  const edges = new Map();
  let order = 1;

  for (const { constellation, points } of polygons) {
    if (!Array.isArray(points) || points.length < 2) continue;
    for (let i = 0; i < points.length; i++) {
      const start = points[i];
      const end = points[(i + 1) % points.length];
      const edgeKey = undirectedEdgeKey(start, end);
      const existing = edges.get(edgeKey);

      if (!existing) {
        edges.set(edgeKey, {
          start,
          end,
          const1: constellation,
          const2: null,
          order: order++
        });
        continue;
      }

      if (existing.const1 !== constellation && existing.const2 !== constellation) {
        existing.const2 = constellation;
      }
    }
  }

  const missingAdjacent = Array.from(edges.values()).filter(edge => !edge.const2);
  if (missingAdjacent.length) {
    const preview = missingAdjacent
      .slice(0, 5)
      .map(edge => `${pointKey(edge.start)} -> ${pointKey(edge.end)} (${edge.const1})`)
      .join(', ');
    throw new Error(`Found ${missingAdjacent.length} boundary edges without a second adjacent constellation. Examples: ${preview}`);
  }

  return Array.from(edges.values()).sort((a, b) => a.order - b.order);
}

function buildBoundaryText(edges) {
  return edges.map((edge, index) => {
    const startId = String(index + 1).padStart(3, '0');
    const endId = String(index + 2).padStart(3, '0');
    return [
      `${startId}:${endId}`,
      'J2',
      formatHours(edge.start.raHours),
      formatSigned(edge.start.decDeg, 6),
      formatHours(edge.end.raHours),
      formatSigned(edge.end.decDeg, 6),
      edge.const1,
      edge.const2
    ].join(' ');
  }).join('\n') + '\n';
}

function parseCenters(text, fullNamesByAbbrev) {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const centers = [];

  for (const line of lines) {
    const parts = line.split(/\s+/);
    if (parts.length < 5) {
      throw new Error(`Unable to parse center line: ${line}`);
    }

    const abbrev = parts[4];
    if (!fullNamesByAbbrev[abbrev]) {
      continue;
    }

    const raHours = Number.parseFloat(parts[0]);
    const decDeg = Number.parseFloat(parts[1]);
    if (!Number.isFinite(raHours) || !Number.isFinite(decDeg)) {
      throw new Error(`Unable to parse center coordinates: ${line}`);
    }

    centers.push({
      name: fullNamesByAbbrev[abbrev],
      abbrev,
      raDeg: normalizeHours(raHours) * 15,
      decDeg,
      epoch: 'J2000'
    });
  }

  return centers;
}

async function main() {
  const fullNamesPath = path.join(projectRoot, 'constellation_full_names.json');
  const fullNamesByAbbrev = JSON.parse(await fs.readFile(fullNamesPath, 'utf8'));

  const [boundarySource, centerSource] = await Promise.all([
    fetchText(BOUNDARIES_URL),
    fetchText(CENTERS_URL)
  ]);

  const polygons = parseBoundaryPolygons(boundarySource);
  const boundaryEdges = buildSharedBoundarySegments(polygons);
  const centers = parseCenters(centerSource, fullNamesByAbbrev);

  const boundaryTextPath = path.join(projectRoot, 'constellation_boundaries.txt');
  const centerJsonPath = path.join(projectRoot, 'constellation_center.json');

  await fs.writeFile(boundaryTextPath, buildBoundaryText(boundaryEdges), 'utf8');
  await fs.writeFile(centerJsonPath, `${JSON.stringify(centers, null, 2)}\n`, 'utf8');

  console.log(`Generated ${polygons.length} J2000 constellation polygons.`);
  console.log(`Generated ${boundaryEdges.length} shared J2000 boundary segments.`);
  console.log(`Generated ${centers.length} J2000 constellation centers.`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
