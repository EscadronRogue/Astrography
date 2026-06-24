import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const mode = process.argv.includes('--check') ? 'check' : 'write';

const vendorFiles = [
  {
    packageName: 'three',
    source: 'node_modules/three/build/three.module.js',
    target: 'vendor/three/three.module.js'
  },
  {
    packageName: 'jspdf',
    source: 'node_modules/jspdf/dist/jspdf.umd.min.js',
    target: 'vendor/jspdf/jspdf.umd.min.js'
  },
  {
    packageName: 'jspdf',
    source: 'node_modules/jspdf/dist/jspdf.umd.min.js.map',
    target: 'vendor/jspdf/jspdf.umd.min.js.map'
  },
  {
    packageName: 'jszip',
    source: 'node_modules/jszip/dist/jszip.min.js',
    target: 'vendor/jszip/jszip.min.js'
  }
];

function readBytes(path) {
  return readFileSync(resolve(root, path));
}

function assertNodeModulesAvailable() {
  const missing = vendorFiles
    .map(file => file.source)
    .filter(path => !existsSync(resolve(root, path)));
  if (missing.length) {
    throw new Error(
      `Missing package files:\n${missing.map(path => `- ${path}`).join('\n')}\nRun npm ci before syncing or checking vendored files.`
    );
  }
}

function buffersEqual(a, b) {
  return a.length === b.length && a.equals(b);
}

assertNodeModulesAvailable();

const outOfSync = [];

for (const file of vendorFiles) {
  const sourceBytes = readBytes(file.source);
  const targetPath = resolve(root, file.target);
  const targetExists = existsSync(targetPath);
  const targetBytes = targetExists ? readFileSync(targetPath) : null;
  const matches = targetBytes && buffersEqual(sourceBytes, targetBytes);

  if (matches) continue;

  if (mode === 'check') {
    outOfSync.push(file);
    continue;
  }

  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, sourceBytes);
  console.log(`Synced ${file.target} from ${file.packageName}`);
}

if (outOfSync.length) {
  throw new Error(
    `Vendored runtime files are out of sync:\n${outOfSync.map(file => `- ${file.target} <- ${file.source}`).join('\n')}\nRun npm run vendor:sync and commit the updated vendor files.`
  );
}

if (mode === 'check') {
  console.log(`Verified ${vendorFiles.length} vendored runtime files.`);
}
