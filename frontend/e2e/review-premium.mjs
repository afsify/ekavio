// Sanitized local QA contact sheets; never business records or private auth traces.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const directory = resolve('test-results/premium-ui');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
  async function sheet(name, files) {
    const cards = await Promise.all(files.map(async file => `<section><h2>${file}</h2><img alt="${file}" src="data:image/png;base64,${(await readFile(resolve(directory, file + '.png'))).toString('base64')}"></section>`));
    await page.setContent(`<style>body{margin:8px;background:#e2e8f0;font:14px sans-serif}main{display:grid;grid-template-columns:repeat(3,580px);gap:10px}h2{font-size:13px}img{width:580px;height:460px;object-fit:contain;object-position:top;display:block}</style><main>${cards.join('')}</main>`);
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.screenshot({ path: resolve(directory, name + '.png'), fullPage: true });
  }
  for (const width of [320, 360, 390, 430, 768, 1024, 1440, 1920]) {
    await sheet(`review-${width}`, ['dashboard','navigation','customization','account'].flatMap(state => ['light','dark','system'].map(theme => `${width}-${theme}-${state}`)));
  }
  for (const width of [390, 768, 1440]) {
    await sheet(`domains-${width}`, ['customers','queue-management','settings','crm'].flatMap(state => ['light','dark','system'].map(theme => `${width}-${theme}-${state}`)));
  }
  console.log('11 contact sheets created; original viewport/full-page captures retained.');
} finally { await browser.close(); }
