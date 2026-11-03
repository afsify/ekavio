import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

type Lock = { packages: Record<string, { version?: string }> };
const backend = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8')) as Lock;
const frontend = JSON.parse(readFileSync(new URL('../../frontend/package-lock.json', import.meta.url), 'utf8')) as Lock;
function atLeast(lock: Lock, name: string, minimum: string) {
  const actual = lock.packages['node_modules/' + name]?.version;
  assert.ok(actual && /^\d+\.\d+\.\d+$/.test(actual), 'Expected a stable locked version of ' + name);
  const current = actual.split('.').map(Number), floor = minimum.split('.').map(Number);
  const firstDifference = current.findIndex((part, index) => part !== floor[index]);
  assert.ok(firstDifference === -1 || current[firstDifference]! > floor[firstDifference]!, `${name} ${actual} is below security floor ${minimum}`);
}

test('backend dependency locks retain the verified security fixes', () => {
  atLeast(backend, 'body-parser', '2.4.0');
  atLeast(backend, 'fast-uri', '3.1.9');
  atLeast(backend, 'nodemailer', '10.1.4');
  atLeast(backend, 'zod', '4.6.6');
});
test('frontend dependency locks retain the same parser/validator and build serialization fixes', () => {
  atLeast(frontend, 'fast-uri', '3.1.9');
  atLeast(frontend, 'zod', '4.6.6');
  atLeast(frontend, 'serialize-javascript', '7.1.3');
});
test('Nodemailer keeps a quoted greater-than in the actual recipient domain', () => {
  // Offline parser regression for GHSA-85x2-q946-cp5h; no email or socket is opened.
  const require = createRequire(import.meta.url);
  const parse = require('nodemailer/lib/addressparser') as (value: string) => { address: string }[];
  const addresses = parse('<"a@evil.example>"@good.example>');
  assert.equal(addresses.length, 1);
  assert.ok(addresses[0]!.address.endsWith('@good.example'));
  assert.ok(!addresses[0]!.address.endsWith('@evil.example'));
});
