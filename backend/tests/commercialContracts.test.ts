import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import express from 'express';
import type { NextFunction, Response } from 'express';
import { MODULES } from '../src/commercial/catalogue.js';
import {
  createAuthenticate,
  requirePermission,
  requirePlatformOperator,
  type AuthenticatedRequest,
} from '../src/middlewares/authMiddleware.js';
import { createRequireEntitlement } from '../src/middlewares/tenantMiddleware.js';
import { permissions, permissionsForRole } from '../src/services/authorizationPolicy.js';
import type { AuthorizationContext } from '../src/services/requestContextService.js';
import { AppError } from '../src/utils/AppError.js';

const context = (
  values: Partial<AuthorizationContext> = {},
): AuthorizationContext => ({
  userId: 'user-a',
  sessionId: 'session-a',
  organizationId: 'org-a',
  membershipId: 'membership-a',
  role: 'admin',
  permissions: permissionsForRole('admin'),
  platformOperator: false,
  branchId: 'branch-a',
  ...values,
});

const attachContext = (authorization: AuthorizationContext) => (
  request: AuthenticatedRequest,
  _response: Response,
  next: NextFunction,
) => {
  request.auth = authorization;
  next();
};

const startServer = async (testContext: TestContext, app: express.Express): Promise<string> => {
  const server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  testContext.after(
    () => new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    }),
  );
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
};

test('requireEntitlement permits an entitled organization', async (testContext) => {
  const app = express();
  app.use(attachContext(context()));
  app.get(
    '/queue',
    createRequireEntitlement({
      async getEffective() {
        return { modules: [{ key: MODULES.QUEUE, enabled: true }] };
      },
    })(MODULES.QUEUE),
    (_request, response) => response.json({ allowed: true }),
  );
  const response = await fetch(`${await startServer(testContext, app)}/queue`);
  assert.equal(response.status, 200);
});

test('requireEntitlement denies a non-entitled organization with a stable error', async (testContext) => {
  const app = express();
  app.use(attachContext(context()));
  app.get(
    '/inventory',
    createRequireEntitlement({ async getEffective() { return { modules: [] }; } })(MODULES.INVENTORY),
    (_request, response) => response.json({ allowed: true }),
  );
  const response = await fetch(`${await startServer(testContext, app)}/inventory`);
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), {
    error: {
      code: 'ENTITLEMENT_REQUIRED',
      message: 'Organization does not have the required commercial entitlement',
      module: 'inventory',
    },
  });
});

test('permission and entitlement checks remain independent', async (testContext) => {
  const entitlementAllows = createRequireEntitlement({
    async getEffective() { return { modules: [{ key: MODULES.QUEUE, enabled: true }] }; },
  })(MODULES.QUEUE);
  const entitlementDenies = createRequireEntitlement({
    async getEffective() { return { modules: [{ key: MODULES.QUEUE, enabled: false }] }; },
  })(MODULES.QUEUE);
  const app = express();
  app.get(
    '/permission-denied',
    attachContext(context({ permissions: [] })),
    requirePermission(permissions.QUEUE_READ),
    entitlementAllows,
    (_request, response) => response.sendStatus(204),
  );
  app.get(
    '/entitlement-denied',
    attachContext(context()),
    requirePermission(permissions.QUEUE_READ),
    entitlementDenies,
    (_request, response) => response.sendStatus(204),
  );
  const baseUrl = await startServer(testContext, app);
  assert.equal((await fetch(`${baseUrl}/permission-denied`)).status, 403);
  const entitlementResponse = await fetch(`${baseUrl}/entitlement-denied`);
  assert.equal(entitlementResponse.status, 403);
  assert.equal((await entitlementResponse.json() as { error: { code: string } }).error.code, 'ENTITLEMENT_REQUIRED');
});

test('organization A cannot select organization B to read commercial state', async (testContext) => {
  const authenticate = createAuthenticate({
    verifyAccessToken: () => ({
      userId: 'user-a',
      defaultOrganizationId: 'org-a',
      sessionId: 'session-a',
    }),
    async resolveContext(claims, selection) {
      if (selection?.organizationId === 'org-b') {
        throw new AppError('Access denied to this organization', 403);
      }
      return context({
        userId: claims.userId,
        sessionId: claims.sessionId,
        organizationId: selection?.organizationId ?? claims.defaultOrganizationId,
      });
    },
  });
  const app = express();
  app.get('/billing/subscription', authenticate, (_request, response) => {
    response.json({ organizationId: 'org-a' });
  });
  const response = await fetch(`${await startServer(testContext, app)}/billing/subscription`, {
    headers: { authorization: 'Bearer token', 'x-tenant-id': 'org-b' },
  });
  assert.equal(response.status, 403);
});

