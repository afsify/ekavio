import assert from 'node:assert/strict';
import test from 'node:test';
import {
  completeOnboardingSchema,
  finalizeAgreementSchema,
  inspectOnboardingSchema,
  recordManualPaymentSchema,
  voidManualPaymentSchema,
} from '../src/schemas/manualCommercialSchemas.js';
import {
  createManualCommercialService,
  type AgreementBundle,
  type CustomerCommercialSummary,
  type ManualCommercialRepository,
  type OnboardingInspection,
  type OnboardingInvitationRecord,
  type OnboardingProvisioningInput,
} from '../src/services/manualCommercialService.js';

const profile = {
  legalName: 'Example Clinic',
  contactName: 'Clinic Owner',
  phone: '+919876543210',
  email: null,
  addressLine1: null,
  addressLine2: null,
  city: 'Kochi',
  state: 'Kerala',
  postalCode: null,
  gstin: null,
};

const validAgreement = {
  billingCycle: 'monthly' as const,
  planKey: 'pilot-core',
  addOnKeys: ['module-inventory'],
  agreedTotalMinor: '12500',
  adjustmentReason: null,
  startsAt: '2026-10-01T00:00:00.000Z',
  currentPeriodEndsAt: '2026-11-01T00:00:00.000Z',
  billingProfile: profile,
};

test('agreement schema enforces exact periods, selections, integer money, reasons, and strict input', () => {
  assert.equal(finalizeAgreementSchema.safeParse(validAgreement).success, true);
  assert.equal(finalizeAgreementSchema.safeParse({ ...validAgreement, agreedTotalMinor: '-1' }).success, false);
  assert.equal(finalizeAgreementSchema.safeParse({ ...validAgreement, agreedTotalMinor: '1.5' }).success, false);
  assert.equal(finalizeAgreementSchema.safeParse({ ...validAgreement, agreedTotalMinor: '0', adjustmentReason: null }).success, false);
  assert.equal(finalizeAgreementSchema.safeParse({ ...validAgreement, addOnKeys: ['module-inventory', 'module-inventory'] }).success, false);
  assert.equal(finalizeAgreementSchema.safeParse({ ...validAgreement, planKey: null, addOnKeys: [] }).success, false);
  assert.equal(finalizeAgreementSchema.safeParse({ ...validAgreement, currentPeriodEndsAt: validAgreement.startsAt }).success, false);
  assert.equal(finalizeAgreementSchema.safeParse({ ...validAgreement, listSubtotalMinor: '1' }).success, false);
});

test('payment schemas reject non-positive money, unknown methods, and sensitive fields', () => {
  const payment = {
    amountMinor: '5000', method: 'upi', reference: 'UTR-safe-reference',
    paidAt: '2026-09-27T08:00:00.000Z', idempotencyKey: 'ed277591-fbc3-4e68-8602-44203bf9ef14',
  };
  assert.equal(recordManualPaymentSchema.safeParse(payment).success, true);
  assert.equal(recordManualPaymentSchema.safeParse({ ...payment, amountMinor: '0' }).success, false);
  assert.equal(recordManualPaymentSchema.safeParse({ ...payment, method: 'card' }).success, false);
  assert.equal(recordManualPaymentSchema.safeParse({ ...payment, upiPin: '1234' }).success, false);
  assert.equal(recordManualPaymentSchema.safeParse({ ...payment, otp: '000000' }).success, false);
  assert.equal(voidManualPaymentSchema.safeParse({ reason: 'Duplicate entry' }).success, true);
  assert.equal(voidManualPaymentSchema.safeParse({ reason: '' }).success, false);
});

test('onboarding schemas accept body tokens only and require a strong customer password', () => {
  const token = 'a'.repeat(43);
  assert.equal(inspectOnboardingSchema.safeParse({ token }).success, true);
  assert.equal(completeOnboardingSchema.safeParse({ token, password: 'twelve-chars!', timezone: 'Asia/Kolkata' }).success, true);
  assert.equal(completeOnboardingSchema.safeParse({ token, password: 'short', timezone: 'Asia/Kolkata' }).success, false);
  assert.equal(completeOnboardingSchema.safeParse({ token, password: 'twelve-chars!', timezone: 'Asia/Kolkata', phone: '999' }).success, false);
});

