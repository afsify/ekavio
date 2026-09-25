import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';
import express from 'express';
import type { NextFunction, Response } from 'express';
import { createAccessRequestRateLimiter } from '../src/routes/publicRoutes.js';
import {
  operatorAccessRequestUpdateSchema,
  publicAccessRequestSchema,
  publicPricingUpdateSchema,
  publicQuoteSchema,
  type AccessRequestStatus,
  type OperatorAccessRequestUpdateInput,
  type PublicPricingUpdateInput,
} from '../src/schemas/publicCommercialSchemas.js';
import {
  calculatePublicQuote,
  createPublicCommercialService,
  type AccessRequestRecord,
  type CommercialOfferRecord,
  type PublicCommercialRepository,
  type StoredAccessRequestInput,
} from '../src/services/publicCommercialService.js';
import { createRequirePublicRegistrationAvailable } from '../src/middlewares/registrationAvailability.js';
import {
  createAuthenticate,
  requirePlatformOperator,
  type AuthenticatedRequest,
} from '../src/middlewares/authMiddleware.js';
import type { AuthorizationContext } from '../src/services/requestContextService.js';
import { permissionsForRole } from '../src/services/authorizationPolicy.js';

const at = new Date('2026-09-25T08:00:00.000Z');

const pricing = (values: Partial<NonNullable<CommercialOfferRecord['pricing']>> = {}) => ({
  id: 'pricing-private-id',
  currency: 'INR' as const,
  monthlyPriceMinor: '10000',
  yearlyPriceMinor: '100000',
  published: true,
  displayOrder: 1,
  marketingLabel: 'Popular',
  updatedAt: at,
  ...values,
});
const offers = (): CommercialOfferRecord[] => [
  {
    offerType: 'plan', key: 'pilot-core', name: 'Pilot Core', description: 'Queue package',
    status: 'active', available: true, moduleKeys: ['queue'], capabilities: ['Queue'],
    category: 'package', pricing: pricing(),
  },
  {
    offerType: 'plan', key: 'legacy-import', name: 'Legacy Import', description: 'Internal only',
    status: 'active', available: false, moduleKeys: [], capabilities: [], category: 'package',
    pricing: pricing(),
  },
  {
    offerType: 'add_on', key: 'module-inventory', name: 'Inventory', description: 'Inventory module',
    status: 'active', available: true, moduleKeys: ['inventory'], capabilities: ['Inventory'],
    category: 'operations', pricing: pricing({ monthlyPriceMinor: '2500', yearlyPriceMinor: '25000' }),
  },
  {
    offerType: 'add_on', key: 'module-attendance', name: 'Attendance', description: 'Attendance module',
    status: 'active', available: true, moduleKeys: ['attendance'], capabilities: ['Attendance'],
    category: 'workforce', pricing: pricing({ published: false, marketingLabel: 'Private draft' }),
  },
  {
    offerType: 'add_on', key: 'module-queue', name: 'Queue', description: 'Queue module',
    status: 'active', available: true, moduleKeys: ['queue'], capabilities: ['Queue'],
    category: 'operations', pricing: pricing(),
  },
  {
    offerType: 'add_on', key: 'retired-module', name: 'Retired', description: 'Unavailable',
    status: 'inactive', available: false, moduleKeys: ['ledger'], capabilities: ['Ledger'],
    category: 'accounting', pricing: pricing(),
  },
];

class MemoryRepository implements PublicCommercialRepository {
  public created: StoredAccessRequestInput[] = [];
  public organizationCreates = 0;
  public subscriptionCreates = 0;
  public entitlementWrites = 0;

