import React, { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Check, IndianRupee, PackageCheck, Send, ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { publicClient } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import {
  formatInrMinor,
  type AccessRequestReceipt,
  type BillingCycle,
  type PublicCommercialCatalogue,
  type PublicCommercialOffer,
  type PublicCommercialQuote,
} from '../../commercial/publicCommercial';

const requestFormSchema = z.object({
  businessName: z.string().trim().min(2, 'Enter your business name').max(160),
  businessType: z.string().trim().min(2, 'Enter the business type').max(80),
  contactName: z.string().trim().min(2, 'Enter a contact name').max(120),
  phone: z.string().trim().min(6, 'Enter a valid phone number').max(32),
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email').max(254)]),
  note: z.string().trim().max(500, 'Keep the note under 500 characters'),
});

type RequestForm = z.infer<typeof requestFormSchema>;

const errorMessage = (error: unknown): string => {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message ?? 'The request could not be completed.';
  }
  return 'The request could not be completed.';
};

const cyclePrice = (offer: PublicCommercialOffer, cycle: BillingCycle): string | null =>
  cycle === 'monthly'
    ? offer.pricing?.monthlyPriceMinor ?? null
    : offer.pricing?.yearlyPriceMinor ?? null;

const OfferCard: React.FC<{
  offer: PublicCommercialOffer;
  cycle: BillingCycle;
  selected: boolean;
  onSelect: () => void;
}> = ({ offer, cycle, selected, onSelect }) => {
  const price = cyclePrice(offer, cycle);
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={price === null}
      aria-pressed={selected}
      className={`relative w-full rounded-3xl border p-6 text-left transition-all ${
        selected
          ? 'border-indigo-400 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
          : 'border-slate-800 bg-slate-900 hover:border-slate-700'
      } disabled:cursor-not-allowed disabled:opacity-75`}
    >
      {offer.marketingLabel && (
        <span className="absolute right-4 top-4 rounded-full bg-indigo-500/15 px-3 py-1 text-xs font-semibold text-indigo-200">
          {offer.marketingLabel}
        </span>
      )}
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/15 text-indigo-300">
        <PackageCheck className="h-5 w-5" />
      </div>
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
        {offer.offerType === 'plan' ? 'Package' : offer.category}
      </p>
      <h3 className="mt-1 text-xl font-bold text-white">{offer.name}</h3>
      <p className="mt-2 min-h-10 text-sm leading-relaxed text-slate-400">{offer.description}</p>
      <div className="mt-5 text-2xl font-bold text-white">
        {price === null ? 'Contact for pricing' : formatInrMinor(price)}
        {price !== null && (
          <span className="ml-1 text-sm font-normal text-slate-400">
            /{cycle === 'monthly' ? 'month' : 'year'}
          </span>
        )}
      </div>
      <ul className="mt-5 space-y-2">
        {offer.capabilities.map((capability) => (
          <li key={capability} className="flex items-center gap-2 text-sm text-slate-300">
            <Check className="h-4 w-4 text-emerald-400" />
            {capability}
          </li>
        ))}
      </ul>
      <div className={`mt-6 rounded-xl px-3 py-2 text-center text-sm font-semibold ${
        selected ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-300'
      }`}>
        {price === null ? 'Price not published' : selected ? 'Selected' : 'Select'}
      </div>
    </button>
  );
};

