// Runs before the normal browser suite, after CI builds and installs Chromium.
// Can also run explicitly against production assets. No database or demo access.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dist = path.resolve(fileURLToPath(new URL('../frontend/dist/', import.meta.url)));
const frontend = createRequire(new URL('../frontend/package.json', import.meta.url));
const { chromium } = frontend('@playwright/test');

test('production manifest, registration and emitted bundles preserve PWA boundaries', async () => {
  const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.webmanifest'), 'utf8'));
  assert.equal(manifest.name, 'EkaVio'); assert.equal(manifest.id, '/');
  assert.equal(manifest.start_url, '/'); assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone'); assert.equal(manifest.icons.length, 4);
  for (const icon of manifest.icons) await readFile(path.join(dist, icon.src));
  const html = await readFile(path.join(dist, 'index.html'), 'utf8');
  assert.match(html, /rel="manifest"/); assert.match(html, /registerSW\.js/);
  assert.match(await readFile(path.join(dist, 'registerSW.js'), 'utf8'), /serviceWorker\.register/);
  const sw = await readFile(path.join(dist, 'sw.js'), 'utf8');
  assert.match(sw, /precacheAndRoute/); assert.match(sw, /cleanupOutdatedCaches/);
  assert.match(sw, /denylist/); assert.match(sw, /socket/);
  for (const name of await readdir(path.join(dist, 'assets'))) {
    if (!name.endsWith('.js')) continue;
    const source = await readFile(path.join(dist, 'assets', name), 'utf8');
    assert.doesNotMatch(source, /deepmerge-build|function forbiddenKey|function mergeObject/);
  }
});

test('generated worker registers, controls reload, serves offline shell and never caches APIs', { timeout: 60000 }, async () => {
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (/^\/(api|socket\.io)(\/|$)/.test(pathname)) { response.writeHead(401, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); response.end('{"message":"Synthetic unauthorized"}'); return; }
      let file = path.resolve(dist, '.' + pathname);
      if (!file.startsWith(dist + path.sep) && file !== dist) { response.writeHead(403); response.end(); return; }
      if (!path.extname(file)) file = path.join(dist, 'index.html');
      const data = await readFile(file);
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' }); response.end(data);
    } catch { response.writeHead(404); response.end(); }
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    // Keep this independent of any live local/hosted API configured in the build.
    await context.route('**/api/**', route => route.fulfill({ status: 401, json: { message: 'Synthetic unauthorized' } }));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.getByRole('navigation', { name: 'Public navigation' }).waitFor();
    await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated');
    await page.reload(); await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    const state = await page.evaluate(async () => {
      await fetch('/api/pwa-synthetic-check');
      const registration = await navigator.serviceWorker.ready;
      const urls = [];
      for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) urls.push(request.url);
      return { script: registration.active.scriptURL, urls };
    });
    assert.equal(state.script, `${origin}/sw.js`);
    assert.ok(state.urls.some(url => url.includes('/index.html')));
    assert.equal(state.urls.some(url => /\/(api|socket\.io)(\/|$)/.test(new URL(url).pathname)), false);
    await context.setOffline(true); await page.reload();
    await page.getByRole('navigation', { name: 'Public navigation' }).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
  }
});
