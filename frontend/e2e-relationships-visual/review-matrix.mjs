// Render sanitized loaded evidence only. Originals remain available for text QA.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const directory = resolve('test-results/relationships-visual');
const journeys = ['crm-overview','crm-leads','pipeline','lead-form','lead-review','lead-detail','followup-form','followup-review','conversion-review','followups','suppliers','supplier-detail','supplier-form','purchase-orders','po-editor','po-review','po-detail','partial-receipt','receipt-confirmation','receipt-history'];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
  for (const width of [320,360,390,430,768,1024,1440,1920]) for (const theme of ['light','dark','system']) {
    const cards = await Promise.all(journeys.map(async name => {
      const filename = `${width}-${theme}-${name}.png`;
      const png = (await readFile(resolve(directory, filename))).toString('base64');
      return `<section><h2>${name} · ${width}px · ${theme}</h2><img alt="${filename}" src="data:image/png;base64,${png}"></section>`;
    }));
    await page.setContent(`<style>body{margin:8px;background:#e2e8f0;font:14px sans-serif}main{display:grid;grid-template-columns:repeat(6,288px);gap:10px}h2{font-size:13px}img{width:288px;height:450px;object-fit:contain;object-position:top;display:block}</style><main>${cards.join('')}</main>`);
    await page.locator('img').evaluateAll(images => Promise.all(images.map(img => img.decode())));
    await page.screenshot({ path: resolve(directory, `matrix-${width}-${theme}.png`), fullPage: true });
  }
  console.log('Rendered 24 contact sheets, each containing 20 sanitized loaded journeys. Inspect originals for detailed text/control QA.');
} finally { await browser.close(); }