export const PricingSection: React.FC = () => {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [planKey, setPlanKey] = useState<string | null>(null);
  const [addOnKeys, setAddOnKeys] = useState<string[]>([]);
  const [receipt, setReceipt] = useState<AccessRequestReceipt | null>(null);
  const catalogueQuery = useQuery({
    queryKey: ['public-commercial-catalogue'],
    queryFn: async () => {
      const response = await publicClient.get<{ data: PublicCommercialCatalogue }>(
        '/public/commercial/catalogue',
      );
      return response.data.data;
    },
  });
  const selection = useMemo(() => ({
    billingCycle,
    planKey,
    addOnKeys: [...addOnKeys].sort(),
  }), [billingCycle, planKey, addOnKeys]);
  const hasSelection = Boolean(planKey || addOnKeys.length > 0);
  const quoteQuery = useQuery({
    queryKey: ['public-commercial-quote', selection],
    enabled: hasSelection,
    retry: false,
    queryFn: async () => {
      const response = await publicClient.post<{ data: PublicCommercialQuote }>(
        '/public/commercial/quote',
        selection,
      );
      return response.data.data;
    },
  });
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<RequestForm>({
    resolver: zodResolver(requestFormSchema),
    defaultValues: {
      businessName: '', businessType: '', contactName: '', phone: '', email: '', note: '',
    },
  });
  const submitMutation = useMutation({
    mutationFn: async (form: RequestForm) => {
      const response = await publicClient.post<{ data: AccessRequestReceipt }>(
        '/public/access-requests',
        {
          businessName: form.businessName,
          businessType: form.businessType,
          contactName: form.contactName,
          phone: form.phone,
          ...(form.email ? { email: form.email } : {}),
          ...(form.note ? { note: form.note } : {}),
          ...selection,
        },
      );
      return response.data.data;
    },
    onSuccess: (data) => {
      setReceipt(data);
      reset();
    },
  });

  const chooseCycle = (cycle: BillingCycle) => {
    setBillingCycle(cycle);
    const catalogue = catalogueQuery.data;
    if (!catalogue) return;
    const plan = catalogue.plans.find(({ key }) => key === planKey);
    if (plan && cyclePrice(plan, cycle) === null) setPlanKey(null);
    setAddOnKeys((current) => current.filter((key) => {
      const addOn = catalogue.addOns.find((offer) => offer.key === key);
      return addOn ? cyclePrice(addOn, cycle) !== null : false;
    }));
    setReceipt(null);
  };

  const choosePlan = (offer: PublicCommercialOffer) => {
    const selecting = planKey !== offer.key;
    setPlanKey(selecting ? offer.key : null);
    if (selecting && catalogueQuery.data) {
      const claimedModules = new Set(offer.moduleKeys);
      setAddOnKeys((current) => current.filter((key) => {
        const addOn = catalogueQuery.data?.addOns.find((candidate) => candidate.key === key);
        return addOn ? addOn.moduleKeys.every((moduleKey) => !claimedModules.has(moduleKey)) : false;
      }));
    }
    setReceipt(null);
  };

  const chooseAddOn = (offer: PublicCommercialOffer) => {
    const adding = !addOnKeys.includes(offer.key);
    setAddOnKeys((current) => adding
      ? [...current, offer.key]
      : current.filter((key) => key !== offer.key));
    if (adding && planKey && catalogueQuery.data) {
      const plan = catalogueQuery.data.plans.find(({ key }) => key === planKey);
      if (plan && offer.moduleKeys.some((moduleKey) => plan.moduleKeys.includes(moduleKey))) {
        setPlanKey(null);
      }
    }
    setReceipt(null);
  };

  return (
    <section id="pilot-access" className="relative py-24">
      <div className="container mx-auto max-w-7xl px-4">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-4 py-2 text-sm text-indigo-200">
            <IndianRupee className="h-4 w-4" />
            Operator-published list pricing
          </div>
          <h2 className="text-3xl font-bold text-white md:text-5xl">Build the right EkaVio workspace</h2>
          <p className="mt-4 text-lg text-slate-400">
            Choose a package or individual modules. EkaVio recalculates every estimate on the server before accepting your request.
          </p>
        </div>

        <div className="mx-auto mb-10 flex w-fit rounded-2xl border border-slate-800 bg-slate-900 p-1">
          {(['monthly', 'yearly'] as const).map((cycle) => (
            <button
              type="button"
              key={cycle}
              onClick={() => chooseCycle(cycle)}
              className={`rounded-xl px-5 py-2.5 text-sm font-semibold capitalize transition ${
                billingCycle === cycle ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {cycle}
            </button>
          ))}
        </div>

        {catalogueQuery.isLoading && (
          <p className="py-12 text-center text-slate-400">Loading the current catalogue…</p>
        )}
        {catalogueQuery.isError && (
          <div className="mx-auto max-w-2xl rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-center text-rose-200">
            The public catalogue is temporarily unavailable. No price has been guessed or cached.
          </div>
        )}
        {catalogueQuery.data && (
          <div className="space-y-10">
            {catalogueQuery.data.plans.length > 0 && (
              <div>
                <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Packages</h3>
                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {catalogueQuery.data.plans.map((offer) => (
                    <OfferCard
                      key={offer.key}
                      offer={offer}
                      cycle={billingCycle}
                      selected={planKey === offer.key}
                      onSelect={() => choosePlan(offer)}
                    />
                  ))}
                </div>
              </div>
            )}
            <div>
              <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">Individual modules</h3>
              <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
                {catalogueQuery.data.addOns.map((offer) => (
                  <OfferCard
                    key={offer.key}
                    offer={offer}
                    cycle={billingCycle}
                    selected={addOnKeys.includes(offer.key)}
                    onSelect={() => chooseAddOn(offer)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="mx-auto mt-14 grid max-w-5xl gap-8 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-2xl md:grid-cols-[0.85fr_1.15fr] md:p-10">
          <div>
            <ShieldCheck className="h-10 w-10 text-indigo-400" />
            <h3 className="mt-5 text-2xl font-bold text-white">Request Access</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              This sends a commercial enquiry for operator review. It does not take payment, create an account, or activate modules.
            </p>
            <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Server-calculated estimate</p>
              {!hasSelection && <p className="mt-2 text-slate-300">Select a priced package or module.</p>}
              {hasSelection && quoteQuery.isFetching && <p className="mt-2 text-slate-300">Calculating…</p>}
              {quoteQuery.data && (
                <>
                  <p className="mt-2 text-3xl font-bold text-white">{formatInrMinor(quoteQuery.data.subtotalMinor)}</p>
                  <p className="mt-1 text-xs capitalize text-slate-500">{quoteQuery.data.billingCycle} list estimate</p>
                  <ul className="mt-4 space-y-2 text-sm text-slate-300">
                    {quoteQuery.data.items.map((item) => (
                      <li key={`${item.offerType}:${item.key}`} className="flex justify-between gap-4">
                        <span>{item.name}</span><span>{formatInrMinor(item.priceMinor)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {quoteQuery.isError && <p className="mt-2 text-sm text-rose-300">{errorMessage(quoteQuery.error)}</p>}
            </div>
          </div>

          {receipt ? (
            <div className="flex flex-col justify-center rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-7">
              <Check className="h-10 w-10 text-emerald-400" />
              <h3 className="mt-4 text-2xl font-bold text-white">Request received</h3>
              <p className="mt-3 text-emerald-50/80">{receipt.message}</p>
              <p className="mt-5 text-sm text-slate-300">
                Accepted {receipt.billingCycle} list estimate: <strong>{formatInrMinor(receipt.subtotalMinor)}</strong>
              </p>
              <p className="mt-2 break-all text-xs text-slate-500">Receipt: {receipt.receiptId}</p>
              <Button className="mt-6" variant="secondary" onClick={() => setReceipt(null)}>Send another request</Button>
            </div>
          ) : (
            <form className="grid gap-4" onSubmit={(event) => void handleSubmit((form) => submitMutation.mutate(form))(event)}>
              <Input label="Business name" {...register('businessName')} error={errors.businessName?.message} />
              <Input label="Business type" placeholder="Clinic, shop, office…" {...register('businessType')} error={errors.businessType?.message} />
              <Input label="Contact name" {...register('contactName')} error={errors.contactName?.message} />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Phone" placeholder="9876543210 or +91…" {...register('phone')} error={errors.phone?.message} />
                <Input label="Email (optional)" type="email" {...register('email')} error={errors.email?.message} />
              </div>
              <div>
                <label htmlFor="access-note" className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-300">Note (optional)</label>
                <textarea
                  id="access-note"
                  rows={3}
                  className="w-full rounded-2xl border border-slate-700/80 bg-slate-900/70 px-4 py-3 text-sm text-white outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  {...register('note')}
                />
                {errors.note && <p className="mt-1 text-xs text-rose-400">{errors.note.message}</p>}
              </div>
              {submitMutation.isError && (
                <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
                  {errorMessage(submitMutation.error)}
                </p>
              )}
              <Button
                type="submit"
                size="lg"
                isLoading={submitMutation.isPending}
                disabled={!quoteQuery.data || quoteQuery.isFetching}
                className="mt-2 w-full"
              >
                <Send className="h-4 w-4" /> Request Access
              </Button>
              <p className="text-center text-xs text-slate-500">Final commercial terms are confirmed manually. No payment is collected here.</p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
};
