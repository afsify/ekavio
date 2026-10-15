import { test, expect } from '@playwright/test';
import { workspace } from './fixtures';
import { relationshipFixture } from '../e2e-relationships-visual/fixtures';

for (const width of [320,1024,1920]) test(`reduced motion keeps inherited account colors synchronized ${width}px`, async ({ page }) => {
  await workspace(page); await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(() => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode: 'system', primaryColor: '#087443' })));
  await page.goto('/customers'); await page.getByRole('button', { name: 'Account menu', exact: true }).click();
  for (const scheme of ['light','dark','light','dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme }); await expect(page.locator('html')).toHaveAttribute('data-theme', scheme);
    const styles = await page.locator('.account-name,.account-sheet a,.theme-mode-option:not([data-selected=true])').evaluateAll(nodes => nodes.map(node => ({ color: getComputedStyle(node).color, duration: getComputedStyle(node).transitionDuration })));
    expect(styles.length).toBe(6);
    for (const style of styles) { expect(style.duration).toBe('0s'); expect(style.color).toBe(scheme === 'dark' ? 'rgb(243, 246, 252)' : 'rgb(25, 36, 56)'); }
  }
  await page.screenshot({ path: `test-results/crm-theme/${width}-reduced-motion-account.png` });
});

for (const width of [320,1024]) for (const mode of ['light','dark','system']) test(`long workspace and account names remain usable ${width}px ${mode}`, async ({ page }) => {
  const state = await workspace(page); state.session.memberships[0].orgName = 'QA organization with an exceptionally long descriptive business and branch context name'; state.session.user.name = 'QA team member with a long account display name';
  await page.setViewportSize({ width, height: 900 }); await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(mode => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode, primaryColor: '#4F46E5' })), mode);
  await page.goto('/customers'); await expect(page.getByRole('switch', { name: 'Dark appearance' })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Account menu' }).click(); const account = page.getByRole('dialog', { name: 'Your account' });
  await expect(account.getByText(state.session.user.name, { exact: true })).toBeVisible(); await account.getByRole('radio', { name: 'Light', exact: true }).focus(); await page.keyboard.press('ArrowRight'); await expect(account.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await page.screenshot({ path: `test-results/crm-theme/${width}-${mode}-long-account.png` });
  expect(await account.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'Account menu' })).toBeFocused();
});

test('custom Lead filter preserves archived option identifiers and visibly resets both applied state and draft controls', async ({ page }) => {
  await relationshipFixture(page); const queries: URL[] = [];
  await page.route('http://127.0.0.1:5009/api/forms/lead/schema', route => route.fulfill({ json: { data: { entity: 'lead', version: 1, builtins: [], sections: [], definitions: [{ id: 'qa-category', key: 'category', label: 'QA category', field_type: 'select', status: 'active', required: false, filterable: true, options: [{ id: 'qa-current', label: 'Current', status: 'active' }, { id: 'qa-history', label: 'Historical', status: 'archived' }] }] } } }));
  await page.route('http://127.0.0.1:5009/api/crm/leads?**', route => { queries.push(new URL(route.request().url())); return route.fallback(); });
  await page.goto('/crm'); await page.getByText('Lead filters', { exact: true }).click();
  await page.getByRole('combobox', { name: 'Lead field filter', exact: true }).selectOption('category');
  await page.getByRole('combobox', { name: 'Field value', exact: true }).selectOption({ label: 'Historical (archived)' });
  await page.getByRole('button', { name: 'Apply lead field filter', exact: true }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.get('value')).toBe('qa-history'); expect(queries.at(-1)?.searchParams.get('field')).toBe('category'); expect(queries.at(-1)?.searchParams.get('limit')).toBe('20');
  await page.getByRole('button', { name: 'Remove Custom field filter', exact: true }).click();
  await expect.poll(() => queries.at(-1)?.searchParams.has('field')).toBe(false);
  await expect(page.getByRole('combobox', { name: 'Lead field filter', exact: true })).toHaveValue('');
  await expect(page.getByRole('combobox', { name: 'Field value', exact: true })).toHaveCount(0);
});

