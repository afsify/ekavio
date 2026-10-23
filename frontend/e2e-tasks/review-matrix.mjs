// Local sanitized synthetic screenshots only. No application/API access.
import { chromium } from '@playwright/test';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
const directory = resolve(process.argv[2] ?? 'test-results/tasks-screenshots');
const attentionDirectory = process.argv[4] ? resolve(process.argv[4]) : directory;
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
  for (const width of [320, 360, 390, 430, 768, 1024, 1440, 1920]) {
    const cards = [];
    for (const theme of ['light', 'dark', 'system']) for (const state of ['my-tasks', 'team-tasks', 'filters', 'detail-history', 'history', 'edit', 'edit-schedule', 'create', 'create-assignment', 'unsaved', 'conflict', 'read-only', 'empty', 'error', 'overdue-view', 'overdue', 'completed-view', 'completed', ...(width < 1024 ? ['navigation'] : [])]) {
      const name = `${width}-${theme}-${state}.png`, root = ['overdue-view', 'overdue', 'completed-view', 'completed'].includes(state) ? attentionDirectory : directory, file = resolve(root, name);
      await access(file); // Missing captures fail; never silently skip states.
      cards.push(`<section><h2>${name}</h2><img alt="${name}" src="data:image/png;base64,${(await readFile(file)).toString('base64')}"></section>`);
    }
    await page.setContent(`<style>body{margin:10px;background:#cbd5e1;color:#172438;font:14px sans-serif}main{display:grid;grid-template-columns:repeat(4,435px);gap:10px}h2{font-size:13px;margin:4px}img{width:435px;height:360px;object-fit:contain;object-position:top;display:block;background:#e2e8f0}section{background:white;padding:4px}</style><main>${cards.join('')}</main>`);
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.screenshot({ path: resolve(directory, `review-${width}.png`), fullPage: true });
  }
  if (process.argv[3]) {
    const before = resolve(process.argv[3]);
    const pairs = [[390, 'light', 'my-tasks', 'before-mobile'], [1440, 'light', 'team-tasks', 'before-desktop'], [390, 'dark', 'detail-history', 'before-themes'], [1440, 'dark', 'create', 'before-themes'], [390, 'system', 'edit', 'before-themes'], [1440, 'system', 'read-only', 'before-themes']];
    const cards = [];
    for (const [width, theme, state, folder] of pairs) for (const [label, root] of [['Before', resolve(before, folder)], ['After', directory]]) {
      const name = `${width}-${theme}-${state}.png`;
      cards.push(`<section><h2>${label}: ${name}</h2><img alt="${label}: ${name}" src="data:image/png;base64,${(await readFile(resolve(root, name))).toString('base64')}"></section>`);
    }
    await page.setContent(`<style>body{margin:10px;background:#cbd5e1;color:#172438;font:14px sans-serif}main{display:grid;grid-template-columns:repeat(4,435px);gap:10px}h2{font-size:13px;margin:4px}img{width:435px;height:600px;object-fit:contain;object-position:top;display:block;background:#e2e8f0}section{background:white;padding:4px}</style><main>${cards.join('')}</main>`);
    await page.locator('img').evaluateAll(images => Promise.all(images.map(image => image.decode())));
    await page.screenshot({ path: resolve(directory, 'before-after.png'), fullPage: true });
  }
  console.log('Eight complete contact sheets generated. Review originals for fine detail.');
} finally { await browser.close(); }
