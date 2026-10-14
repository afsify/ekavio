// Only sanitized presentation captures. Private authenticated outputs excluded.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const directory = resolve('test-results/customer-experience');
const recovery = process.env.CUSTOMER_REVIEW_RECOVERY === '1';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
  for (const width of [320,360,390,430,768,1024,1440,1920]) {
    const states = recovery ? ['expanded-filters','discard-confirmation'] : ['directory','detail','create','edit'];
    const files = states.flatMap(state => ['light','dark','system'].map(mode => `${width}-${mode}-${state}`));
    const cards = await Promise.all(files.map(async file => {
      const phase = recovery ? 'recovery' : file.endsWith('-directory') || file.endsWith('-detail') ? 'final-actions' : 'final';
      return `<section><h2>${file}</h2><img alt="${file}" src="data:image/png;base64,${(await readFile(resolve(directory, phase, file + '.png'))).toString('base64')}"></section>`;
    }));
    await page.setContent(`<style>body{margin:8px;background:#e2e8f0;font:14px sans-serif}main{display:grid;grid-template-columns:repeat(3,580px);gap:10px}h2{font-size:13px}img{width:580px;height:560px;object-fit:contain;object-position:top;display:block}</style><main>${cards.join('')}</main>`);
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.screenshot({ path: resolve(directory, `review-${recovery ? 'recovery' : 'final'}-${width}.png`), fullPage: true });
  }
  console.log('8 Customer review sheets created; original captures retained.');
} finally { await browser.close(); }