  public async loadOffers() { return offers(); }
  public async createAccessRequest(input: StoredAccessRequestInput) {
    this.created.push(input);
    return { id: '4eb2a4f1-fd50-41e0-a18d-6332bf62eaa1', createdAt: at };
  }
  public async listAccessRequests(_input: { status?: AccessRequestStatus; limit: number; offset: number }) {
    return { items: [] as AccessRequestRecord[], total: 0 };
  }
  public async getAccessRequest(_id: string) { return null; }
  public async updateAccessRequest(
    _id: string,
    _actorUserId: string,
    _input: OperatorAccessRequestUpdateInput,
  ): Promise<AccessRequestRecord> { throw new Error('not used'); }
  public async upsertPricing(
    offerType: 'plan' | 'add_on',
    offerKey: string,
    _actorUserId: string,
    _input: PublicPricingUpdateInput,
  ) {
    return offers().find((offer) => offer.offerType === offerType && offer.key === offerKey)!;
  }
}

test('public catalogue exposes safe sellable fields and hides draft pricing and internal plans', async () => {
  const catalogue = await createPublicCommercialService(new MemoryRepository()).getCatalogue();
  assert.equal(catalogue.plans.some(({ key }) => key === 'legacy-import'), false);
  const attendance = catalogue.addOns.find(({ key }) => key === 'module-attendance');
  assert.equal(attendance?.pricing, null);
  assert.equal(attendance?.marketingLabel, null);
  const serialized = JSON.stringify(catalogue);
  for (const unsafe of ['pricing-private-id', 'operatorId', 'organizationId', 'legacyMongoId', 'entitlement']) {
    assert.equal(serialized.includes(unsafe), false);
  }
});

test('server quote uses exact integer minor units for monthly and yearly calculations', () => {
  const monthly = calculatePublicQuote(offers(), {
    billingCycle: 'monthly', planKey: 'pilot-core', addOnKeys: ['module-inventory'],
  }, at);
  const yearly = calculatePublicQuote(offers(), {
    billingCycle: 'yearly', planKey: 'pilot-core', addOnKeys: ['module-inventory'],
  }, at);
  assert.equal(monthly.subtotalMinor, '12500');
  assert.equal(yearly.subtotalMinor, '125000');
  assert.equal(typeof monthly.subtotalMinor, 'string');
});

test('quote rejects duplicate, nonexistent, unpublished, unavailable, and incompatible selections', () => {
  assert.equal(publicQuoteSchema.safeParse({
    billingCycle: 'monthly', addOnKeys: ['module-inventory', 'module-inventory'],
  }).success, false);
  assert.throws(() => calculatePublicQuote(offers(), {
    billingCycle: 'monthly', addOnKeys: ['missing'],
  }, at), /does not exist/);
  assert.throws(() => calculatePublicQuote(offers(), {
    billingCycle: 'monthly', addOnKeys: ['module-attendance'],
  }, at), /no published price/);
  assert.throws(() => calculatePublicQuote(offers(), {
    billingCycle: 'monthly', addOnKeys: ['retired-module'],
  }, at), /unavailable/);
  assert.throws(() => calculatePublicQuote(offers(), {
    billingCycle: 'monthly', planKey: 'pilot-core', addOnKeys: ['module-queue'],
  }, at), /overlapping modules/);
});

test('strict request validation rejects malformed PII, oversized fields, invalid email, and client totals', () => {
  const valid = {
    businessName: 'Example Clinic', businessType: 'Clinic', contactName: 'Owner',
    phone: '9876543210', email: 'owner@example.test', billingCycle: 'monthly',
    addOnKeys: ['module-inventory'], note: 'Please call after 4 PM',
  };
  assert.equal(publicAccessRequestSchema.safeParse(valid).success, true);
  assert.equal(publicAccessRequestSchema.safeParse({ ...valid, businessName: 'x'.repeat(161) }).success, false);
  assert.equal(publicAccessRequestSchema.safeParse({ ...valid, email: 'invalid' }).success, false);
  assert.equal(publicAccessRequestSchema.safeParse({ ...valid, subtotalMinor: '1' }).success, false);
  assert.equal(publicAccessRequestSchema.safeParse({ ...valid, addOnKeys: [] }).success, false);
});

