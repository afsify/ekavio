import type { BillingCycle } from './publicCommercial';
import type { ManualPaymentMethod } from './manualCommercial';

export type CommercialRenewalStatus = 'awaiting_payment' | 'paid' | 'applied' | 'cancelled';
export type CommercialRenewalKind = 'continuous' | 'reactivation';
export type RenewalQueueView = 'due' | 'expired' | 'in_progress' | 'paid' | 'recent' | 'all';

export interface RenewalQueueItem {
  organizationId: string;
  organizationName: string;
  subscriptionId: string;
  subscriptionStatus: string;
  billingCycle: BillingCycle | null;
  planKey: string | null;
  planName: string | null;
  addOnKeys: string[];
  currentPeriodStartsAt: string;
  currentPeriodEndsAt: string | null;
  renewalId: string | null;
  renewalStatus: CommercialRenewalStatus | null;
  renewalKind: CommercialRenewalKind | null;
  renewalStartsAt: string | null;
  renewalEndsAt: string | null;
  renewalAppliedAt: string | null;
  expired: boolean;
  secondsUntilExpiry: number | null;
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

export interface CommercialRenewal {
  id: string;
  organizationId: string;
  subscriptionId: string;
  renewalKind: CommercialRenewalKind;
  currency: 'INR';
  billingCycle: BillingCycle;
  selectedPlanKey: string | null;
  selectedAddOnKeys: string[];
  packageSnapshot: {
    billingCycle: BillingCycle;
    plan: null | { key: string; name: string; moduleKeys: string[] };
    addOns: Array<{ key: string; name: string; moduleKeys: string[] }>;
  };
  listSubtotalMinor: string | null;
  listPricingSnapshot: RenewalListPricingSnapshot;
  agreedTotalMinor: string;
  adjustmentReason: string | null;
  priorPeriodStartsAt: string;
  priorPeriodEndsAt: string;
  renewalStartsAt: string;
  renewalEndsAt: string;
  status: CommercialRenewalStatus;
  finalizedAt: string;
  appliedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RenewalPayment {
  id: string;
  renewalId: string;
  amountMinor: string;
  currency: 'INR';
  method: ManualPaymentMethod;
  reference: string | null;
  paidAt: string;
  status: 'confirmed' | 'void';
  recordedByUserId: string;
  createdAt: string;
  voidedByUserId: string | null;
  voidedAt: string | null;
  voidReason: string | null;
}

export interface CommercialRenewalBundle {
  renewal: CommercialRenewal;
  payments: RenewalPayment[];
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
  priorPeriodStartsAt: string;
  priorPeriodEndsAt: string;
  suggestedRenewalStartsAt: string | null;
  packageSnapshot: CommercialRenewal['packageSnapshot'];
  listPricingSnapshot: RenewalListPricingSnapshot;
  listSubtotalMinor: string | null;
}

export interface CustomerRenewalHistory {
  renewal: Pick<CommercialRenewal,
    | 'id'
    | 'renewalKind'
    | 'currency'
    | 'billingCycle'
    | 'selectedPlanKey'
    | 'selectedAddOnKeys'
    | 'agreedTotalMinor'
    | 'priorPeriodStartsAt'
    | 'priorPeriodEndsAt'
    | 'renewalStartsAt'
    | 'renewalEndsAt'
    | 'status'
    | 'appliedAt'>;
  payments: Array<Pick<RenewalPayment,
    'amountMinor' | 'currency' | 'method' | 'reference' | 'paidAt' | 'status'>>;
}
