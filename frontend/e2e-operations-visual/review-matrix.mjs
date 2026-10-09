// Render contact sheets from sanitized screenshot evidence, never private fixtures.
// Run after test:e2e:operations-visual. Originals remain available for full-size QA.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const directory = resolve('test-results/operations-visual');
const domains = ['queue', 'appointments', 'attendance', 'ledger', 'inventory'];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1664, height: 1000 } });
  for (const width of [320, 360, 390, 430, 768, 1024, 1440, 1920]) for (const theme of ['light', 'dark', 'system']) {
    const cards = await Promise.all(domains.map(async domain => {
      const name = `${domain}-${width}-${theme}-loaded.png`;
      const png = (await readFile(resolve(directory, name))).toString('base64');
      return `<section><h2>${domain} · ${width}px · ${theme}</h2><img alt="${name}" src="data:image/png;base64,${png}"></section>`;
    }));
    await page.setContent(`<style>body{margin:8px;background:#e2e8f0;font:14px sans-serif}main{display:grid;grid-template-columns:repeat(5,320px);gap:12px}h2{font-size:14px}img{width:320px;height:auto;display:block}</style><main>${cards.join('')}</main>`);
    await page.locator('img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
    await page.screenshot({ path: resolve(directory, `matrix-${width}-${theme}.png`), fullPage: true });
  }
  console.log('Rendered 24 sanitized contact sheets; inspect originals for detailed control/text review.');
} finally { await browser.close(); }
