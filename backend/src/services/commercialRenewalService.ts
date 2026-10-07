import type { BillingCycle } from '../schemas/publicCommercialSchemas.js';
import type {
  CommercialRenewalKind,
  CommercialRenewalQueueView,
  CommercialRenewalStatus,
  FinalizeCommercialRenewalInput,
  RecordRenewalPaymentInput,
} from '../schemas/commercialRenewalSchemas.js';
import type {
  ManualPaymentMethod,
  ManualPaymentStatus,
} from '../schemas/manualCommercialSchemas.js';
import { AppError } from '../utils/AppError.js';

export interface RenewalPackageSnapshot {
  billingCycle: BillingCycle;
  plan: null | { key: string; name: string; moduleKeys: string[] };
  addOns: Array<{ key: string; name: string; moduleKeys: string[] }>;
}

export interface RenewalListPricingSnapshot {
  billingCycle: BillingCycle;
  currency: 'INR';
  complete: boolean;
  calculatedAt: string;
  items: Array<{
    offerType: 'plan' | 'add_on';
    key: string;
    name: string;
    priceMinor: string | null;
    pricingUpdatedAt: string | null;
  }>;
}

export interface CommercialRenewalRecord {
  id: string;
  organizationId: string;
  subscriptionId: string;
  renewalKind: CommercialRenewalKind;
  currency: 'INR';
  billingCycle: BillingCycle;
  selectedPlanKey: string | null;
  selectedAddOnKeys: string[];
  packageSnapshot: RenewalPackageSnapshot;
  listSubtotalMinor: string | null;
  listPricingSnapshot: RenewalListPricingSnapshot;
  agreedTotalMinor: string;
  adjustmentReason: string | null;
  priorPeriodStartsAt: Date;
  priorPeriodEndsAt: Date;
  renewalStartsAt: Date;
  renewalEndsAt: Date;
  status: CommercialRenewalStatus;
  createdByUserId: string;
  finalizedByUserId: string;
  appliedByUserId: string | null;
  cancelledByUserId: string | null;
  finalizedAt: Date;
  appliedAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RenewalPaymentRecord {
  id: string;
  renewalId: string;
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

export interface CommercialRenewalBundle {
  renewal: CommercialRenewalRecord;
  payments: RenewalPaymentRecord[];
  confirmedTotalMinor: string;
  settlementSatisfied: boolean;
}

export interface CommercialRenewalPreview {
  organizationId: string;
  organizationName: string;
  subscriptionId: string;
  subscriptionStatus: string;
  renewalKind: CommercialRenewalKind;
  billingCycle: BillingCycle;
  priorPeriodStartsAt: Date;
  priorPeriodEndsAt: Date;
  suggestedRenewalStartsAt: Date | null;
  packageSnapshot: RenewalPackageSnapshot;
  listPricingSnapshot: RenewalListPricingSnapshot;
  listSubtotalMinor: string | null;
}

export interface OperatorRenewalQueueRecord {
  addOnNames?: string[];
  organizationId: string;
  organizationName: string;
  subscriptionId: string;
  subscriptionStatus: string;
  billingCycle: BillingCycle | null;
  planKey: string | null;
  planName: string | null;
  addOnKeys: string[];
  currentPeriodStartsAt: Date;
  currentPeriodEndsAt: Date | null;
  renewalId: string | null;
  renewalStatus: CommercialRenewalStatus | null;
  renewalKind: CommercialRenewalKind | null;
  renewalStartsAt: Date | null;
  renewalEndsAt: Date | null;
  renewalAppliedAt: Date | null;
}

export interface CommercialRenewalRepository {
  previewRenewal(
    subscriptionId: string,
    actorUserId: string,
    now: Date,
  ): Promise<CommercialRenewalPreview>;
  finalizeRenewal(
    subscriptionId: string,
    actorUserId: string,
    input: FinalizeCommercialRenewalInput,
    now: Date,
  ): Promise<CommercialRenewalBundle>;
  getRenewal(renewalId: string, actorUserId: string): Promise<CommercialRenewalBundle>;
  listOperatorQueue(input: {
    actorUserId: string;
    view: CommercialRenewalQueueView;
    limit: number;
    offset: number;
    now: Date;
  }): Promise<{ items: OperatorRenewalQueueRecord[]; total: number }>;
  recordPayment(
    renewalId: string,
    actorUserId: string,
    input: RecordRenewalPaymentInput,
    now: Date,
  ): Promise<CommercialRenewalBundle>;
  voidPayment(
    renewalId: string,
    paymentId: string,
    actorUserId: string,
    reason: string,
    now: Date,
  ): Promise<CommercialRenewalBundle>;
  applyRenewal(
    renewalId: string,
    actorUserId: string,
    now: Date,
  ): Promise<CommercialRenewalBundle>;
  cancelRenewal(
    renewalId: string,
    actorUserId: string,
    reason: string,
    now: Date,
  ): Promise<CommercialRenewalBundle>;
  listCustomerRenewals(organizationId: string): Promise<CommercialRenewalBundle[]>;
}

const serializeBundle = (bundle: CommercialRenewalBundle) => ({
  renewal: {
    ...bundle.renewal,
    priorPeriodStartsAt: bundle.renewal.priorPeriodStartsAt.toISOString(),
    priorPeriodEndsAt: bundle.renewal.priorPeriodEndsAt.toISOString(),
    renewalStartsAt: bundle.renewal.renewalStartsAt.toISOString(),
    renewalEndsAt: bundle.renewal.renewalEndsAt.toISOString(),
    finalizedAt: bundle.renewal.finalizedAt.toISOString(),
    appliedAt: bundle.renewal.appliedAt?.toISOString() ?? null,
    cancelledAt: bundle.renewal.cancelledAt?.toISOString() ?? null,
    createdAt: bundle.renewal.createdAt.toISOString(),
    updatedAt: bundle.renewal.updatedAt.toISOString(),
  },
  payments: bundle.payments.map((payment) => ({
    ...payment,
    paidAt: payment.paidAt.toISOString(),
    createdAt: payment.createdAt.toISOString(),
    voidedAt: payment.voidedAt?.toISOString() ?? null,
  })),
  confirmedTotalMinor: bundle.confirmedTotalMinor,
  settlementSatisfied: bundle.settlementSatisfied,
});

const serializePreview = (preview: CommercialRenewalPreview) => ({
  ...preview,
  priorPeriodStartsAt: preview.priorPeriodStartsAt.toISOString(),
  priorPeriodEndsAt: preview.priorPeriodEndsAt.toISOString(),
  suggestedRenewalStartsAt: preview.suggestedRenewalStartsAt?.toISOString() ?? null,
});

const serializeCustomerBundle = (bundle: CommercialRenewalBundle) => ({
  renewal: {
    planName: bundle.renewal.packageSnapshot.plan?.name ?? null,
    addOnNames: bundle.renewal.packageSnapshot.addOns.map((item) => item.name),
    id: bundle.renewal.id,
    renewalKind: bundle.renewal.renewalKind,
    currency: bundle.renewal.currency,
    billingCycle: bundle.renewal.billingCycle,
    selectedPlanKey: bundle.renewal.selectedPlanKey,
    selectedAddOnKeys: bundle.renewal.selectedAddOnKeys,
    agreedTotalMinor: bundle.renewal.agreedTotalMinor,
    priorPeriodStartsAt: bundle.renewal.priorPeriodStartsAt.toISOString(),
    priorPeriodEndsAt: bundle.renewal.priorPeriodEndsAt.toISOString(),
    renewalStartsAt: bundle.renewal.renewalStartsAt.toISOString(),
    renewalEndsAt: bundle.renewal.renewalEndsAt.toISOString(),
    status: bundle.renewal.status,
    appliedAt: bundle.renewal.appliedAt?.toISOString() ?? null,
  },
  payments: bundle.payments.map((payment) => ({
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    method: payment.method,
    reference: payment.reference,
    paidAt: payment.paidAt.toISOString(),
    status: payment.status,
  })),
});

export const createCommercialRenewalService = (
  repository: CommercialRenewalRepository,
  now: () => Date = () => new Date(),
) => ({
  async previewRenewal(subscriptionId: string, actorUserId: string) {
    return serializePreview(await repository.previewRenewal(subscriptionId, actorUserId, now()));
  },

  async finalizeRenewal(
    subscriptionId: string,
    actorUserId: string,
    input: FinalizeCommercialRenewalInput,
  ) {
    return serializeBundle(await repository.finalizeRenewal(
      subscriptionId,
      actorUserId,
      input,
      now(),
    ));
  },

  async getRenewal(renewalId: string, actorUserId: string) {
    return serializeBundle(await repository.getRenewal(renewalId, actorUserId));
  },

  async listOperatorQueue(
    actorUserId: string,
    view: CommercialRenewalQueueView,
    page: number,
    limit: number,
  ) {
    const observedAt = now();
    const result = await repository.listOperatorQueue({
      actorUserId,
      view,
      limit,
      offset: (page - 1) * limit,
      now: observedAt,
    });
    return {
      items: result.items.map((item) => ({
        ...item,
        currentPeriodStartsAt: item.currentPeriodStartsAt.toISOString(),
        currentPeriodEndsAt: item.currentPeriodEndsAt?.toISOString() ?? null,
        renewalStartsAt: item.renewalStartsAt?.toISOString() ?? null,
        renewalEndsAt: item.renewalEndsAt?.toISOString() ?? null,
        renewalAppliedAt: item.renewalAppliedAt?.toISOString() ?? null,
        expired: Boolean(item.currentPeriodEndsAt && item.currentPeriodEndsAt <= observedAt),
        secondsUntilExpiry: item.currentPeriodEndsAt
          ? Math.trunc((item.currentPeriodEndsAt.getTime() - observedAt.getTime()) / 1000)
          : null,
      })),
      total: result.total,
      observedAt: observedAt.toISOString(),
    };
  },

  async recordPayment(
    renewalId: string,
    actorUserId: string,
    input: RecordRenewalPaymentInput,
  ) {
    return serializeBundle(await repository.recordPayment(renewalId, actorUserId, input, now()));
  },

  async voidPayment(
    renewalId: string,
    paymentId: string,
    actorUserId: string,
    reason: string,
  ) {
    return serializeBundle(await repository.voidPayment(
      renewalId,
      paymentId,
      actorUserId,
      reason,
      now(),
    ));
  },

  async applyRenewal(renewalId: string, actorUserId: string) {
    return serializeBundle(await repository.applyRenewal(renewalId, actorUserId, now()));
  },

  async cancelRenewal(renewalId: string, actorUserId: string, reason: string) {
    return serializeBundle(await repository.cancelRenewal(
      renewalId,
      actorUserId,
      reason,
      now(),
    ));
  },

  async getCustomerRenewals(organizationId: string) {
    if (!organizationId) throw new AppError('Organization context is required', 400);
    const bundles = await repository.listCustomerRenewals(organizationId);
    return bundles.map(serializeCustomerBundle);
  },
});

export type CommercialRenewalService = ReturnType<typeof createCommercialRenewalService>;
