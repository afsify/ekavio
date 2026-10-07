import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
test('generated metadata, public-only sitemap, original icons and PWA branding', async () => {
  const html = await readFile('dist/index.html', 'utf8');
  expect(html).toContain('EkaVio — Your daily business, one workspace');
  expect(html).toContain('https://ekavio.afsify.com/brand/social-card.png');
  expect(html).not.toContain('%PUBLIC_APP_URL%');
  const manifest = JSON.parse(await readFile('dist/manifest.webmanifest', 'utf8'));
  expect(manifest.name).toBe('EkaVio'); expect(manifest.background_color).toBe('#f5f7fb');
  expect(manifest.icons).toHaveLength(4); expect(manifest.icons.find((icon: { purpose: string }) => icon.purpose === 'maskable').sizes).toBe('512x512');
  for (const [file, width, height] of [['icon-192.png', 192, 192], ['icon-512.png', 512, 512], ['icon-maskable-512.png', 512, 512], ['social-card.png', 1200, 630]] as const) {
    const png = await readFile('public/brand/' + file); expect(png.readUInt32BE(16)).toBe(width); expect(png.readUInt32BE(20)).toBe(height);
  }
  const sitemap = await readFile('dist/sitemap.xml', 'utf8'); expect(sitemap).toContain('/privacy'); expect(sitemap).not.toMatch(/onboarding|invitation|login|dashboard|commercial/);
  const robots = await readFile('dist/robots.txt', 'utf8'); expect(robots).toContain('Disallow: /onboarding'); expect(robots).toContain('Sitemap: https://ekavio.afsify.com/sitemap.xml');
});
