import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { summarizeSeats, requireSeatCapacity } from '../src/postgres/seatCapacity.js';

test('owner occupies the first of five licensed seats', () => {
  assert.deepEqual(summarizeSeats(1, 0, 5), { occupied: 1, reserved: 0, allowed: 5, available: 4, overCapacity: false });
});
test('four reservations fill the remaining seats and the sixth is rejected', () => {
  requireSeatCapacity(summarizeSeats(1, 4, 5));
  assert.throws(() => requireSeatCapacity(summarizeSeats(1, 4, 5), 1), /capacity exceeded/);
});
test('reservation conversion retains total usage', () => {
  assert.equal(summarizeSeats(1, 4, 5).available, summarizeSeats(2, 3, 5).available);
});
test('released reservation exposes exactly one seat', () => {
  assert.equal(summarizeSeats(1, 3, 5).available, 1);
});
test('null limit fails closed even for the initial member', () => {
  assert.throws(() => requireSeatCapacity(summarizeSeats(0, 0, null), 1), /not available/);
});
test('invalid commercial limits fail closed', () => {
  for (const limit of [NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => requireSeatCapacity(summarizeSeats(0, 0, limit)), /not available/);
  }
});
test('zero capacity cannot accept a seat', () => {
  assert.throws(() => requireSeatCapacity(summarizeSeats(0, 0, 0), 1), /exceeded/);
});
test('over-capacity usage is reported without a negative availability', () => {
  assert.deepEqual(summarizeSeats(6, 1, 5), { occupied: 6, reserved: 1, allowed: 5, available: 0, overCapacity: true });
});
test('expired capacity does not erase occupied counts', () => {
  const capacity = summarizeSeats(4, 1, null);
  assert.equal(capacity.occupied, 4);
  assert.equal(capacity.reserved, 1);
  assert.throws(() => requireSeatCapacity(capacity), /not available/);
});

test('historical replay is confined to the offline migration entry, never runtime services', () => {
  const root=path.resolve('src');
  const consumers=readdirSync(root,{recursive:true}).map(String).filter(file=>file.endsWith('.ts')
    && /from ['"].*sharedCoreRepository\.js['"]/.test(readFileSync(path.join(root,file),'utf8')))
    .map(file=>file.replaceAll('\\','/')).sort();
  assert.deepEqual(consumers,['postgres/shadowMigration.ts','scripts/postgresShadow.ts']);
  const script=readFileSync(path.join(root,'scripts/postgresShadow.ts'),'utf8');
  assert.match(script,/source: new MongoSharedCoreSource\(\)/);
  assert.match(script,/--recover-commercial-authority/);
});
