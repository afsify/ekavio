import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import {
  generateLegacyMongoBranchId,
  generateLegacyMongoMembershipId,
  generateLegacyMongoOrganizationId,
  generateLegacyMongoUserId,
} from '../persistence/identifiers.js';
import type {
  AgreementStatus,
  BillingProfileInput,
  FinalizeAgreementInput,
  ManualPaymentMethod,
  ManualPaymentStatus,
  RecordManualPaymentInput,
} from '../schemas/manualCommercialSchemas.js';
import type { BillingCycle } from '../schemas/publicCommercialSchemas.js';
import type { PublicCommercialQuote } from './publicCommercialService.js';
import { AppError } from '../utils/AppError.js';

export interface CommercialAgreementRecord {
  id: string;
  accessRequestId: string;
  organizationId: string | null;
  currency: 'INR';
  billingCycle: BillingCycle;
  selectedPlanKey: string | null;
  selectedAddOnKeys: string[];
  listSubtotalMinor: string;
  listPricingSnapshot: PublicCommercialQuote;
  agreedTotalMinor: string;
  adjustmentReason: string | null;
  startsAt: Date;
  currentPeriodEndsAt: Date;
  status: AgreementStatus;
  billingProfile: BillingProfileInput & { phone: string };
  finalizedByUserId: string;
  finalizedAt: Date;
  activatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ManualPaymentRecord {
  id: string;
  agreementId: string;
  amountMinor: string;
  currency: 'INR';
  method: ManualPaymentMethod;
  reference: string | null;
  paidAt: Date;
  status: ManualPaymentStatus;
  recordedByUserId: string;
  createdAt: Date;
  voidedByUserId: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
}

export interface OnboardingInvitationRecord {
  id: string;
  agreementId: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
  revocationReason: string | null;
  consumedAt: Date | null;
}

export interface AgreementBundle {
  agreement: CommercialAgreementRecord;
  payments: ManualPaymentRecord[];
  invitations: OnboardingInvitationRecord[];
  confirmedTotalMinor: string;
  settlementSatisfied: boolean;
}

export interface CustomerCommercialSummary {
  agreement: {
    currency: 'INR';
    billingCycle: BillingCycle;
    selectedPlanKey: string | null;
    selectedAddOnKeys: string[];
    agreedTotalMinor: string;
    startsAt: Date;
    currentPeriodEndsAt: Date;
    status: AgreementStatus;
  };
  payments: Array<Pick<ManualPaymentRecord,
    'amountMinor' | 'currency' | 'method' | 'reference' | 'paidAt' | 'status'>>;
  billingProfile: BillingProfileInput & { phone: string };
}

export interface OnboardingInspection {
  businessName: string;
  adminDisplayName: string;
  billingCycle: BillingCycle;
  planName: string | null;
  addOnNames: string[];
  periodStartsAt: Date;
  periodEndsAt: Date;
  expiresAt: Date;
}

export interface OnboardingProvisioningInput {
  tokenHash: string;
  passwordHash: string;
  timezone: string;
  now: Date;
  legacyIds: {
    user: string;
    organization: string;
    branch: string;
    membership: string;
  };
}

export interface ManualCommercialRepository {
  createAgreement(
    accessRequestId: string,
    actorUserId: string,
    input: FinalizeAgreementInput,
    normalizedBillingPhone: string,
  ): Promise<AgreementBundle>;
  getAgreementForRequest(accessRequestId: string, actorUserId: string): Promise<AgreementBundle | null>;
  recordPayment(
    agreementId: string,
    actorUserId: string,
    input: RecordManualPaymentInput,
  ): Promise<AgreementBundle>;
  voidPayment(
    agreementId: string,
    paymentId: string,
    actorUserId: string,
    reason: string,
  ): Promise<AgreementBundle>;
  createInvitation(
    agreementId: string,
    actorUserId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<OnboardingInvitationRecord>;
  revokeInvitation(
    agreementId: string,
    invitationId: string,
    actorUserId: string,
    reason: string,
  ): Promise<AgreementBundle>;
  inspectInvitation(tokenHash: string, now: Date): Promise<OnboardingInspection>;
  completeOnboarding(input: OnboardingProvisioningInput): Promise<{ businessName: string }>;
  getCustomerCommercialSummary(organizationId: string): Promise<CustomerCommercialSummary | null>;
}

const tokenHash = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

const requireTimezone = (value: string): string => {
  try {
    new Intl.DateTimeFormat('en-IN', { timeZone: value }).format(new Date());
    return value;
  } catch {
    throw new AppError('Timezone must be a valid IANA timezone', 400);
  }
};

const serializeAgreement = (bundle: AgreementBundle) => ({
  agreement: {
    ...bundle.agreement,
    startsAt: bundle.agreement.startsAt.toISOString(),
    currentPeriodEndsAt: bundle.agreement.currentPeriodEndsAt.toISOString(),
    finalizedAt: bundle.agreement.finalizedAt.toISOString(),
    activatedAt: bundle.agreement.activatedAt?.toISOString() ?? null,
    createdAt: bundle.agreement.createdAt.toISOString(),
    updatedAt: bundle.agreement.updatedAt.toISOString(),
  },
  payments: bundle.payments.map((payment) => ({
    ...payment,
    paidAt: payment.paidAt.toISOString(),
    createdAt: payment.createdAt.toISOString(),
    voidedAt: payment.voidedAt?.toISOString() ?? null,
  })),
  invitations: bundle.invitations.map((invitation) => ({
    ...invitation,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
    revokedAt: invitation.revokedAt?.toISOString() ?? null,
    consumedAt: invitation.consumedAt?.toISOString() ?? null,
  })),
  confirmedTotalMinor: bundle.confirmedTotalMinor,
  settlementSatisfied: bundle.settlementSatisfied,
});

export const createManualCommercialService = (
  repository: ManualCommercialRepository,
  options: {
    now?: () => Date;
    hashPassword?: (password: string) => Promise<string>;
    randomToken?: () => string;
    normalizePhone: (phone: string) => string;
    invitationLifetimeMs?: number;
  },
) => {
  const now = options.now ?? (() => new Date());
  const hashPassword = options.hashPassword ?? ((password: string) => bcrypt.hash(password, 12));
  const randomToken = options.randomToken ?? (() => randomBytes(32).toString('base64url'));
  const invitationLifetimeMs = options.invitationLifetimeMs ?? 72 * 60 * 60 * 1000;

  return {
    async finalizeAgreement(
      accessRequestId: string,
      actorUserId: string,
      input: FinalizeAgreementInput,
    ) {
      const normalizedBillingPhone = options.normalizePhone(input.billingProfile.phone);
      return serializeAgreement(await repository.createAgreement(
        accessRequestId,
        actorUserId,
        input,
        normalizedBillingPhone,
      ));
    },

    async getAgreement(accessRequestId: string, actorUserId: string) {
      const agreement = await repository.getAgreementForRequest(accessRequestId, actorUserId);
      if (!agreement) throw new AppError('Commercial agreement not found', 404);
      return serializeAgreement(agreement);
    },

    async recordPayment(
      agreementId: string,
      actorUserId: string,
      input: RecordManualPaymentInput,
    ) {
      return serializeAgreement(await repository.recordPayment(agreementId, actorUserId, input));
    },

    async voidPayment(
      agreementId: string,
      paymentId: string,
      actorUserId: string,
      reason: string,
    ) {
      return serializeAgreement(await repository.voidPayment(
        agreementId,
        paymentId,
        actorUserId,
        reason,
      ));
    },

    async issueInvitation(agreementId: string, actorUserId: string) {
      const rawToken = randomToken();
      if (Buffer.byteLength(rawToken, 'utf8') < 32) {
        throw new Error('Onboarding token generator returned insufficient entropy');
      }
      const expiresAt = new Date(now().getTime() + invitationLifetimeMs);
      const invitation = await repository.createInvitation(
        agreementId,
        actorUserId,
        tokenHash(rawToken),
        expiresAt,
      );
      return {
        invitation: {
          id: invitation.id,
          expiresAt: invitation.expiresAt.toISOString(),
          createdAt: invitation.createdAt.toISOString(),
        },
        onboardingPath: `/onboarding#token=${rawToken}`,
        message: 'This link is shown once. Generate a replacement if lost.',
      };
    },

    async revokeInvitation(
      agreementId: string,
      invitationId: string,
      actorUserId: string,
      reason: string,
    ) {
      return serializeAgreement(await repository.revokeInvitation(
        agreementId,
        invitationId,
        actorUserId,
        reason,
      ));
    },

    async inspectOnboarding(rawToken: string) {
      const inspected = await repository.inspectInvitation(tokenHash(rawToken), now());
      return {
        businessName: inspected.businessName,
        adminDisplayName: inspected.adminDisplayName,
        subscription: {
          billingCycle: inspected.billingCycle,
          planName: inspected.planName,
          addOnNames: inspected.addOnNames,
          startsAt: inspected.periodStartsAt.toISOString(),
          currentPeriodEndsAt: inspected.periodEndsAt.toISOString(),
        },
        expiresAt: inspected.expiresAt.toISOString(),
      };
    },

    async completeOnboarding(rawToken: string, password: string, timezone: string) {
      const completed = await repository.completeOnboarding({
        tokenHash: tokenHash(rawToken),
        passwordHash: await hashPassword(password),
        timezone: requireTimezone(timezone),
        now: now(),
        legacyIds: {
          user: generateLegacyMongoUserId(),
          organization: generateLegacyMongoOrganizationId(),
          branch: generateLegacyMongoBranchId(),
          membership: generateLegacyMongoMembershipId(),
        },
      });
      return {
        businessName: completed.businessName,
        message: 'Your EkaVio account is ready. Sign in with your phone number and password.',
      };
    },

    async getCustomerCommercialSummary(organizationId: string) {
      const summary = await repository.getCustomerCommercialSummary(organizationId);
      if (!summary) return null;
      return {
        agreement: {
          ...summary.agreement,
          startsAt: summary.agreement.startsAt.toISOString(),
          currentPeriodEndsAt: summary.agreement.currentPeriodEndsAt.toISOString(),
        },
        payments: summary.payments.map((payment) => ({
          ...payment,
          paidAt: payment.paidAt.toISOString(),
        })),
        billingProfile: summary.billingProfile,
      };
    },
  };
};

export type ManualCommercialService = ReturnType<typeof createManualCommercialService>;
