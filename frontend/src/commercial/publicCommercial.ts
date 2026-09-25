export type BillingCycle = 'monthly' | 'yearly';
export type OfferType = 'plan' | 'add_on';
export type AccessRequestStatus = 'pending' | 'contacted' | 'approved' | 'rejected' | 'activated';

export interface PublicOfferPricing {
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
  billingCycle: BillingCycle;
  currency: 'INR';
  subtotalMinor: string;
  calculatedAt: string;
  items: Array<{
    offerType: OfferType;
    key: string;
    name: string;
    priceMinor: string;
    pricingUpdatedAt: string;
  }>;
}

export interface AccessRequestReceipt {
  receiptId: string;
  status: 'pending';
  billingCycle: BillingCycle;
  currency: 'INR';
  subtotalMinor: string;
  receivedAt: string;
  message: string;
}

export interface OperatorPricing {
  offerType: OfferType;
  key: string;
  name: string;
  status: 'active' | 'inactive';
  available: boolean;
  pricing: null | {
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
  subtotalMinor: string;
  pricingSnapshot: PublicCommercialQuote;
  status: AccessRequestStatus;
  publicNote: string | null;
  internalNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export const formatInrMinor = (minor: string): string => {
  const amount = BigInt(minor);
  const rupees = amount / 100n;
  const paise = (amount % 100n).toString().padStart(2, '0');
  return `₹${new Intl.NumberFormat('en-IN').format(rupees)}.${paise}`;
};
