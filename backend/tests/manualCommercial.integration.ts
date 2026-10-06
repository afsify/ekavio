import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import bcrypt from 'bcryptjs';
import { PostgresCommercialRepository } from '../src/postgres/commercialRepository.js';
import { PostgresDatabase } from '../src/postgres/database.js';
import { PostgresIdentityRepository } from '../src/postgres/identityRepository.js';
import { PostgresManualCommercialRepository } from '../src/postgres/manualCommercialRepository.js';
import { getMigrationStatus, migrate } from '../src/postgres/migrations.js';
import { PostgresPublicCommercialRepository } from '../src/postgres/publicCommercialRepository.js';
import { PostgresSessionRepository } from '../src/postgres/sessionRepository.js';
import { createAuthService } from '../src/services/authService.js';
import { createEntitlementService } from '../src/services/entitlementService.js';
import { createManualCommercialService } from '../src/services/manualCommercialService.js';
import { createPublicCommercialService } from '../src/services/publicCommercialService.js';
import { createRefreshSessionManager } from '../src/services/sessionService.js';

const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

test('V2-06B5B agreement, payment, onboarding, and atomic provisioning', async (context) => {
  const adminUrl = process.env.POSTGRES_TEST_URL;
  assert.ok(adminUrl, 'POSTGRES_TEST_URL is required');
  const parsed = new URL(adminUrl);
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(parsed.hostname));
  assert.equal(parsed.pathname, '/postgres');

  const databaseName = `ekavio_v206b5b_${randomUUID().replaceAll('-', '')}`;
  const admin = new PostgresDatabase(adminUrl);
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const database = new PostgresDatabase(databaseUrl.toString());
  const temporaryMigrations = await mkdtemp(path.join(tmpdir(), 'ekavio-v206b5b-'));
  context.after(async () => {
    await database.close();
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [databaseName]);
    await admin.query(`DROP DATABASE "${databaseName}"`);
    await admin.close();
    await rm(temporaryMigrations, { recursive: true, force: true });
  });

  const migrationDirectory = path.resolve(process.cwd(), 'postgres', 'migrations');
  const accepted = (await readdir(migrationDirectory)).filter((name) => /^00[1-6]_.*\.sql$/.test(name));
  for (const name of accepted) {
    await copyFile(path.join(migrationDirectory, name), path.join(temporaryMigrations, name));
  }
  await migrate(database, temporaryMigrations);
  assert.equal((await database.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM schema_migrations',
  )).rows[0]?.count, '6');
  await migrate(database);
  assert.deepEqual(
    (await getMigrationStatus(database)).map(({ state }) => state),
    Array.from({ length: 14 }, () => 'applied'),
  );

  const commercialRepository = new PostgresCommercialRepository(database);
  await commercialRepository.reconcileCatalogue();
  const operatorId = randomUUID();
  const tenantAdminId = randomUUID();
  const base = new Date();
  await database.query(`
    INSERT INTO users
      (id, legacy_mongo_id, name, phone, password_hash, platform_role, created_at, updated_at)
    VALUES
      ($1, 'aaaaaaaaaaaaaaaaaaaaaaaa', 'Platform Operator', '+919000000001', NULL, 'operator', $3, $3),
      ($2, 'bbbbbbbbbbbbbbbbbbbbbbbb', 'Tenant Admin', '+919000000002', NULL, NULL, $3, $3)
  `, [operatorId, tenantAdminId, base]);

  const publicRepository = new PostgresPublicCommercialRepository(database);
  for (const [offerType, key, monthly] of [
    ['plan', 'pilot-core', '10000'],
    ['add_on', 'module-inventory', '2500'],
    ['add_on', 'module-queue', '1000'],
  ] as const) {
    await publicRepository.upsertPricing(offerType, key, operatorId, {
      currency: 'INR', monthlyPriceMinor: monthly, yearlyPriceMinor: null,
      published: true, displayOrder: 1, marketingLabel: null,
    });
  }
  const publicService = createPublicCommercialService(publicRepository, { now: () => base });
  const repository = new PostgresManualCommercialRepository(database);
  const service = createManualCommercialService(repository, {
    normalizePhone: (phone) => phone.startsWith('+') ? phone : `+91${phone.replace(/^0+/, '')}`,
    now: () => base,
    hashPassword: (password) => bcrypt.hash(password, 4),
  });
  let phoneCounter = 100;
  const createRequest = async (
    values: { phone?: string; planKey?: string | null; addOnKeys?: string[] } = {},
  ) => {
    const receipt = await publicService.submitRequest({
      businessName: `Integration Business ${phoneCounter}`,
      businessType: 'Clinic',
      contactName: 'Customer Owner',
      phone: values.phone ?? `+91910000${String(phoneCounter++).padStart(4, '0')}`,
      billingCycle: 'monthly',
      planKey: values.planKey === undefined ? 'pilot-core' : values.planKey,
      addOnKeys: values.addOnKeys ?? ['module-inventory'],
      note: 'B5B integration',
    });
    return receipt.receiptId;
  };
  const approve = async (requestId: string) => {
    await publicRepository.updateAccessRequest(requestId, operatorId, { status: 'approved' });
  };
  const agreementInput = (overrides: Record<string, unknown> = {}) => ({
    billingCycle: 'monthly' as const,
    planKey: 'pilot-core',
    addOnKeys: ['module-inventory'],
    agreedTotalMinor: '9000',
    adjustmentReason: 'Approved pilot discount',
    startsAt: new Date(base.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    currentPeriodEndsAt: new Date(base.getTime() + 31 * 24 * 60 * 60 * 1000).toISOString(),
    billingProfile: {
      legalName: 'Integration Clinic', contactName: 'Customer Owner', phone: '+919100000100',
      email: 'owner@example.test', addressLine1: 'Test Road', addressLine2: null,
      city: 'Kochi', state: 'Kerala', postalCode: '682001', gstin: null,
    },
    ...overrides,
  });

  let mainRequestId = '';
  let mainAgreementId = '';
  await context.test('only approved requests and platform operators can finalize canonical agreements', async () => {
    const pendingId = await createRequest();
    await assert.rejects(
      service.finalizeAgreement(pendingId, operatorId, agreementInput()),
      /Only an approved access request/,
    );
    const rejectedId = await createRequest();
    await publicRepository.updateAccessRequest(rejectedId, operatorId, { status: 'rejected' });
    await assert.rejects(
      service.finalizeAgreement(rejectedId, operatorId, agreementInput()),
      /Only an approved access request/,
    );

    mainRequestId = await createRequest();
    await approve(mainRequestId);
    await assert.rejects(
      service.finalizeAgreement(mainRequestId, tenantAdminId, agreementInput()),
      /Platform operator access required/,
    );
    await assert.rejects(
      service.finalizeAgreement(mainRequestId, operatorId, agreementInput({ planKey: 'missing-plan' })),
      /Selected plan is missing/,
    );
    await assert.rejects(
      service.finalizeAgreement(mainRequestId, operatorId, agreementInput({
        addOnKeys: ['missing-add-on'],
      })),
      /add-ons are missing/,
    );
    await assert.rejects(
      service.finalizeAgreement(mainRequestId, operatorId, agreementInput({
        addOnKeys: ['module-inventory', 'module-inventory'],
      })),
      /Duplicate add-ons/,
    );
    await assert.rejects(
      service.finalizeAgreement(mainRequestId, operatorId, agreementInput({
        addOnKeys: ['module-queue'], agreedTotalMinor: '10000', adjustmentReason: null,
      })),
      /overlapping modules/,
    );
    await assert.rejects(
      service.finalizeAgreement(mainRequestId, operatorId, agreementInput({
        agreedTotalMinor: '9000', adjustmentReason: null,
      })),
      /adjustment requires a reason/,
    );

    const bundle = await service.finalizeAgreement(mainRequestId, operatorId, agreementInput());
    mainAgreementId = bundle.agreement.id;
    assert.equal(bundle.agreement.listSubtotalMinor, '12500');
    assert.equal(bundle.agreement.agreedTotalMinor, '9000');
    assert.equal(bundle.agreement.status, 'awaiting_payment');
    assert.equal(bundle.agreement.listPricingSnapshot.items.length, 2);
    assert.equal(bundle.agreement.startsAt, agreementInput().startsAt);
    assert.equal(bundle.agreement.currentPeriodEndsAt, agreementInput().currentPeriodEndsAt);
    await assert.rejects(
      service.finalizeAgreement(mainRequestId, operatorId, agreementInput()),
      /agreement already exists/,
    );
  });

  await context.test('manual payments are idempotent, append-oriented, exact-settlement gated, and safely voided', async () => {
    const first = {
      amountMinor: '4000', method: 'upi' as const, reference: 'MANUAL-REF-1',
      paidAt: base.toISOString(), idempotencyKey: randomUUID(),
    };
    await assert.rejects(
      service.recordPayment(mainAgreementId, tenantAdminId, first),
      /Platform operator access required/,
    );
    let bundle = await service.recordPayment(mainAgreementId, operatorId, first);
    assert.equal(bundle.confirmedTotalMinor, '4000');
    assert.equal(bundle.agreement.status, 'awaiting_payment');
    bundle = await service.recordPayment(mainAgreementId, operatorId, first);
    assert.equal(bundle.payments.length, 1);
    await assert.rejects(
      service.recordPayment(mainAgreementId, operatorId, {
        ...first, amountMinor: '4001',
      }),
      /idempotency key was already used/,
    );
    await assert.rejects(
      service.issueInvitation(mainAgreementId, operatorId),
      /exactly settled/,
    );
    await assert.rejects(
      service.recordPayment(mainAgreementId, operatorId, {
        ...first, amountMinor: '6000', idempotencyKey: randomUUID(),
      }),
      /exceed the exact agreed total/,
    );
    bundle = await service.recordPayment(mainAgreementId, operatorId, {
      amountMinor: '5000', method: 'bank_transfer', reference: 'MANUAL-REF-2',
      paidAt: base.toISOString(), idempotencyKey: randomUUID(),
    });
    assert.equal(bundle.confirmedTotalMinor, '9000');
    assert.equal(bundle.agreement.status, 'paid');
    await assert.rejects(
      service.recordPayment(mainAgreementId, operatorId, {
        amountMinor: '1', method: 'cash', reference: null,
        paidAt: base.toISOString(), idempotencyKey: randomUUID(),
      }),
      /exceed the exact agreed total/,
    );

    bundle = await service.voidPayment(
      mainAgreementId,
      bundle.payments[0]!.id,
      operatorId,
      'Duplicate manual entry',
    );
    assert.equal(bundle.confirmedTotalMinor, '5000');
    assert.equal(bundle.agreement.status, 'awaiting_payment');
    assert.equal(bundle.payments[0]?.status, 'void');
    await assert.rejects(
      database.query('DELETE FROM manual_commercial_payments WHERE id = $1', [bundle.payments[1]!.id]),
      /append-only/,
    );
    await assert.rejects(
      database.query('UPDATE manual_commercial_payments SET amount_minor = 1 WHERE id = $1', [bundle.payments[1]!.id]),
      /immutable/,
    );
    bundle = await service.recordPayment(mainAgreementId, operatorId, {
      amountMinor: '4000', method: 'cash', reference: 'Replacement entry',
      paidAt: base.toISOString(), idempotencyKey: randomUUID(),
    });
    assert.equal(bundle.confirmedTotalMinor, '9000');
    assert.equal(bundle.agreement.status, 'paid');
    await database.query("UPDATE add_ons SET status = 'inactive' WHERE key = 'module-inventory'");
    await assert.rejects(
      service.issueInvitation(mainAgreementId, operatorId),
      /no longer available/,
    );
    await database.query("UPDATE add_ons SET status = 'active' WHERE key = 'module-inventory'");
  });

  let activeRawToken = '';
  await context.test('one-time invitations store only hashes and support replacement, revocation, and expiry', async () => {
    const first = await service.issueInvitation(mainAgreementId, operatorId);
    const firstToken = new URLSearchParams(first.onboardingPath.split('#')[1]).get('token');
    assert.ok(firstToken);
    assert.ok(Buffer.byteLength(firstToken, 'utf8') >= 32);
    const stored = await database.query<{ token_hash: string }>(`
      SELECT token_hash FROM commercial_onboarding_invitations
      WHERE agreement_id = $1 ORDER BY created_at DESC LIMIT 1
    `, [mainAgreementId]);
    assert.equal(stored.rows[0]?.token_hash, sha256(firstToken));
    assert.notEqual(stored.rows[0]?.token_hash, firstToken);
    const safeInspection = await service.inspectOnboarding(firstToken);
    assert.equal(safeInspection.businessName.startsWith('Integration Business'), true);
    assert.equal(JSON.stringify(safeInspection).includes(mainAgreementId), false);

    const replacement = await service.issueInvitation(mainAgreementId, operatorId);
    const replacementToken = new URLSearchParams(replacement.onboardingPath.split('#')[1]).get('token');
    assert.ok(replacementToken);
    await assert.rejects(service.inspectOnboarding(firstToken), /invalid, expired, used, or revoked/);
    let bundle = await service.getAgreement(mainRequestId, operatorId);
    const replacementRecord = bundle.invitations.find((invitation) => !invitation.revokedAt)!;
    bundle = await service.revokeInvitation(
      mainAgreementId,
      replacementRecord.id,
      operatorId,
      'Customer requested a replacement',
    );
    assert.equal(bundle.agreement.status, 'paid');
    await assert.rejects(service.inspectOnboarding(replacementToken), /invalid, expired, used, or revoked/);

    const active = await service.issueInvitation(mainAgreementId, operatorId);
    activeRawToken = new URLSearchParams(active.onboardingPath.split('#')[1]).get('token')!;
    await assert.rejects(repository.inspectInvitation(sha256(activeRawToken), new Date(base.getTime() + 4 * 24 * 60 * 60 * 1000)), /expired/);
    await assert.rejects(service.inspectOnboarding('Z'.repeat(43)), /invalid, expired, used, or revoked/);
  });

  let activatedOrganizationId = '';
  await context.test('concurrent redemption provisions exactly one tenant and activates canonical entitlements', async () => {
    const password = 'customer-password-2026';
    const results = await Promise.allSettled([
      service.completeOnboarding(activeRawToken, password, 'Asia/Kolkata'),
      service.completeOnboarding(activeRawToken, password, 'Asia/Kolkata'),
    ]);
    assert.equal(results.filter(({ status }) => status === 'fulfilled').length, 1);
    assert.equal(results.filter(({ status }) => status === 'rejected').length, 1);
    await assert.rejects(
      service.inspectOnboarding(activeRawToken),
      /invalid, expired, used, or revoked/,
    );

    const agreement = await database.query<{ organization_id: string; status: string }>(`
      SELECT organization_id, status FROM commercial_agreements WHERE id = $1
    `, [mainAgreementId]);
    activatedOrganizationId = agreement.rows[0]!.organization_id;
    assert.equal(agreement.rows[0]?.status, 'activated');
    const request = await database.query<{ status: string }>(`
      SELECT status FROM commercial_access_requests WHERE id = $1
    `, [mainRequestId]);
    assert.equal(request.rows[0]?.status, 'activated');
    const consumed = await database.query<{ count: string }>(`
      SELECT COUNT(*)::text AS count FROM commercial_onboarding_invitations
      WHERE agreement_id = $1 AND consumed_at IS NOT NULL
    `, [mainAgreementId]);
    assert.equal(consumed.rows[0]?.count, '1');
    const counts = await database.query<{
      users: string; organizations: string; branches: string; memberships: string;
      assignments: string; profiles: string; subscriptions: string; add_ons: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM users u JOIN memberships m ON m.user_id = u.id WHERE m.organization_id = $1)::text AS users,
        (SELECT COUNT(*) FROM organizations WHERE id = $1)::text AS organizations,
        (SELECT COUNT(*) FROM branches WHERE organization_id = $1)::text AS branches,
        (SELECT COUNT(*) FROM memberships WHERE organization_id = $1)::text AS memberships,
        (SELECT COUNT(*) FROM membership_branch_assignments WHERE organization_id = $1)::text AS assignments,
        (SELECT COUNT(*) FROM organization_billing_profiles WHERE organization_id = $1)::text AS profiles,
        (SELECT COUNT(*) FROM subscriptions WHERE organization_id = $1)::text AS subscriptions,
        (SELECT COUNT(*) FROM subscription_add_ons sa JOIN subscriptions s ON s.id = sa.subscription_id WHERE s.organization_id = $1)::text AS add_ons
    `, [activatedOrganizationId]);
    assert.deepEqual(counts.rows[0], {
      users: '1', organizations: '1', branches: '1', memberships: '1',
      assignments: '1', profiles: '1', subscriptions: '1', add_ons: '1',
    });
    const identity = await database.query<{
      phone: string; password_hash: string; platform_role: string | null; role: string; timezone: string;
    }>(`
      SELECT u.phone, u.password_hash, u.platform_role, m.role, b.timezone
      FROM users u JOIN memberships m ON m.user_id = u.id
      JOIN membership_branch_assignments mba ON mba.membership_id = m.id
      JOIN branches b ON b.id = mba.branch_id
      WHERE m.organization_id = $1
    `, [activatedOrganizationId]);
    assert.equal(identity.rows[0]?.platform_role, null);
    assert.equal(identity.rows[0]?.role, 'owner');
    assert.equal(identity.rows[0]?.timezone, 'Asia/Kolkata');
    assert.notEqual(identity.rows[0]?.password_hash, password);
    assert.equal(await bcrypt.compare(password, identity.rows[0]!.password_hash), true);

    const subscriptionState = await database.query<{
      plan_key: string | null;
      billing_cycle: string;
      source: string;
      starts_at: Date;
      current_period_ends_at: Date;
      add_on_keys: string[];
    }>(`
      SELECT p.key AS plan_key, s.billing_cycle, s.source, s.starts_at,
        s.current_period_ends_at,
        ARRAY(
          SELECT ao.key FROM subscription_add_ons sa
          JOIN add_ons ao ON ao.id = sa.add_on_id
          WHERE sa.subscription_id = s.id ORDER BY ao.key
        ) AS add_on_keys
      FROM subscriptions s
      LEFT JOIN plans p ON p.id = s.plan_id
      WHERE s.organization_id = $1
    `, [activatedOrganizationId]);
    assert.equal(subscriptionState.rows[0]?.plan_key, 'pilot-core');
    assert.equal(subscriptionState.rows[0]?.billing_cycle, 'monthly');
    assert.equal(subscriptionState.rows[0]?.source, 'manual');
    assert.equal(subscriptionState.rows[0]?.starts_at.toISOString(), agreementInput().startsAt);
    assert.equal(
      subscriptionState.rows[0]?.current_period_ends_at.toISOString(),
      agreementInput().currentPeriodEndsAt,
    );
    assert.deepEqual(subscriptionState.rows[0]?.add_on_keys, ['module-inventory']);

    const entitlementService = createEntitlementService(commercialRepository, () => base);
    const effective = await entitlementService.getEffective(activatedOrganizationId);
    assert.equal(effective.subscription?.status, 'active');
    assert.equal(effective.subscription?.source, 'manual');
    assert.equal(effective.modules.find(({ key }) => key === 'queue')?.enabled, true);
    assert.equal(effective.modules.find(({ key }) => key === 'inventory')?.enabled, true);
    assert.equal(effective.modules.find(({ key }) => key === 'ledger')?.enabled, false);
    const expired = await createEntitlementService(
      commercialRepository,
      () => new Date(agreementInput().currentPeriodEndsAt),
    ).getEffective(activatedOrganizationId);
    assert.equal(expired.subscription?.status, 'expired');
    assert.equal(expired.modules.every(({ enabled }) => !enabled), true);

    const identities = new PostgresIdentityRepository(database, entitlementService);
    const sessions = createRefreshSessionManager({
      repository: new PostgresSessionRepository(database),
      getHashSecret: () => 'integration-refresh-secret-which-is-not-production',
    });
    const auth = createAuthService({
      identities,
      sessions,
      verifyPassword: bcrypt.compare,
      signAccessToken: () => 'test-access-token',
    });
    const login = await auth.login({ phone: identity.rows[0]!.phone, password });
    assert.equal(login.response.organizationId, activatedOrganizationId);
    assert.equal(login.response.platformOperator, false);
    const refreshed = await auth.refresh(login.refreshCredential);
    assert.equal(refreshed.response.organizationId, activatedOrganizationId);
  });

  await context.test('tenant billing is organization-scoped and exposes only factual commercial records', async () => {
    const summary = await repository.getCustomerCommercialSummary(activatedOrganizationId);
    assert.equal(summary?.agreement.agreedTotalMinor, '9000');
    assert.equal(summary?.payments.filter(({ status }) => status === 'confirmed').length, 2);
    assert.equal(summary?.billingProfile.legalName, 'Integration Clinic');
    assert.equal(JSON.stringify(summary).includes(operatorId), false);
    assert.equal(await repository.getCustomerCommercialSummary(randomUUID()), null);
  });

  await context.test('existing phone conflicts fail closed without silently linking an identity', async () => {
    const requestId = await createRequest({ phone: '+919000000002', planKey: 'pilot-core', addOnKeys: [] });
    await approve(requestId);
    const agreement = await service.finalizeAgreement(requestId, operatorId, agreementInput({
      addOnKeys: [], agreedTotalMinor: '0', adjustmentReason: 'Complimentary reviewed pilot',
      billingProfile: { ...agreementInput().billingProfile, phone: '+919000000002' },
    }));
    const invitation = await service.issueInvitation(agreement.agreement.id, operatorId);
    const rawToken = new URLSearchParams(invitation.onboardingPath.split('#')[1]).get('token')!;
    await assert.rejects(
      service.completeOnboarding(rawToken, 'existing-user-password', 'Asia/Kolkata'),
      /phone already belongs to an EkaVio user/,
    );
    const unchanged = await service.getAgreement(requestId, operatorId);
    assert.equal(unchanged.agreement.organizationId, null);
    assert.equal(unchanged.agreement.status, 'onboarding_pending');
  });

  await context.test('a mid-transaction identity conflict rolls back every provisioning write', async () => {
    const requestId = await createRequest({ planKey: 'pilot-core', addOnKeys: [] });
    await approve(requestId);
    const agreement = await service.finalizeAgreement(requestId, operatorId, agreementInput({
      addOnKeys: [], agreedTotalMinor: '0', adjustmentReason: 'Complimentary rollback test',
      billingProfile: { ...agreementInput().billingProfile, phone: '+919100009999' },
    }));
    const invitation = await service.issueInvitation(agreement.agreement.id, operatorId);
    const rawToken = new URLSearchParams(invitation.onboardingPath.split('#')[1]).get('token')!;
    const before = await database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM organizations');
    await assert.rejects(repository.completeOnboarding({
      tokenHash: sha256(rawToken),
      passwordHash: await bcrypt.hash('rollback-password', 4),
      timezone: 'Asia/Kolkata',
      now: base,
      legacyIds: {
        user: 'aaaaaaaaaaaaaaaaaaaaaaaa',
        organization: 'cccccccccccccccccccccccc',
        branch: 'dddddddddddddddddddddddd',
        membership: 'eeeeeeeeeeeeeeeeeeeeeeee',
      },
    }));
    const after = await database.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM organizations');
    assert.equal(after.rows[0]?.count, before.rows[0]?.count);
    const unchanged = await service.getAgreement(requestId, operatorId);
    assert.equal(unchanged.agreement.organizationId, null);
    assert.equal(unchanged.agreement.status, 'onboarding_pending');
    assert.equal(unchanged.invitations[0]?.consumedAt, null);
  });

  await context.test('append-only activation audit contains each material action without token or password data', async () => {
    const events = await database.query<{ action: string; details: unknown }>(`
      SELECT action, details FROM commercial_activation_events
      WHERE agreement_id = $1 ORDER BY occurred_at, id
    `, [mainAgreementId]);
    for (const action of [
      'agreement_finalized', 'payment_recorded', 'payment_voided', 'invitation_created',
      'invitation_replaced', 'invitation_revoked', 'onboarding_completed',
      'organization_provisioned', 'subscription_activated',
    ]) assert.ok(events.rows.some((event) => event.action === action), action);
    const serialized = JSON.stringify(events.rows);
    assert.equal(serialized.includes(activeRawToken), false);
    assert.equal(serialized.includes('customer-password-2026'), false);
    await assert.rejects(
      database.query('DELETE FROM commercial_activation_events WHERE agreement_id = $1', [mainAgreementId]),
      /append-only/,
    );
  });
});
