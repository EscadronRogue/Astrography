import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { createWriteStream, existsSync } from 'node:fs';
import { basename, extname, join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

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

const canvasIds = ['map3D', 'uvMap', 'sphereMap'];
const defaultExports = ['export-true-png', 'export-true-pdf', 'export-stl', 'export-uv-png', 'export-globe-png'];

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
  await page.waitForFunction(() => {
    const progress = document.getElementById('progress-bar-container');
    const label = document.getElementById('progress-bar-label');
    return progress?.classList.contains('hidden') || label?.textContent?.includes('Ready');
  }, null, { timeout: 120000 });
}

function paethPredictor(left, above, upperLeft) {
  const p = left + above - upperLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - above);
  const pc = Math.abs(p - upperLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return above;
  return upperLeft;
}

function decodePngPixels(buffer) {
  const signature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== signature) {
    throw new Error('Screenshot is not a PNG');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      const interlace = data[12];
      if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
        throw new Error(`Unsupported PNG format bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}`);
      }
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }

  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const stride = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const pixels = Buffer.alloc(height * stride);
  let inputOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset];
    inputOffset += 1;
    const rowStart = y * stride;
    const prevRowStart = rowStart - stride;

    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[inputOffset + x];
      const left = x >= bytesPerPixel ? pixels[rowStart + x - bytesPerPixel] : 0;
      const above = y > 0 ? pixels[prevRowStart + x] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? pixels[prevRowStart + x - bytesPerPixel] : 0;
      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + above;
      else if (filter === 3) value = raw + Math.floor((left + above) / 2);
      else if (filter === 4) value = raw + paethPredictor(left, above, upperLeft);
      else throw new Error(`Unsupported PNG filter ${filter}`);
      pixels[rowStart + x] = value & 255;
    }
    inputOffset += stride;
  }

  return { width, height, bytesPerPixel, pixels };
}

function measurePngVariation(buffer) {
  const { width, height, bytesPerPixel, pixels } = decodePngPixels(buffer);
  if (width < 2 || height < 2) {
    return { ok: false, reason: `tiny screenshot ${width}x${height}` };
  }

  const firstR = pixels[0];
  const firstG = pixels[1];
  const firstB = pixels[2];
  const firstA = bytesPerPixel === 4 ? pixels[3] : 255;
  let alphaPixels = 0;
  let variedPixels = 0;

  for (let index = 0; index < pixels.length; index += bytesPerPixel) {
    const alpha = bytesPerPixel === 4 ? pixels[index + 3] : 255;
    if (alpha > 0) alphaPixels += 1;
    if (
      alpha > 0 &&
      (pixels[index] !== firstR ||
        pixels[index + 1] !== firstG ||
        pixels[index + 2] !== firstB ||
        alpha !== firstA)
    ) {
      variedPixels += 1;
    }
  }

  return {
    ok: alphaPixels > 0 && variedPixels > 0,
    reason: `alpha=${alphaPixels}, varied=${variedPixels}, screenshot=${width}x${height}`
  };
}

async function assertCanvasNonblank(page, canvasId, label) {
  const canvasInfo = await page.evaluate(id => {
    const canvas = document.getElementById(id);
    if (!canvas) {
      return { ok: true, skipped: true, reason: 'canvas is not present in the current projection layout' };
    }
    const rect = canvas.getBoundingClientRect();
    const style = getComputedStyle(canvas);
    const isVisible = rect.width >= 2 && rect.height >= 2 && style.display !== 'none' && style.visibility !== 'hidden';
    if (!isVisible) {
      return { ok: true, skipped: true, reason: 'canvas is not visible in the current projection layout' };
    }
    if (canvas.width < 2 || canvas.height < 2) {
      return { ok: false, reason: 'zero-sized drawing buffer' };
    }
    return {
      ok: true,
      width: canvas.width,
      height: canvas.height
    };
  }, canvasId);

  if (!canvasInfo.ok) {
    throw new Error(`${canvasId} canvas appears blank (${canvasInfo.reason}).`);
  }
  if (canvasInfo.skipped) return false;

  const screenshotPath = join(artifactsDir, `${label}-${canvasId}.png`);
  const screenshot = await page.locator(`#${canvasId}`).screenshot({ path: screenshotPath });
  const result = measurePngVariation(screenshot);
  if (!result.ok) {
    throw new Error(`${canvasId} canvas appears blank (${result.reason}, canvas=${canvasInfo.width}x${canvasInfo.height}).`);
  }
  return true;
}