test('valid access request stores a server quote and returns only a safe receipt without granting access', async () => {
  const repository = new MemoryRepository();
  const service = createPublicCommercialService(repository, { now: () => at });
  const receipt = await service.submitRequest({
    businessName: 'Example Clinic', businessType: 'Clinic', contactName: 'Owner',
    phone: '09876543210', email: 'OWNER@EXAMPLE.TEST', billingCycle: 'monthly',
    addOnKeys: ['module-inventory'], note: 'Call later',
  });
  assert.equal(repository.created.length, 1);
  assert.equal(repository.created[0]?.normalizedPhone, '+919876543210');
  assert.equal(repository.created[0]?.subtotalMinor, '2500');
  assert.equal(repository.created[0]?.pricingSnapshot.items[0]?.priceMinor, '2500');
  assert.equal(repository.organizationCreates, 0);
  assert.equal(repository.subscriptionCreates, 0);
  assert.equal(repository.entitlementWrites, 0);
  const serialized = JSON.stringify(receipt);
  assert.equal(serialized.includes('Example Clinic'), false);
  assert.equal(serialized.includes('9876543210'), false);
  assert.equal(receipt.status, 'pending');
});

test('pricing and operator update schemas enforce integer amounts and B5A transitions', () => {
  const base = {
    currency: 'INR', monthlyPriceMinor: '100', yearlyPriceMinor: null,
    published: true, displayOrder: 1, marketingLabel: null,
  };
  assert.equal(publicPricingUpdateSchema.safeParse(base).success, true);
  assert.equal(publicPricingUpdateSchema.safeParse({ ...base, monthlyPriceMinor: '10.5' }).success, false);
  assert.equal(publicPricingUpdateSchema.safeParse({ ...base, monthlyPriceMinor: -1 }).success, false);
  assert.equal(publicPricingUpdateSchema.safeParse({ ...base, monthlyPriceMinor: null }).success, false);
  assert.equal(operatorAccessRequestUpdateSchema.safeParse({ status: 'activated' }).success, false);
  assert.equal(operatorAccessRequestUpdateSchema.safeParse({}).success, false);
});

const listen = async (context: TestContext, app: express.Express): Promise<string> => {
  const server = await new Promise<Server>((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  context.after(() => new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

test('public access request IP limiter rejects obvious bursts', async (context) => {
  const app = express();
  app.use(createAccessRequestRateLimiter({ limit: 2, windowMs: 60_000 }));
  app.post('/', (_request, response) => response.sendStatus(204));
  const url = await listen(context, app);
  assert.equal((await fetch(url, { method: 'POST' })).status, 204);
  assert.equal((await fetch(url, { method: 'POST' })).status, 204);
  assert.equal((await fetch(url, { method: 'POST' })).status, 429);
});

test('production public registration is closed while controlled non-production registration remains available', async (context) => {
  for (const [environment, expected] of [['production', 404], ['test', 204]] as const) {
    const app = express();
    app.post('/', createRequirePublicRegistrationAvailable(() => environment), (_request, response) => response.sendStatus(204));
    assert.equal((await fetch(await listen(context, app), { method: 'POST' })).status, expected);
  }
});

const authorization = (platformOperator: boolean): AuthorizationContext => ({
  userId: 'user-a', sessionId: 'session-a', organizationId: 'org-a',
  membershipId: 'membership-a', role: 'owner', permissions: permissionsForRole('owner'),
  platformOperator, branchId: 'branch-a',
});

test('operator boundary allows platform operators and rejects tenants and unauthenticated callers', async (context) => {
  const authenticate = createAuthenticate({
    verifyAccessToken: (token) => ({
      userId: 'user-a', defaultOrganizationId: 'org-a', sessionId: token,
    }),
    async resolveContext(claims) { return authorization(claims.sessionId === 'operator'); },
  });
  const app = express();
  app.get('/operator', authenticate, requirePlatformOperator, (
    _request: AuthenticatedRequest,
    response: Response,
    _next: NextFunction,
  ) => response.sendStatus(204));
  const url = `${await listen(context, app)}/operator`;
  assert.equal((await fetch(url)).status, 401);
  assert.equal((await fetch(url, { headers: { authorization: 'Bearer tenant' } })).status, 403);
  assert.equal((await fetch(url, { headers: { authorization: 'Bearer operator' } })).status, 204);
});