test('tenant admin cannot change subscriptions or grant modules for itself or another organization', async (testContext) => {
  let mutations = 0;
  const app = express();
  app.use(express.json(), attachContext(context({ platformOperator: false })));
  app.put(
    '/billing/operator/organizations/:organizationId/subscription',
    requirePlatformOperator,
    (_request, response) => {
      mutations += 1;
      response.sendStatus(204);
    },
  );
  app.put(
    '/billing/operator/organizations/:organizationId/entitlements/:moduleKey',
    requirePlatformOperator,
    (_request, response) => {
      mutations += 1;
      response.sendStatus(204);
    },
  );
  const baseUrl = await startServer(testContext, app);
  for (const organizationId of ['org-a', 'org-b']) {
    for (const path of ['subscription', 'entitlements/ledger']) {
      const response = await fetch(
        `${baseUrl}/billing/operator/organizations/${organizationId}/${path}`,
        { method: 'PUT', headers: { 'content-type': 'application/json' }, body: '{}' },
      );
      assert.equal(response.status, 403);
    }
  }
  assert.equal(mutations, 0);
});

test('platform operator can reach the intended manual pilot mutation boundary', async (testContext) => {
  let target = '';
  const app = express();
  app.use(attachContext(context({ platformOperator: true })));
  app.put(
    '/billing/operator/organizations/:organizationId/entitlements/:moduleKey',
    requirePlatformOperator,
    (request, response) => {
      target = `${request.params.organizationId}:${request.params.moduleKey}`;
      response.json({ source: 'pilot' });
    },
  );
  const response = await fetch(
    `${await startServer(testContext, app)}/billing/operator/organizations/org-b/entitlements/ledger`,
    { method: 'PUT' },
  );
  assert.equal(response.status, 200);
  assert.equal(target, 'org-b:ledger');
});

const repositoryRoot = path.resolve(import.meta.dirname, '../..');
const source = (relativePath: string) => readFile(path.join(repositoryRoot, relativePath), 'utf8');

test('public commercial intake does not restore fake checkout or fabricated invoices', async () => {
  const [routes, controller, billingPage, publicPricing, hero] = await Promise.all([
    source('backend/src/routes/billingRoutes.ts'),
    source('backend/src/controllers/billingController.ts'),
    source('frontend/src/pages/Billing/BillingPage.tsx'),
    source('frontend/src/pages/Landing/PricingSection.tsx'),
    source('frontend/src/pages/Landing/HeroSection.tsx'),
  ]);
  for (const contents of [routes, controller, billingPage, publicPricing]) {
    assert.doesNotMatch(
      contents,
      /create-order|mockInvoices|order_|Pro Tier|Enterprise|Starter|Growth|₹999|₹1,999/,
    );
  }
  assert.match(billingPage, /No billing documents are available/);
  assert.match(publicPricing, /\/public\/commercial\/catalogue/);
  assert.match(publicPricing, /Contact for pricing/);
  assert.match(publicPricing, /Request Access/);
  assert.doesNotMatch(publicPricing, /Buy Now|Pay Now|Subscribe Now/);
  assert.doesNotMatch(hero, /Start Free Trial|\/register/);
});

test('frontend commercial intake uses server quotes and platform-operator UI guards', async () => {
  const [pricing, operatorPage, app, sidebar, store] = await Promise.all([
    source('frontend/src/pages/Landing/PricingSection.tsx'),
    source('frontend/src/pages/Commercial/CommercialRequestsPage.tsx'),
    source('frontend/src/App.tsx'),
    source('frontend/src/components/layout/AdminSidebar.tsx'),
    source('frontend/src/store/useAppStore.ts'),
  ]);
  assert.match(pricing, /\/public\/commercial\/quote/);
  assert.match(pricing, /\/public\/access-requests/);
  assert.doesNotMatch(pricing, /subtotalMinor:/);
  assert.match(operatorPage, /\/billing\/operator\/access-requests/);
  assert.match(operatorPage, /Commercial\/payment activation is completed manually/);
  assert.match(app, /PlatformOperatorGuard/);
  assert.match(sidebar, /platformOperatorOnly/);
  assert.match(store, /isPlatformOperator: payload\.platformOperator === true/);
  assert.doesNotMatch(`${pricing}\n${operatorPage}`, /setEntitlements|upsertEntitlement|updateSubscription/);
});

test('frontend consumes canonical backend entitlement state without local activation', async () => {
  const [store, app, dashboard, sidebar] = await Promise.all([
    source('frontend/src/store/useAppStore.ts'),
    source('frontend/src/App.tsx'),
    source('frontend/src/pages/Dashboard.tsx'),
    source('frontend/src/components/layout/AdminSidebar.tsx'),
  ]);
  assert.match(store, /entitlements: payload\.entitlements/);
  assert.match(store, /client\.get<\{ data: EffectiveEntitlements \}>\('\/billing\/subscription'\)/);
  assert.doesNotMatch(store, /setEntitlements:/);
  assert.match(app, /ModuleGuard module=\{MODULES\.LEDGER\}/);
  assert.match(sidebar, /hasEntitlement\(entitlements, item\.module\)/);
  assert.doesNotMatch(`${store}\n${app}\n${dashboard}\n${sidebar}`, /activeModules|subscribedModules|digital-khata/);
  assert.doesNotMatch(dashboard, /setSubscribed|Subscribe Now|Module activated/);
});
