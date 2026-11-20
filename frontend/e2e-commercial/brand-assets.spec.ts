import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('generated metadata, public-only sitemap, original icons and PWA branding', async () => {
  const html = await readFile('dist/index.html', 'utf8');
  expect(html).toContain('EkaVio — Your daily business, one workspace');
  expect(html).toContain('https://ekavio.afsify.com/brand/social-card.png');
  expect(html).not.toContain('%PUBLIC_APP_URL%');
  const manifest = JSON.parse(await readFile('dist/manifest.webmanifest', 'utf8'));
  expect(manifest.name).toBe('EkaVio'); expect(manifest.background_color).toBe('#f8fafc');
  expect(manifest.icons).toHaveLength(4); expect(manifest.icons.find((icon: { purpose: string }) => icon.purpose === 'maskable').sizes).toBe('512x512');
  for (const [file, width, height] of [['icon-192.png', 192, 192], ['icon-512.png', 512, 512], ['icon-maskable-512.png', 512, 512], ['social-card.png', 1200, 630]] as const) {
    const png = await readFile('public/brand/' + file); expect(png.readUInt32BE(16)).toBe(width); expect(png.readUInt32BE(20)).toBe(height);
  }
  const sitemap = await readFile('dist/sitemap.xml', 'utf8'); expect(sitemap).toContain('/privacy'); expect(sitemap).not.toMatch(/onboarding|invitation|login|dashboard|commercial/);
  const robots = await readFile('dist/robots.txt', 'utf8'); expect(robots).toContain('Disallow: /onboarding'); expect(robots).toContain('Sitemap: https://ekavio.afsify.com/sitemap.xml');
});

test('original folded-E exports retain small-size geometry on light and dark surfaces', async ({ page }, info) => {
  const mark = await readFile('public/favicon.svg', 'utf8');
  const component = await readFile('src/components/brand/Brand.tsx', 'utf8');
  const outline = 'M10 10H30L25 15H15V18H27L22 23H15V26H30L25 31H10V10Z';
  expect(mark).toContain(outline); expect(component).toContain(outline);
  await page.setViewportSize({ width: 800, height: 280 });
  await page.setContent(`<style>body{margin:0;font:14px system-ui}section{display:flex;align-items:center;gap:36px;padding:32px;height:140px;box-sizing:border-box}figure{margin:0}svg{display:block;width:var(--size);height:var(--size)}figcaption{margin-top:8px}</style>${['#f8fafc', '#0f172a'].map((color, index) => `<section style="background:${color};color:${index ? '#f1f5f9' : '#0f172a'}">${[16, 24, 32, 64].map(size => `<figure style="--size:${size}px">${mark}<figcaption>${size}px</figcaption></figure>`).join('')}</section>`).join('')}`);
  await expect(page.locator('svg')).toHaveCount(8);
  await page.screenshot({ path: info.outputPath('brand-small-sizes.png') });
});
