// Review sheets contain only explicit sanitized presentation captures.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const directory = resolve('test-results/polish-visual-batch4');
const states = ['public-viewport', 'login', 'login-error', 'recovery', 'recovery-status', 'onboarding', 'missing-link'];
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1740, height: 1300 } });
  for (const width of [320, 360, 390, 430, 768, 1024, 1440, 1920]) for (const theme of ['light', 'dark', 'system']) {
    const cards = await Promise.all(states.map(async state => {
      const name = `${width}-${theme}-${state}.png`;
      return `<section><h2>${name}</h2><img alt="${name}" src="data:image/png;base64,${(await readFile(resolve(directory, name))).toString('base64')}"></section>`;
    }));
    await page.setContent(`<style>body{margin:8px;background:#e2e8f0;font:14px sans-serif}main{display:grid;grid-template-columns:repeat(4,420px);gap:10px}h2{font-size:13px}img{width:420px;height:580px;object-fit:contain;object-position:top;display:block}</style><main>${cards.join('')}</main>`);
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.screenshot({ path: resolve(directory, `matrix-${width}-${theme}.png`), fullPage: true });
  }
  console.log('Rendered 24 matrices of seven public/account states; originals retained.');
} finally { await browser.close(); }