test('pipeline retains canonical archived stages, counts and the active-Lead filter', async ({ page }) => {
  const f = await relationshipFixture(page);
  await page.route('http://127.0.0.1:5009/api/crm/overview', route => route.fulfill({ json: { data: { active: 3, today: 0, overdue: 0, unassigned: 1, timezone: 'Asia/Kolkata', businessDate: '2026-10-07', stages: [{ ...f.stage, leads: 1 }, { id: 'qa-archived-stage', name: 'Legacy enquiry', status: 'archived', position: 1, leads: 2 }] } } }));
  await page.goto('/crm'); await page.getByRole('button', { name: 'pipeline', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Legacy enquiry (archived)', exact: true })).toBeVisible();
  const response = page.waitForRequest(request => request.url().includes('/crm/leads?') && new URL(request.url()).searchParams.get('stageId') === 'qa-archived-stage');
  await page.getByRole('button', { name: 'View stage Legacy enquiry', exact: true }).click(); const request = await response;
  expect(new URL(request.url()).searchParams.get('status')).toBe('active');
  await expect(page.getByRole('button', { name: 'View stage Legacy enquiry', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
test('Follow-up edit read failure is contained, retry is explicit and no versioned write is replayed', async ({ page }) => {
  const f = await relationshipFixture(page); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('http://127.0.0.1:5009/api/crm/leads/' + f.lead.id, route => route.fulfill({ status: 503, json: { message: 'QA current Lead unavailable' } }));
  await page.goto('/crm'); await page.getByRole('button', { name: 'Follow-ups', exact: true }).click(); await page.getByRole('button', { name: 'Edit follow-up', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Follow-up could not be opened', exact: true })).toBeVisible(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.unroute('http://127.0.0.1:5009/api/crm/leads/' + f.lead.id); await page.getByRole('button', { name: 'Retry Lead', exact: true }).click();
  const form = page.getByRole('dialog', { name: 'Edit follow-up' }); await expect(form.getByLabel('Follow-up subject')).toHaveValue('QA discuss the next consultation');
  expect(errors).toEqual([]);
});

for (const mode of ['light','dark','system']) test(`CRM scoped accessibility and read-only follow-ups ${mode}`, async ({ page }) => {
  await relationshipFixture(page, true); await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.addInitScript(mode => localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode, primaryColor: '#4F46E5' })), mode);
  await page.goto('/crm'); await expect(page.getByRole('heading', { name: 'Lead directory' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create lead', exact: true })).toHaveCount(0);
  const ratios = await page.locator('.crm-metric h2,.crm-metric .stat-value,.crm-lead-actions .quiet-button').evaluateAll(nodes => nodes.map(node => {
    const canvas = document.createElement('canvas').getContext('2d')!;
    const luminance = (color: string) => { canvas.clearRect(0,0,1,1); canvas.fillStyle = color; canvas.fillRect(0,0,1,1); const rgb = Array.from(canvas.getImageData(0,0,1,1).data).slice(0,3).map(value => { const s = value/255; return s <= .04045 ? s/12.92 : ((s+.055)/1.055)**2.4; }); return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722; };
    const fg = luminance(getComputedStyle(node).color);
    // Tables do not promise a .panel ancestor. Resolve the actual painted surface,
    // including translucent foreground surfaces, rather than guessing a card.
    const surfaces: string[] = []; let ancestor: Element | null = node; let opaque = false;
    while (ancestor) {
      const color = getComputedStyle(ancestor).backgroundColor; surfaces.push(color);
      canvas.clearRect(0,0,1,1); canvas.fillStyle = color; canvas.fillRect(0,0,1,1);
      if (canvas.getImageData(0,0,1,1).data[3] === 255) { opaque = true; break; }
      ancestor = ancestor.parentElement;
    }
    if (!opaque) throw new Error('No opaque ancestor surface found for contrast measurement');
    canvas.clearRect(0,0,1,1); for (const color of surfaces.reverse()) { canvas.fillStyle = color; canvas.fillRect(0,0,1,1); }
    const [red,green,blue] = Array.from(canvas.getImageData(0,0,1,1).data).slice(0,3); const bg = luminance(`rgb(${red},${green},${blue})`);
    return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);
  }));
  expect(ratios.length).toBeGreaterThanOrEqual(8); for (const ratio of ratios) expect(ratio).toBeGreaterThanOrEqual(4.5);
  const toggle = page.getByRole('switch', { name: 'Dark appearance' }); await expect(toggle).toHaveAccessibleName('Dark appearance');
  await page.getByRole('button', { name: 'View due today' }).click(); await expect(page.getByRole('button', { name: 'Complete follow-up', exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Edit follow-up', exact: true })).toHaveCount(0);
  const open = page.getByRole('button', { name: 'Open lead', exact: true }); await open.click(); const drawer = page.getByRole('dialog', { name: 'Lead details' }); await expect(drawer.getByRole('button', { name: 'Edit lead', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape'); await expect(open).toBeFocused();
});
