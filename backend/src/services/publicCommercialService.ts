import { normalizePhone } from '../domains/customers/normalization.js';
import { createHash } from 'node:crypto';
import type {
  AccessRequestStatus,
  BillingCycle,
  OfferType,
  OperatorAccessRequestUpdateInput,
  PublicAccessRequestInput,
  PublicPricingUpdateInput,
  PublicQuoteInput,
} from '../schemas/publicCommercialSchemas.js';
import { AppError } from '../utils/AppError.js';

export interface CommercialOfferPricingRecord {
  pricingMode?: 'fixed' | 'contact';
  id: string;
  currency: 'INR';
  monthlyPriceMinor: string | null;
  yearlyPriceMinor: string | null;
  published: boolean;
  displayOrder: number;
  marketingLabel: string | null;
  updatedAt: Date;
}

export interface CommercialOfferRecord {
  offerType: OfferType;
  key: string;
  name: string;
  description: string;
  status: 'active' | 'inactive';
  available: boolean;
  moduleKeys: string[];
  capabilities: string[];
  category: string;
  pricing: CommercialOfferPricingRecord | null;
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

export interface StoredAccessRequestInput {
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
  publicNote: string | null;
  phoneCooldownSince: Date;
}

export interface AccessRequestRecord {
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
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicCommercialRepository {
  loadOffers(): Promise<CommercialOfferRecord[]>;
  createAccessRequest(input: StoredAccessRequestInput): Promise<{ id: string; publicReference?: string; createdAt: Date }>;
  listAccessRequests(input: {
    status?: AccessRequestStatus;
    search?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: AccessRequestRecord[]; total: number }>;
  getAccessRequest(id: string): Promise<AccessRequestRecord | null>;
  updateAccessRequest(
    id: string,
    actorUserId: string,
    input: OperatorAccessRequestUpdateInput,
  ): Promise<AccessRequestRecord>;
  upsertPricing(
    offerType: OfferType,
    offerKey: string,
    actorUserId: string,
    input: PublicPricingUpdateInput,
  ): Promise<CommercialOfferRecord>;
}

const publicPricing = (pricing: CommercialOfferPricingRecord | null) => {
  if (!pricing?.published) return null;
  return {
    currency: pricing.currency,
    pricingMode: pricing.pricingMode ?? 'fixed',
    monthlyPriceMinor: pricing.monthlyPriceMinor,
    yearlyPriceMinor: pricing.yearlyPriceMinor,
    billingCycles: [
      ...(pricing.pricingMode==='contact'||pricing.monthlyPriceMinor !== null ? ['monthly' as const] : []),
      ...(pricing.pricingMode==='contact'||pricing.yearlyPriceMinor !== null ? ['yearly' as const] : []),
    ],
  };
};

const publicOffer = (offer: CommercialOfferRecord) => ({
  offerType: offer.offerType,
  key: offer.key,
  name: offer.name,
  description: offer.description,
  category: offer.category,
  available: true as const,
  moduleKeys: offer.moduleKeys,
  capabilities: offer.capabilities,
  marketingLabel: offer.pricing?.published ? offer.pricing.marketingLabel : null,
  pricing: publicPricing(offer.pricing),
});

const sortOffers = (left: CommercialOfferRecord, right: CommercialOfferRecord): number =>
  (left.pricing?.displayOrder ?? 10000) - (right.pricing?.displayOrder ?? 10000)
  || left.offerType.localeCompare(right.offerType)
  || left.key.localeCompare(right.key);

const requireQuotedOffers = (
  offers: CommercialOfferRecord[],
  input: PublicQuoteInput,
): CommercialOfferRecord[] => {
  const byIdentity = new Map(offers.map((offer) => [`${offer.offerType}:${offer.key}`, offer]));
  const requested = [
    ...(input.planKey ? [{ offerType: 'plan' as const, key: input.planKey }] : []),
    ...input.addOnKeys.map((key) => ({ offerType: 'add_on' as const, key })),
  ];
  const selected = requested.map(({ offerType, key }) => {
    const offer = byIdentity.get(`${offerType}:${key}`);
    if (!offer) throw new AppError('Selected offer does not exist', 400);
    if (offer.status !== 'active' || !offer.available) {
      throw new AppError('Selected offer is unavailable', 400);
    }
    if (!offer.pricing?.published) throw new AppError('Selected offer has no published price', 400);
    const amount = input.billingCycle === 'monthly'
      ? offer.pricing.monthlyPriceMinor
      : offer.pricing.yearlyPriceMinor;
    if (amount === null && offer.pricing.pricingMode !== 'contact') throw new AppError('Selected billing cycle is unavailable', 400);
    return offer;
  });

  const claimedModules = new Set<string>();
  for (const offer of selected) {
    for (const moduleKey of offer.moduleKeys) {
      if (claimedModules.has(moduleKey)) {
        throw new AppError('Selected offers contain overlapping modules', 400);
      }
      claimedModules.add(moduleKey);
    }
  }
  return selected;
};

export const calculatePublicQuote = (
  offers: CommercialOfferRecord[],
  input: PublicQuoteInput,
  now: Date,
): PublicCommercialQuote => {
  if(new Set(input.addOnKeys).size!==input.addOnKeys.length)throw new AppError('Duplicate add-ons are not allowed',400);
  const selected = requireQuotedOffers(offers, input);
  const items = selected
    .map((offer) => {
      const pricing = offer.pricing!;
      const priceMinor = input.billingCycle === 'monthly'
        ? pricing.monthlyPriceMinor
        : pricing.yearlyPriceMinor;
      return {
        offerType: offer.offerType,
        key: offer.key,
        name: offer.name,
        priceMinor,
        pricingUpdatedAt: pricing.updatedAt.toISOString(),
      };
    })
    .sort((left, right) => left.offerType.localeCompare(right.offerType) || left.key.localeCompare(right.key));
  const contactRequired=selected.some(offer=>offer.pricing?.pricingMode==='contact');
  const subtotalMinor = contactRequired?null:items.reduce((total, item) => total + BigInt(item.priceMinor!), 0n).toString();
  const quote: PublicCommercialQuote = {
    contactRequired,
    billingCycle: input.billingCycle,
    currency: 'INR',
    subtotalMinor,
    calculatedAt: now.toISOString(),
    items,
  };
  return {...quote,quoteFingerprint:quoteFingerprint(quote)};
};

export const quoteFingerprint=(quote:PublicCommercialQuote):string=>createHash('sha256').update(JSON.stringify({billingCycle:quote.billingCycle,currency:quote.currency,subtotalMinor:quote.subtotalMinor,contactRequired:quote.contactRequired??false,items:quote.items})).digest('hex');

export const createPublicCommercialService = (
  repository: PublicCommercialRepository,
  options: { now?: () => Date; phoneCooldownMs?: number } = {},
) => {
  const now = options.now ?? (() => new Date());
  const phoneCooldownMs = options.phoneCooldownMs ?? 10 * 60 * 1000;

  return {
    async getCatalogue() {
      const offers = (await repository.loadOffers())
        .filter((offer) => offer.status === 'active' && offer.available && offer.pricing?.published)
        .sort(sortOffers);
      return {
        currency: 'INR' as const,
        plans: offers.filter(({ offerType }) => offerType === 'plan').map(publicOffer),
        addOns: offers.filter(({ offerType }) => offerType === 'add_on').map(publicOffer),
      };
    },

    async previewQuote(input: PublicQuoteInput): Promise<PublicCommercialQuote> {
      return calculatePublicQuote(await repository.loadOffers(), input, now());
    },

    async submitRequest(input: PublicAccessRequestInput) {
      let normalizedPhone: string | null;
      try {
        normalizedPhone = normalizePhone(input.phone, { defaultCallingCode: '91' });
      } catch {
        throw new AppError('Phone must be a valid Indian local or E.164 number', 400);
      }
      if (!normalizedPhone) throw new AppError('Phone is required', 400);
      const submittedAt = now();
      const quote = calculatePublicQuote(await repository.loadOffers(), input, submittedAt);
      if(input.quoteFingerprint && input.quoteFingerprint!==quote.quoteFingerprint)throw new AppError('Pricing changed. Review your setup again.',409);
      const receipt = await repository.createAccessRequest({
        businessName: input.businessName,
        businessType: input.businessType,
        contactName: input.contactName,
        contactPhone: input.phone,
        normalizedPhone,
        email: input.email?.toLocaleLowerCase('en-US') ?? null,
        billingCycle: input.billingCycle,
        selectedPlanKey: input.planKey ?? null,
        selectedAddOnKeys: [...input.addOnKeys].sort(),
        currency: quote.currency,
        subtotalMinor: quote.subtotalMinor,
        pricingSnapshot: quote,
        publicNote: input.note || null,
        phoneCooldownSince: new Date(submittedAt.getTime() - phoneCooldownMs),
      });
      return {
        receiptId: receipt.id,
        publicReference: receipt.publicReference,
        contactRequired: quote.contactRequired ?? false,
        status: 'pending' as const,
        billingCycle: quote.billingCycle,
        currency: quote.currency,
        subtotalMinor: quote.subtotalMinor,
        receivedAt: receipt.createdAt.toISOString(),
        message: 'Request received. EkaVio will contact you to confirm your requirements and final commercial terms.',
      };
    },

    async getOperatorPricing() {
      return (await repository.loadOffers()).sort(sortOffers).map((offer) => ({
        offerType: offer.offerType,
        key: offer.key,
        name: offer.name,
        status: offer.status,
        available: offer.available,
        description:offer.description,moduleKeys:offer.moduleKeys,capabilities:offer.capabilities,category:offer.category,
        pricing: offer.pricing && {
          currency: offer.pricing.currency,
          pricingMode:offer.pricing.pricingMode??'fixed',
          monthlyPriceMinor: offer.pricing.monthlyPriceMinor,
          yearlyPriceMinor: offer.pricing.yearlyPriceMinor,
          published: offer.pricing.published,
          displayOrder: offer.pricing.displayOrder,
          marketingLabel: offer.pricing.marketingLabel,
          updatedAt: offer.pricing.updatedAt.toISOString(),
        },
      }));
    },

    async updatePricing(
      offerType: OfferType,
      offerKey: string,
      actorUserId: string,
      input: PublicPricingUpdateInput,
    ) {
      const offer = await repository.upsertPricing(offerType, offerKey, actorUserId, input);
      return {
        offerType: offer.offerType,
        key: offer.key,
        name: offer.name,
        pricing: offer.pricing && {
          currency: offer.pricing.currency,
          pricingMode: offer.pricing.pricingMode ?? 'fixed',
          monthlyPriceMinor: offer.pricing.monthlyPriceMinor,
          yearlyPriceMinor: offer.pricing.yearlyPriceMinor,
          published: offer.pricing.published,
          displayOrder: offer.pricing.displayOrder,
          marketingLabel: offer.pricing.marketingLabel,
          updatedAt: offer.pricing.updatedAt.toISOString(),
        },
      };
    },

    listRequests(status: AccessRequestStatus | undefined, page: number, limit: number,search?:string) {
      return repository.listAccessRequests({
        ...(status ? { status } : {}),
        ...(search?{search}:{}),
        limit,
        offset: (page - 1) * limit,
      });
    },

    async getRequest(id: string) {
      const request = await repository.getAccessRequest(id);
      if (!request) throw new AppError('Access request not found', 404);
      return request;
    },

    updateRequest(
      id: string,
      actorUserId: string,
      input: OperatorAccessRequestUpdateInput,
    ) {
      return repository.updateAccessRequest(id, actorUserId, input);
    },
  };
};