class TokenRepository implements ManualCommercialRepository {
  public storedHash = '';
  public provisioning: OnboardingProvisioningInput | null = null;
  private readonly invitation: OnboardingInvitationRecord = {
    id: 'd34602ba-f7e2-416f-8da9-b865f075ef0e',
    agreementId: 'd5a595ca-c41e-4c71-8647-3e3e0ed82fa3',
    expiresAt: new Date('2026-09-30T08:00:00.000Z'),
    createdAt: new Date('2026-09-27T08:00:00.000Z'),
    revokedAt: null,
    revocationReason: null,
    consumedAt: null,
  };

  public async createAgreement(): Promise<AgreementBundle> { throw new Error('not used'); }
  public async getAgreementForRequest(): Promise<AgreementBundle | null> { return null; }
  public async recordPayment(): Promise<AgreementBundle> { throw new Error('not used'); }
  public async voidPayment(): Promise<AgreementBundle> { throw new Error('not used'); }
  public async createInvitation(
    _agreementId: string,
    _actorUserId: string,
    tokenHash: string,
  ): Promise<OnboardingInvitationRecord> {
    this.storedHash = tokenHash;
    return this.invitation;
  }
  public async revokeInvitation(): Promise<AgreementBundle> { throw new Error('not used'); }
  public async inspectInvitation(tokenHash: string): Promise<OnboardingInspection> {
    this.storedHash = tokenHash;
    return {
      businessName: 'Example Clinic', adminDisplayName: 'Clinic Owner', billingCycle: 'monthly',
      planName: 'Pilot Core', addOnNames: ['Inventory Module'],
      periodStartsAt: new Date('2026-10-01T00:00:00.000Z'),
      periodEndsAt: new Date('2026-11-01T00:00:00.000Z'),
      expiresAt: this.invitation.expiresAt,
    };
  }
  public async completeOnboarding(input: OnboardingProvisioningInput) {
    this.provisioning = input;
    return { businessName: 'Example Clinic' };
  }
  public async getCustomerCommercialSummary(): Promise<CustomerCommercialSummary | null> { return null; }
}

test('invitation returns a one-time raw fragment token while persisting only its SHA-256 hash', async () => {
  const repository = new TokenRepository();
  const rawToken = 'A'.repeat(43);
  const service = createManualCommercialService(repository, {
    normalizePhone: (phone) => phone,
    now: () => new Date('2026-09-27T08:00:00.000Z'),
    randomToken: () => rawToken,
  });
  const result = await service.issueInvitation(
    'd5a595ca-c41e-4c71-8647-3e3e0ed82fa3',
    '6d9db25e-f14d-480b-b13b-b6829a147f80',
  );
  assert.equal(result.onboardingPath, `/onboarding#token=${rawToken}`);
  assert.equal(repository.storedHash.length, 64);
  assert.notEqual(repository.storedHash, rawToken);
  assert.equal(JSON.stringify(result).includes(repository.storedHash), false);
});

test('onboarding completion hashes the password and validates IANA timezone before persistence', async () => {
  const repository = new TokenRepository();
  const service = createManualCommercialService(repository, {
    normalizePhone: (phone) => phone,
    now: () => new Date('2026-09-27T08:00:00.000Z'),
    hashPassword: async () => 'bcrypt-test-hash',
  });
  await service.completeOnboarding('A'.repeat(43), 'customer-password', 'Asia/Kolkata');
  assert.equal(repository.provisioning?.passwordHash, 'bcrypt-test-hash');
  assert.equal(JSON.stringify(repository.provisioning).includes('customer-password'), false);
  await assert.rejects(
    service.completeOnboarding('A'.repeat(43), 'customer-password', 'Invalid/Timezone'),
    /valid IANA timezone/,
  );
});
