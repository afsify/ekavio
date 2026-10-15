import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';
const source = readFileSync(new URL('../frontend/public/theme-init.js', import.meta.url), 'utf8');
function run(getItem, osDark = true) {
  const properties = new Map();
  const root = { classList: { toggle: () => {} }, dataset: {}, style: { setProperty: (key, value) => properties.set(key, value) } };
  const localStorage = { getItem, setItem: () => { throw new Error('Paint bootstrap must never write storage'); } };
  runInNewContext(source, { document: { documentElement: root }, localStorage, matchMedia: () => ({ matches: osDark }) });
  return { root, properties };
}
for (const mode of ['light', 'dark', 'system']) test(`paint-only ${mode} bootstrap preserves existing preference and never saves`, () => {
  const { root, properties } = run(() => JSON.stringify({ mode, primaryColor: '#087443' }));
  assert.equal(root.dataset.theme, mode === 'light' ? 'light' : 'dark'); assert.equal(properties.get('--color-primary'), '#087443');
  if (mode === 'system') assert.equal(run(() => JSON.stringify({ mode, primaryColor: '#087443' }), false).root.dataset.theme, 'light');
});
test('denied/invalid storage fails safely; legacy appearance works without extracting credentials', () => {
  for (const value of [null, 'invalid', JSON.stringify({ mode: 'dark', primaryColor: 'url(untrusted)' }), JSON.stringify({ token: 'synthetic-not-a-credential' })]) assert.equal(run(() => value).root.dataset.theme, 'light');
  assert.equal(run(() => { throw new Error('denied'); }).root.dataset.theme, 'light');
  assert.equal(run(key => key === 'ekavio-app-store' ? JSON.stringify({ state: { theme: { mode: 'dark', primaryColor: '#7040BC' } } }) : null).root.dataset.theme, 'dark');
});
