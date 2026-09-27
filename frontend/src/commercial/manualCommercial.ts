import type { BillingCycle, PublicCommercialQuote } from './publicCommercial';

export type AgreementStatus =
  | 'awaiting_payment'
  | 'paid'
  | 'onboarding_pending'
  | 'activated'
  | 'cancelled';
export type ManualPaymentMethod = 'upi' | 'bank_transfer' | 'cash' | 'other';

export interface BillingProfile {
  legalName: string;
  contactName: string;
  phone: string;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  gstin: string | null;
}

export interface CommercialAgreement {
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
  startsAt: string;
  currentPeriodEndsAt: string;
  status: AgreementStatus;
  billingProfile: BillingProfile;
  finalizedByUserId: string;
  finalizedAt: string;
  activatedAt: string | null;
}

export interface ManualPayment {
  id: string;
  agreementId: string;
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

export interface OnboardingInvitation {
  id: string;
  agreementId: string;
  expiresAt: string;
  createdAt: string;
  revokedAt: string | null;
  revocationReason: string | null;
  consumedAt: string | null;
}

export interface AgreementBundle {
  agreement: CommercialAgreement;
  payments: ManualPayment[];
  invitations: OnboardingInvitation[];
  confirmedTotalMinor: string;
  settlementSatisfied: boolean;
}

export interface OnboardingInspection {
  businessName: string;
  adminDisplayName: string;
  subscription: {
    billingCycle: BillingCycle;
    planName: string | null;
    addOnNames: string[];
    startsAt: string;
    currentPeriodEndsAt: string;
  };
  expiresAt: string;
}

export interface CustomerCommercialSummary {
  agreement: {
    currency: 'INR';
    billingCycle: BillingCycle;
    selectedPlanKey: string | null;
    selectedAddOnKeys: string[];
    agreedTotalMinor: string;
    startsAt: string;
    currentPeriodEndsAt: string;
    status: AgreementStatus;
  };
  payments: Array<{
    amountMinor: string;
    currency: 'INR';
    method: ManualPaymentMethod;
    reference: string | null;
    paidAt: string;
    status: 'confirmed' | 'void';
  }>;
  billingProfile: BillingProfile;
}
