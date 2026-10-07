// Deterministic, self-hosted exports of our repo-native SVG. No image service.
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const mark = await readFile(path.join(root, 'public/favicon.svg'), 'utf8');
  for (const size of [192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${mark}`);
    await page.screenshot({ path: path.join(root, `public/brand/icon-${size}.png`), omitBackground: true });
  }
  await page.setContent(`<style>body{margin:0;background:#4f46e5}svg{display:block;width:70vw;height:70vh;margin:15vh 15vw}</style>${mark}`);
  await page.screenshot({ path: path.join(root, 'public/brand/icon-maskable-512.png') });
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(await readFile(path.join(root, 'public/brand/social-card.svg'), 'utf8'));
  await page.addStyleTag({ content: 'body{margin:0}svg{display:block}' });
  await page.screenshot({ path: path.join(root, 'public/brand/social-card.png') });
} finally { await browser.close(); }
