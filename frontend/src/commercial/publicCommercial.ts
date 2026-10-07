export type BillingCycle = 'monthly' | 'yearly';
export type OfferType = 'plan' | 'add_on';
export type AccessRequestStatus = 'pending' | 'contacted' | 'approved' | 'rejected' | 'activated';

export interface PublicOfferPricing {
  pricingMode?: 'fixed' | 'contact';
  currency: 'INR';
  monthlyPriceMinor: string | null;
  yearlyPriceMinor: string | null;
  billingCycles: BillingCycle[];
}

export interface PublicCommercialOffer {
  offerType: OfferType;
  key: string;
  name: string;
  description: string;
  category: string;
  available: true;
  moduleKeys: string[];
  capabilities: string[];
  marketingLabel: string | null;
  pricing: PublicOfferPricing | null;
}

export interface PublicCommercialCatalogue {
  currency: 'INR';
  plans: PublicCommercialOffer[];
  addOns: PublicCommercialOffer[];
}

export interface PublicCommercialQuote {
  contactRequired?: boolean;
  quoteFingerprint?: string;
  billingCycle: BillingCycle;
  currency: 'INR';
  subtotalMinor: string | null;
  calculatedAt: string;
  items: Array<{
    offerType: OfferType;
    key: string;
    name: string;
    priceMinor: string | null;
    pricingUpdatedAt: string;
  }>;
}

export interface AccessRequestReceipt {
  publicReference?: string;
  contactRequired?: boolean;
  receiptId: string;
  status: 'pending';
  billingCycle: BillingCycle;
  currency: 'INR';
  subtotalMinor: string | null;
  receivedAt: string;
  message: string;
}

export interface OperatorPricing {
  description?: string;
  category?: string;
  moduleKeys?: string[];
  capabilities?: string[];
  offerType: OfferType;
  key: string;
  name: string;
  status: 'active' | 'inactive';
  available: boolean;
  pricing: null | {
    pricingMode?: 'fixed' | 'contact';
    currency: 'INR';
    monthlyPriceMinor: string | null;
    yearlyPriceMinor: string | null;
    published: boolean;
    displayOrder: number;
    marketingLabel: string | null;
    updatedAt: string;
  };
}

export interface OperatorAccessRequest {
  publicReference?: string;
  id: string;
  businessName: string;
  businessType: string;
  contactName: string;
  contactPhone: string;
  normalizedPhone: string;
  email: string | null;
  billingCycle: BillingCycle;
  selectedPlanKey: string | null;
  selectedAddOnKeys: string[];
  currency: 'INR';
  subtotalMinor: string | null;
  pricingSnapshot: PublicCommercialQuote;
  status: AccessRequestStatus;
  publicNote: string | null;
  internalNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export const formatInrMinor = (minor: string | null): string => {
  if (minor === null) return 'Contact for pricing';
  const amount = BigInt(minor);
  const rupees = amount / 100n;
  const paise = (amount % 100n).toString().padStart(2, '0');
  return `₹${new Intl.NumberFormat('en-IN').format(rupees)}.${paise}`;
};

export const annualSaving = (pricing: PublicOfferPricing | null): string | null => {
  if (!pricing || pricing.pricingMode === 'contact' || pricing.monthlyPriceMinor === null || pricing.yearlyPriceMinor === null) return null;
  const saving = BigInt(pricing.monthlyPriceMinor) * 12n - BigInt(pricing.yearlyPriceMinor);
  return saving > 0n ? saving.toString() : null;
};

export const includedInPlan = (plan: PublicCommercialOffer | undefined, addOn: PublicCommercialOffer): boolean =>
  Boolean(plan && addOn.moduleKeys.some((key) => plan.moduleKeys.includes(key)));
