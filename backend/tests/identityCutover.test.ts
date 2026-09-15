import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createAuthService, type IdentityRepository } from '../src/services/authService.js';
import {
  runMongoSessionRevocation,
  type LegacyMongoSessionRevocationRepository,
} from '../src/services/mongoSessionCutoverService.js';
import type { RefreshSessionManager } from '../src/services/sessionService.js';

test('Mongo session cutover revocation is dry-run by default and idempotent on apply', async () => {
  let revocable = 2;
  let mutationCalls = 0;
  const repository: LegacyMongoSessionRevocationRepository = {
    countExisting: async () => 3,
    countRevocable: async () => revocable,
    async revokeAll() {
      mutationCalls += 1;
      const changed = revocable;
      revocable = 0;
      return changed;
    },
  };
  const now = () => new Date('2026-09-15T05:30:00.000Z');

  const dryRun = await runMongoSessionRevocation({ repository, now });
  assert.deepEqual(dryRun, {
    mode: 'dry-run',
    cutoverTimestamp: '2026-09-15T05:30:00.000Z',
    existingSessions: 3,
    revocableSessions: 2,
    revokedSessions: 0,
  });
  assert.equal(mutationCalls, 0);

  assert.equal((await runMongoSessionRevocation({ repository, apply: true, now })).revokedSessions, 2);
  assert.equal((await runMongoSessionRevocation({ repository, apply: true, now })).revokedSessions, 0);
  assert.equal(mutationCalls, 2);
});

test('PostgreSQL identity failure is propagated without a Mongo fallback', async () => {
  const identities: IdentityRepository = {
    findByPhone: async () => { throw new Error('PostgreSQL unavailable'); },
    findById: async () => null,
    buildContext: async () => { throw new Error('unexpected context build'); },
  };
  let sessionCreates = 0;
  const sessions: RefreshSessionManager = {
    create: async () => { sessionCreates += 1; throw new Error('unexpected session create'); },
    rotate: async () => { throw new Error('unexpected session rotate'); },
    revoke: async () => undefined,
    revokeAllForUser: async () => undefined,
  };
  const service = createAuthService({
    identities,
    sessions,
    verifyPassword: async () => true,
    signAccessToken: () => 'token',
  });

  await assert.rejects(
    service.login({ phone: '1000', password: 'secret' }),
    /PostgreSQL unavailable/,
  );
  assert.equal(sessionCreates, 0);
});

test('runtime composition contains no Mongo identity, authorization, staff, account, or session adapter', async () => {
  const source = await readFile(
    new URL('../src/persistence/runtimePersistence.ts', import.meta.url),
    'utf8',
  );
  for (const forbidden of [
    'mongoIdentityRepository',
    'mongoAuthorizationContextRepository',
    'mongoSessionRepository',
    'mongoStaffRepository',
    'mongoAccountRepository',
  ]) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.match(source, /authority: 'postgresql'/);
  assert.match(source, /mongooseAttendanceStorageRepository/);
});
