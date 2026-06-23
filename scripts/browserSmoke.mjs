import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { createWriteStream, existsSync } from 'node:fs';
import { basename, extname, join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const artifactsDir = join(root, 'artifacts', 'browser-smoke');

const contentTypes = new Map([
  ['.html', 'text/html;charset=utf-8'],
  ['.js', 'text/javascript;charset=utf-8'],
  ['.css', 'text/css;charset=utf-8'],
  ['.json', 'application/json;charset=utf-8'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.svg', 'image/svg+xml;charset=utf-8'],
  ['.wasm', 'application/wasm']
]);

const viewportMatrix = [
  { name: 'desktop', viewport: { width: 1440, height: 1000 } },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }
];

const canvasIds = ['map3D', 'uvMap', 'sphereMap', 'legacySphereMap', 'legacyMollweideMap'];
const defaultExports = ['export-png', 'export-pdf', 'export-svg', 'export-stl'];

function getRequestedList(envName, fallback) {
  return (process.env[envName] || fallback.join(','))
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    throw new Error('Playwright is required for browser smoke tests. Install it locally, then run npm run test:browser.');
  }
}

function isPathInsideRoot(filePath) {
  const relative = filePath.slice(root.length);
  return filePath === root || (filePath.startsWith(root) && relative.startsWith(sep));
}

function startStaticServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const filePath = resolve(root, `.${pathname}`);
      if (!isPathInsideRoot(filePath) || !existsSync(filePath)) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }

      const bytes = await readFile(filePath);
      response.writeHead(200, {
        'content-type': contentTypes.get(extname(filePath).toLowerCase()) || 'application/octet-stream'
      });
      response.end(bytes);
    } catch (error) {
      response.writeHead(500);
      response.end(error?.message || String(error));
    }
  });

  return new Promise(resolveServer => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolveServer({
        url: `http://127.0.0.1:${port}/index.html`,
        close: () => new Promise(resolveClose => server.close(resolveClose))
      });
    });
  });
}

async function waitForAppReady(page) {
  await page.goto(process.env.ASTROGRAPHY_URL || page.url(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const progress = document.getElementById('progress-bar-container');
    const label = document.getElementById('progress-bar-label');
    return progress?.classList.contains('hidden') || label?.textContent?.includes('Ready');
  }, null, { timeout: 120000 });
}

async function assertCanvasNonblank(page, canvasId) {
  const result = await page.evaluate(id => {
    const canvas = document.getElementById(id);
    if (!canvas || canvas.width < 2 || canvas.height < 2) {
      return { ok: false, reason: 'missing or zero-sized canvas' };
    }

    const copy = document.createElement('canvas');
    copy.width = Math.min(canvas.width, 96);
    copy.height = Math.min(canvas.height, 96);
    const ctx = copy.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { ok: false, reason: '2D readback unavailable' };
    ctx.drawImage(canvas, 0, 0, copy.width, copy.height);
    const { data } = ctx.getImageData(0, 0, copy.width, copy.height);
    let alphaPixels = 0;
    let variedPixels = 0;
    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3];
      if (alpha > 0) alphaPixels += 1;
      if (alpha > 0 && (data[index] !== data[0] || data[index + 1] !== data[1] || data[index + 2] !== data[2])) {
        variedPixels += 1;
      }
    }
    return {
      ok: alphaPixels > 0 && variedPixels > 0,
      reason: `alpha=${alphaPixels}, varied=${variedPixels}`
    };
  }, canvasId);

  if (!result.ok) {
    throw new Error(`${canvasId} canvas appears blank (${result.reason}).`);
  }
}

async function verifyDownload(page, buttonId, label) {
  const button = await page.$(`#${buttonId}`);
  if (!button) throw new Error(`Missing export button #${buttonId}.`);

  const downloadPromise = page.waitForEvent('download', { timeout: 90000 });
  await page.evaluate(id => document.getElementById(id)?.click(), buttonId);
  const download = await downloadPromise;
  const suggested = download.suggestedFilename();
  const outputPath = join(artifactsDir, `${label}-${suggested}`);
  await pipeline(await download.createReadStream(), createWriteStream(outputPath));
  if (!existsSync(outputPath)) throw new Error(`Download did not save: ${suggested}`);
  return basename(outputPath);
}

async function runTarget(browserType, browserName, target, baseUrl, exportButtons) {
  const browser = await browserType.launch({ headless: true });
  const context = await browser.newContext({
    viewport: target.viewport,
    isMobile: Boolean(target.isMobile),
    hasTouch: Boolean(target.hasTouch),
    acceptDownloads: true
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => consoleErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await page.screenshot({ path: join(artifactsDir, `${browserName}-${target.name}.png`), fullPage: true });

  for (const canvasId of canvasIds) {
    await assertCanvasNonblank(page, canvasId);
  }

  const savedDownloads = [];
  for (const buttonId of exportButtons) {
    savedDownloads.push(await verifyDownload(page, buttonId, `${browserName}-${target.name}`));
  }

  await browser.close();
  if (consoleErrors.length) {
    throw new Error(`${browserName}/${target.name} console errors:\n${consoleErrors.join('\n')}`);
  }
  return savedDownloads;
}

async function main() {
  const playwright = await loadPlaywright();
  await mkdir(artifactsDir, { recursive: true });

  const server = process.env.ASTROGRAPHY_URL
    ? { url: process.env.ASTROGRAPHY_URL, close: async () => {} }
    : await startStaticServer();
  const browserNames = getRequestedList('ASTROGRAPHY_BROWSERS', ['chromium', 'firefox', 'webkit']);
  const exportButtons = getRequestedList('ASTROGRAPHY_EXPORTS', defaultExports);
  if (process.env.ASTROGRAPHY_INCLUDE_STL_KIT === '1' && !exportButtons.includes('export-stl-kit')) {
    exportButtons.push('export-stl-kit');
  }

  try {
    for (const browserName of browserNames) {
      const browserType = playwright[browserName];
      if (!browserType) throw new Error(`Unknown Playwright browser: ${browserName}`);
      for (const target of viewportMatrix) {
        const downloads = await runTarget(browserType, browserName, target, server.url, exportButtons);
        console.log(`${browserName}/${target.name}: canvases nonblank, downloads=${downloads.join(', ')}`);
      }
    }
  } finally {
    await server.close();
  }
}

main().catch(error => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
