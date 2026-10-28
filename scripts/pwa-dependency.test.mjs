import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const frontend = createRequire(new URL('../frontend/package.json', import.meta.url));
const resolver = createRequire(frontend.resolve('@rollup/plugin-node-resolve'));
// Test the dependency actually resolved by Workbox's Rollup plugin, not a spare copy.
const merge = resolver('deepmerge');
const malicious = () => JSON.parse('{"__proto__":{"uxPoisoned":true},"constructor":{"prototype":{"uxPoisoned":true}},"prototype":{"uxPoisoned":true},"safe":7}');
function safe(value) {
  assert.equal(Object.getPrototypeOf(value), Object.prototype);
  assert.equal(value.uxPoisoned, undefined);
  assert.equal(({}).uxPoisoned, undefined);
  for (const key of ['__proto__', 'constructor', 'prototype']) assert.equal(Object.hasOwn(value, key), false);
}

test('override resolves the reviewed build fork and cannot silently gain runtime consumers', () => {
  assert.equal(resolver('deepmerge/package.json').name, '@ekavio/deepmerge-build');
  assert.equal(resolver('deepmerge/package.json').version, '4.3.1-ekavio.1');
  const lock = JSON.parse(readFileSync(new URL('../frontend/package-lock.json', import.meta.url), 'utf8'));
  const consumers = Object.entries(lock.packages).filter(([name, entry]) => name && entry.dependencies?.deepmerge);
  assert.deepEqual(consumers.map(([name]) => name), ['node_modules/@rollup/plugin-node-resolve']);
  assert.equal(consumers[0][1].dev, true);
  assert.equal(lock.packages['vendor/deepmerge-build'].dev, true);
});
test('forbidden target and source getters are not evaluated', () => {
  const payload = {};
  for (const key of ['__proto__', 'constructor', 'prototype']) Object.defineProperty(payload, key, { enumerable: true, get() { throw new Error('Forbidden getter ran'); } });
  safe(merge(payload, {})); safe(merge({}, payload));
});
test('throwing target membership inspection fails closed', () => {
  const target = new Proxy({}, { has() { throw new Error('Uninspectable key'); } });
  assert.deepEqual(merge(target, { injected: true }), {});
});

test('null-prototype target cannot poison the merged object', () => { const value = merge(Object.create(null), malicious()); safe(value); assert.equal(value.safe, 7); });
test('nested null and primitive placeholders cannot poison returned objects', () => {
  for (const initial of [null, undefined, false, 0, '']) {
    const value = merge({ session: initial }, { session: malicious() }); safe(value.session); assert.equal(value.session.safe, 7);
  }
});
test('target-copy loop rejects poisoned own keys before assigning them', () => { const value = merge(malicious(), {}); safe(value); assert.equal(value.safe, 7); });
test('nested objects and arrays reject dangerous keys on both inputs', () => {
  const value = merge({ rows: [malicious()], settings: malicious() }, { rows: [malicious()], settings: malicious() });
  safe(value.settings); value.rows.forEach(safe);
});
test('inherited source properties do not become merged configuration', () => {
  const input = Object.assign(Object.create({ inherited: true }), { own: 1 });
  assert.deepEqual(merge({}, input), { own: 1 });
});
test('normal arrays and nested objects clone without changing inputs', () => {
  const left = { extensions: ['.mjs', '.js'], nested: { left: true } }, right = { extensions: ['.json'], nested: { right: true } };
  const value = merge(left, right);
  assert.deepEqual(value, { extensions: ['.mjs', '.js', '.json'], nested: { left: true, right: true } });
  value.extensions.push('.node'); assert.equal(left.extensions.length, 2); assert.equal(right.extensions.length, 1);
});
test('enumerable symbols, dates, regex and documented clone/custom options remain compatible', () => {
  const symbol = Symbol('config'), date = new Date(0), regex = /module/;
  const value = merge({}, { [symbol]: { valid: true }, date, regex });
  assert.deepEqual(value[symbol], { valid: true }); assert.equal(value.date, date); assert.equal(value.regex, regex);
  const child = { nested: true }; assert.equal(merge({}, { child }, { clone: false }).child, child);
  assert.deepEqual(merge([1], [2], { arrayMerge: (_, source) => source }), [2]);
  assert.deepEqual(merge({ n: [1] }, { n: [2] }, { customMerge: key => key === 'n' ? () => [3] : undefined }), { n: [3] });
  assert.deepEqual(merge.all([{ a: 1 }, { b: 2 }]), { a: 1, b: 2 }); assert.throws(() => merge.all({}), /array/);
});
test('Rollup resolver defaults and plugin construction remain compatible', () => {
  const { nodeResolve, DEFAULTS } = frontend('@rollup/plugin-node-resolve');
  assert.deepEqual(DEFAULTS.extensions, ['.mjs', '.js', '.json', '.node']);
  assert.equal(Object.isFrozen(DEFAULTS.extensions), true);
  assert.equal(nodeResolve().name, 'node-resolve');
});
