import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { validateManifestFiles, validateStarBatch } from '../src/data/dataValidation.js';
import { normalizeStarRecord } from '../src/data/loaders/loadStarData.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PREPROCESSED_DATA_DIR = 'data/preprocessed';
const sourceManifestPath = join(root, 'data', 'manifest.json');
const targetDir = join(root, PREPROCESSED_DATA_DIR);
const targetManifestPath = join(targetDir, 'manifest.json');

function stableStringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function hashText(text) {
  return createHash('sha256').update(text).digest('hex');
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

function getPreprocessedFileName(sourceFile) {
  return sourceFile.replace(/\.json$/i, '.normalized.json');
}

async function main() {
  const sourceManifest = await readJson(sourceManifestPath);
  const sourceFiles = validateManifestFiles(sourceManifest, 'data/manifest.json');
  await mkdir(targetDir, { recursive: true });

  const generatedFiles = [];
  let totalStars = 0;

  for (const sourceFile of sourceFiles) {
    const sourcePath = join(root, 'data', sourceFile);
    const sourceText = await readFile(sourcePath, 'utf8');
    const batch = validateStarBatch(JSON.parse(sourceText), `data/${sourceFile}`);
    const normalized = batch.map(normalizeStarRecord);
    const targetFile = getPreprocessedFileName(sourceFile);
    const targetPath = join(targetDir, targetFile);
    const text = stableStringify(normalized);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, text);
    generatedFiles.push({
      file: targetFile,
      source: `../${sourceFile}`,
      sourceSha256: hashText(sourceText),
      sha256: hashText(text),
      records: normalized.length
    });
    totalStars += normalized.length;
  }

  const manifest = {
    version: 1,
    generatedBy: 'scripts/buildPreprocessedData.mjs',
    sourceManifest: '../manifest.json',
    totalStars,
    files: generatedFiles
  };
  await writeFile(targetManifestPath, stableStringify(manifest));
  console.log(`Generated ${generatedFiles.length} preprocessed star files with ${totalStars} stars.`);
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
