import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import express, { type NextFunction, type Response } from 'express';
import { requirePermission, type AuthenticatedRequest } from '../src/middlewares/authMiddleware.js';
import {
  formatInrMinor,
  legacyNumberToInrMinor,
  parseInrDecimalToMinor,
  POSTGRES_BIGINT_MAX,
} from '../src/domains/customerDues/money.js';
import {
  createCustomerDueEntrySchema,
  customerDueListQuerySchema,
  reverseCustomerDueEntrySchema,
} from '../src/schemas/customerDuesSchemas.js';
import { permissions, type Permission } from '../src/services/authorizationPolicy.js';

test('Customer Dues money conversion is exact, string-based, and BIGINT-safe', () => {
  assert.equal(parseInrDecimalToMinor('1.00'), 100n);
  assert.equal(parseInrDecimalToMinor('0.01'), 1n);
  assert.equal(parseInrDecimalToMinor('1500.5'), 150050n);
  assert.equal(parseInrDecimalToMinor('92233720368547758.07'), POSTGRES_BIGINT_MAX);
  assert.equal(formatInrMinor(150050n), '1500.50');
  assert.equal(formatInrMinor(-30000n), '-300.00');
  assert.equal(legacyNumberToInrMinor(1500), 150000n);
  assert.equal(legacyNumberToInrMinor(1500.5), 150050n);

  for (const invalid of [
    '', '0', '0.00', '-1', '+1', '1.001', '1e3', 'NaN', 'Infinity',
    '9,999.00', '92233720368547758.08',
  ]) assert.throws(() => parseInrDecimalToMinor(invalid));
  for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.005, Number.MAX_SAFE_INTEGER]) {
    assert.throws(() => legacyNumberToInrMinor(invalid));
  }
});

test('Customer Dues schemas require canonical UUIDs, INR decimal strings, reasons, and bounded filters', () => {
  const customerId = '11111111-1111-4111-8111-111111111111';
  const parsed = createCustomerDueEntrySchema.parse({
    customerId,
    entryType: 'charge',
    amount: '1000.00',
    currency: 'INR',
    dueDate: '2026-10-31',
    idempotencyKey: 'due-command-1',
  });
  assert.equal(parsed.amount, '1000.00');
  assert.equal(parsed.customerId, customerId);
  assert.equal(reverseCustomerDueEntrySchema.parse({
    description: 'Incorrect payment reference',
    idempotencyKey: 'reverse-command-1',
  }).description, 'Incorrect payment reference');
  assert.deepEqual(customerDueListQuerySchema.parse({}), { page: 1, limit: 20 });

  for (const invalid of [
    { customerId: 'mongo-object-id', entryType: 'charge', amount: '1.00', idempotencyKey: 'x' },
    { customerId, customerName: 'Unsafe duplicate', entryType: 'charge', amount: '1.00', idempotencyKey: 'x' },
    { customerId, entryType: 'credit', amount: '1.00', idempotencyKey: 'x' },
    { customerId, entryType: 'payment', amount: 1, idempotencyKey: 'x' },
    { customerId, entryType: 'payment', amount: '0.00', idempotencyKey: 'x' },
    { customerId, entryType: 'adjustment_increase', amount: '1.00', idempotencyKey: 'x' },
    { customerId, entryType: 'charge', amount: '1.00', currency: 'USD', idempotencyKey: 'x' },
    { customerId, entryType: 'charge', amount: '1.00', occurredAt: '2026-10-01T10:00:00', idempotencyKey: 'x' },
  ]) assert.equal(createCustomerDueEntrySchema.safeParse(invalid).success, false);
  assert.equal(customerDueListQuerySchema.safeParse({ page: 1, limit: 101 }).success, false);
  assert.equal(customerDueListQuerySchema.safeParse({ dateFrom: '2026-10-02', dateTo: '2026-10-01' }).success, false);
});

test('Customer Dues runtime, compatibility, and frontend contracts contain no Mongo or fake success path', async () => {
  const [composition, controller, repository, routes, legacyController, legacyRoutes, frontend] = await Promise.all([
    readFile(new URL('../src/persistence/runtimePersistence.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/controllers/customerDuesController.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/domains/customerDues/repository.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/customerDuesRoutes.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/controllers/ledgerController.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/routes/ledgerRoutes.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../frontend/src/pages/Ledger/LedgerPage.tsx', import.meta.url), 'utf8'),
  ]);

  assert.match(composition, /customerDuesAuthority: 'postgresql'/);
  assert.match(composition, /PostgresCustomerDuesRepository/);
  for (const source of [composition, controller, repository, legacyController]) {
    assert.equal(source.includes("models/Ledger"), false);
    assert.equal(source.includes('Ledger.find'), false);
    assert.equal(source.includes('Ledger.create'), false);
    assert.equal(source.includes('legacyOrganizationScope'), false);
  }
  assert.match(routes, /requireEntitlement\(MODULES\.LEDGER\)/);
  assert.match(routes, /LEDGER_READ/);
  assert.match(routes, /LEDGER_MANAGE/);
  assert.equal(legacyRoutes.includes('router.post'), false);
  assert.match(legacyController, /customer-dues-read-only/);

  assert.match(frontend, /\/customer-dues\/entries/);
  assert.match(frontend, /\/customer-dues\/customers/);
  assert.match(frontend, /organizationBalanceMinor/);
  assert.match(frontend, /branchBalanceMinor/);
  assert.match(frontend, /idempotencyKey/);
  assert.match(frontend, /reversalReason/);
  assert.match(frontend, /Export current page/);
  assert.match(frontend, /page,/);
  assert.match(frontend, /ledger\.manage/);
  for (const forbidden of [
    'mockLedgerData', 'createMockLedgerId', "entryType: 'debit'", '60d0fe4f5311236168a109ca',
  ]) assert.equal(frontend.includes(forbidden), false, forbidden);
});

test('Customer Dues read and manage permissions remain distinct HTTP boundaries', async (context) => {
  const authorization = (effectivePermissions: Permission[]) => (
    request: AuthenticatedRequest,
    _response: Response,
    next: NextFunction,
  ) => {
    request.auth = {
      userId: 'user', sessionId: 'session', organizationId: 'organization',
      membershipId: 'membership', branchId: 'branch', role: 'staff',
      permissions: effectivePermissions, platformOperator: false,
    };
    next();
  };
  const app = express();
  app.get(
    '/dues-read', authorization([permissions.LEDGER_READ]),
    requirePermission(permissions.LEDGER_READ), (_request, response) => response.sendStatus(204),
  );
  app.post(
    '/dues-read-only', authorization([permissions.LEDGER_READ]),
    requirePermission(permissions.LEDGER_MANAGE), (_request, response) => response.sendStatus(204),
  );
  app.post(
    '/dues-manage', authorization([permissions.LEDGER_READ, permissions.LEDGER_MANAGE]),
    requirePermission(permissions.LEDGER_MANAGE), (_request, response) => response.sendStatus(204),
  );
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}`;

  assert.equal((await fetch(`${baseUrl}/dues-read`)).status, 204);
  assert.equal((await fetch(`${baseUrl}/dues-read-only`, { method: 'POST' })).status, 403);
  assert.equal((await fetch(`${baseUrl}/dues-manage`, { method: 'POST' })).status, 204);
});
