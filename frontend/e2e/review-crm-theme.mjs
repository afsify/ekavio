// Sanitized local QA captures only. Originals remain unchanged.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve('test-results');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
  for (const width of [320,360,390,430,768,1024,1440,1920]) for (const [group, states] of [['records', ['directory','detail','pipeline','followup-record']], ['appearance', ['account','appearance']]]) {
    const cards = await Promise.all(states.flatMap(state => ['light','dark','system'].map(async mode => {
      const name = `${width}-${mode}-${state}`;
      const data = await readFile(resolve(root, 'matrix-motion-final/test-results/crm-theme', name + '.png'));
      return `<section><h2>${name}</h2><img alt="${name}" src="data:image/png;base64,${data.toString('base64')}"></section>`;
    })));
    await page.setContent(`<style>body{margin:8px;background:#e2e8f0;font:14px sans-serif}main{display:grid;grid-template-columns:repeat(3,580px);gap:10px}h2{font-size:13px}img{width:580px;height:560px;object-fit:contain;object-position:top;display:block}</style><main>${cards.join('')}</main>`);
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.screenshot({ path: resolve(root, `review-${group}-${width}.png`), fullPage: true });
  }
  console.log('16 CRM/appearance review sheets created; original sanitized captures retained.');
} finally { await browser.close(); }