async function verifyDownload(page, buttonId, label) {
  const button = await page.$(`#${buttonId}`);
  if (!button) return null;
  const isVisible = await button.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width >= 2 && rect.height >= 2 && style.display !== 'none' && style.visibility !== 'hidden';
  });
  if (!isVisible) return null;

  const downloadPromise = page.waitForEvent('download', { timeout: 90000 });
  await page.evaluate(id => document.getElementById(id)?.click(), buttonId);
  const download = await downloadPromise;
  const suggested = download.suggestedFilename();
  const outputPath = join(artifactsDir, `${label}-${suggested}`);
  await pipeline(await download.createReadStream(), createWriteStream(outputPath));
  if (!existsSync(outputPath)) throw new Error(`Download did not save: ${suggested}`);
  return basename(outputPath);
}

async function enableDensityFilter(page) {
  await page.evaluate(() => {
    const checkbox = document.getElementById('enable-density-filter');
    if (!checkbox) throw new Error('Missing density filter checkbox');
    if (!checkbox.checked) {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await page.waitForFunction(() => document.getElementById('enable-density-filter')?.checked === true, null, { timeout: 5000 });
  await page.waitForTimeout(1500);
}

async function runTarget(browserType, browserName, target, baseUrl, exportButtons) {
  let browser;
  let context;
  let page;
  try {
    browser = await browserType.launch({ headless: true });
    context = await browser.newContext({
      viewport: target.viewport,
      isMobile: Boolean(target.isMobile),
      hasTouch: Boolean(target.hasTouch),
      acceptDownloads: true
    });
    page = await context.newPage();
  } catch (error) {
    await browser?.close?.();
    error.browserUnavailable = true;
    throw error;
  }
  const consoleErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', error => consoleErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await page.screenshot({ path: join(artifactsDir, `${browserName}-${target.name}.png`), fullPage: true });

  let validatedCanvases = 0;
  for (const canvasId of canvasIds) {
    if (await assertCanvasNonblank(page, canvasId, `${browserName}-${target.name}`)) {
      validatedCanvases += 1;
    }
  }
  if (validatedCanvases === 0) {
    throw new Error(`${browserName}/${target.name} did not expose any visible canvases to validate.`);
  }

  if (target.isMobile) {
    await enableDensityFilter(page);
    await page.screenshot({ path: join(artifactsDir, `${browserName}-${target.name}-density.png`), fullPage: true });
    let densityValidatedCanvases = 0;
    for (const canvasId of canvasIds) {
      if (await assertCanvasNonblank(page, canvasId, `${browserName}-${target.name}-density`)) {
        densityValidatedCanvases += 1;
      }
    }
    if (densityValidatedCanvases === 0) {
      throw new Error(`${browserName}/${target.name} density toggle did not expose any visible canvases to validate.`);
    }
  }

  const savedDownloads = [];
  for (const buttonId of exportButtons) {
    const savedDownload = await verifyDownload(page, buttonId, `${browserName}-${target.name}`);
    if (savedDownload) savedDownloads.push(savedDownload);
  }
  if (!savedDownloads.length) {
    throw new Error(`${browserName}/${target.name} did not expose any requested export buttons.`);
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
        try {
          const downloads = await runTarget(browserType, browserName, target, server.url, exportButtons);
          console.log(`${browserName}/${target.name}: canvases nonblank, downloads=${downloads.join(', ')}`);
        } catch (error) {
          if (error?.browserUnavailable) {
            console.warn(`${browserName}/${target.name}: skipped, browser engine unavailable (${error.message})`);
            continue;
          }
          throw error;
        }
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
