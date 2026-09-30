import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (relative: string) => readFile(new URL(relative, import.meta.url), 'utf8');

test('normal web runtime has no Mongoose, Mongo connection, or legacy identity bridge', async () => {
  const files = await Promise.all([
    source('../src/server.ts'),
    source('../src/app.ts'),
    source('../src/persistence/runtimePersistence.ts'),
    source('../src/controllers/corporateController.ts'),
    source('../src/postgres/corporateRepository.ts'),
    source('../src/services/securityAuditService.ts'),
    source('../src/postgres/auditRepository.ts'),
  ]);
  for (const text of files) {
    for (const forbidden of [
      "from 'mongoose'", 'connectDB', 'disconnectDB', 'models/ActivityLog',
      'models/ParentOrganization', 'mongoIdentities', 'models/Organization',
      'organizationToLegacy', 'userToLegacy', 'fallbackToMongo', 'dualWrite',
    ]) assert.equal(text.includes(forbidden), false, forbidden);
  }
  const server = files[0]!;
  const runtime = files[2]!;
  assert.equal(server.includes('MONGO_URI'), false);
  assert.match(server, /postgres\.query\('SELECT 1'\)/);
  assert.match(runtime, /mongoRuntimeAuthority: 'offline-only'/);
  assert.match(runtime, /corporateAuthority: 'postgresql'/);
  assert.match(runtime, /securityAuditAuthority: 'postgresql'/);
});

test('normal runtime config and Compose require PostgreSQL but not MongoDB', async () => {
  const [environment, compose, health] = await Promise.all([
    source('../src/config/env.ts'),
    source('../../docker-compose.yml'),
    source('../src/routes/healthRoutes.ts'),
  ]);
  const webSchema = environment.slice(environment.indexOf('const environmentSchema'), environment.indexOf('export interface RuntimeConfig'));
  assert.equal(webSchema.includes('MONGO_URI'), false);
  assert.match(environment, /loadLegacyToolConfig/);
  assert.match(environment, /MONGO_URI: mongoUrlSchema/);
  const backendBlock = compose.slice(compose.indexOf('  backend:'), compose.indexOf('  legacy-tools:'));
  assert.equal(backendBlock.includes('MONGO_URI'), false);
  assert.equal(backendBlock.includes('mongo:'), false);
  assert.match(compose, /mongo:\r?\n\s+profiles: \["legacy-migration"\]/);
  assert.match(compose, /legacy-tools:\r?\n\s+profiles: \["legacy-migration"\]/);
  assert.equal(health.includes('mongodb'), false);
});

test('Message, Notification, and false frontend integrations are retired without replacements', async () => {
  const [layout, socketStore, app, sidebar, corporate] = await Promise.all([
    source('../../frontend/src/components/layout/AdminLayout.tsx'),
    source('../../frontend/src/store/useSocketStore.ts'),
    source('../../frontend/src/App.tsx'),
    source('../../frontend/src/components/layout/AdminSidebar.tsx'),
    source('../../frontend/src/pages/Corporate/CorporateDashboard.tsx'),
  ]);
  for (const forbidden of [
    'NotificationBell', 'new_notification', '/notifications', 'receive_message',
    'send_message', '/chat/contacts', 'defaultParent', 'fallback subscription',
  ]) assert.equal(`${layout}\n${socketStore}\n${sidebar}\n${corporate}`.includes(forbidden), false, forbidden);
  assert.match(app, /UnavailableFeature name="Messages"/);
  assert.equal(sidebar.includes("path: '/chat'"), false);
  for (const relative of [
    '../src/models/Message.ts',
    '../src/models/Notification.ts',
    '../../frontend/src/components/layout/NotificationBell.tsx',
    '../../frontend/src/pages/Chat/ChatPage.tsx',
  ]) await assert.rejects(access(new URL(relative, import.meta.url)));
});

test('corporate frontend selects authorized canonical parents with honest states', async () => {
  const corporate = await source('../../frontend/src/pages/Corporate/CorporateDashboard.tsx');
  for (const required of [
    '/corporate/parents', 'selectedParentId', '/summary',
    'Loading authorized parent organizations', 'No parent organization is configured',
    'No organizations are linked', 'could not be loaded',
  ]) assert.ok(corporate.includes(required), required);
  for (const forbidden of ['defaultParent', '_id', 'fallbackData', 'mock']) {
    assert.equal(corporate.includes(forbidden), false, forbidden);
  }
});
