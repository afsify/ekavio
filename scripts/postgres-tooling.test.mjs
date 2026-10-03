import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertRestoreMajorCompatible, POSTGRES_TOOLING_IMAGE } from './postgres-tooling.mjs';

test('external backup clients stay pinned and support hosted PostgreSQL 18', async () => {
  const image = /^postgres:(\d+)\.\d+-alpine\d+\.\d+@sha256:[a-f0-9]{64}$/.exec(POSTGRES_TOOLING_IMAGE);
  assert.ok(image, 'backup client must use a version and immutable manifest digest');
  assert.ok(Number(image[1]) >= 18, 'backup client must support the hosted server major');
  const backup = await readFile(new URL('./postgres-backup.mjs', import.meta.url), 'utf8');
  assert.match(backup, /input\.connectionEnvironment, POSTGRES_TOOLING_IMAGE, 'sh'/);
  assert.match(backup, /\['run', '--rm', POSTGRES_TOOLING_IMAGE, 'pg_dump', '--version'\]/);
  const compose = await readFile(new URL('../docker-compose.yml', import.meta.url), 'utf8');
  assert.match(compose, /image: postgres:17\.11-alpine3\.23@sha256:[a-f0-9]{64}/);
});

test('restore rejects newer-client dumps and unknown majors before touching a target', () => {
  assert.doesNotThrow(() => assertRestoreMajorCompatible(17, '170011'));
  assert.doesNotThrow(() => assertRestoreMajorCompatible(18, '180006'));
  assert.doesNotThrow(() => assertRestoreMajorCompatible(17, '180006'));
  assert.throws(() => assertRestoreMajorCompatible(18, '170011'), /requires a PostgreSQL 18 or newer restore target/);
  assert.throws(() => assertRestoreMajorCompatible(NaN, '180006'), /valid archive and target/);
  assert.throws(() => assertRestoreMajorCompatible(18, 'unknown'), /valid archive and target/);
});
