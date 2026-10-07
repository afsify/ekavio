import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import axios from 'axios';
import { publicClient } from '../../api/client';
import { getErrorMessage } from '../../api/errors';
import { PhoneInput } from '../../components/ui/PhoneInput';
import { normalizePhone } from '../../utils/phone';
import { OfferCard } from '../../components/commercial/OfferCard';
import { CommercialStepper } from '../../components/commercial/CommercialStepper';
import { formatInrMinor, includedInPlan, type AccessRequestReceipt, type BillingCycle, type PublicCommercialCatalogue, type PublicCommercialOffer, type PublicCommercialQuote } from '../../commercial/publicCommercial';

const schema = z.object({
  businessName: z.string().trim().min(2, 'Enter your business name').max(160),
  businessType: z.string().trim().min(2, 'Enter the business type').max(80),
  contactName: z.string().trim().min(2, 'Enter a contact name').max(120),
  phone: z.string().refine((value) => Boolean(normalizePhone(value)), 'Enter a valid phone number'),
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email').max(254)]),
  note: z.string().trim().max(500, 'Keep the note under 500 characters'),
});
type RequestForm = z.infer<typeof schema>;
const defaults: RequestForm = { businessName: '', businessType: 'Clinic', contactName: '', phone: '', email: '', note: '' };
const businessTypes = ['Clinic', 'Shop', 'Salon', 'Service counter', 'Office', 'Other'];

export function PricingSection() {
  const cache = useQueryClient();
  const [billingCycle, setCycle] = useState<BillingCycle>('monthly');
  const [planKey, setPlan] = useState<string | null>(null);
  const [addOnKeys, setAddOns] = useState<string[]>([]);
  const [step, setStep] = useState(1);
  const [businessCategory, setBusinessCategory] = useState('Clinic');
  const [receipt, setReceipt] = useState<AccessRequestReceipt | null>(null);
  const [receiptNames, setReceiptNames] = useState<string[]>([]);
  const [feedback, setFeedback] = useState('');
  const [copied, setCopied] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (step > 1) heading.current?.focus(); }, [step]);
  const form = useForm<RequestForm>({ resolver: zodResolver(schema), defaultValues: defaults });
  const phone = useWatch({ control: form.control, name: 'phone' });
  const catalogue = useQuery({ queryKey: ['public-commercial-catalogue'], retry: false, queryFn: async () => (await publicClient.get<{ data: PublicCommercialCatalogue }>('/public/commercial/catalogue')).data.data });
  const selection = useMemo(() => ({ billingCycle, planKey, addOnKeys: [...addOnKeys].sort() }), [billingCycle, planKey, addOnKeys]);
  const hasSelection = Boolean(planKey || addOnKeys.length);
  const quote = useQuery({ queryKey: ['public-commercial-quote', selection], enabled: hasSelection && !receipt, retry: false, queryFn: async () => (await publicClient.post<{ data: PublicCommercialQuote }>('/public/commercial/quote', selection)).data.data });
  const selectedPlan = catalogue.data?.plans.find((offer) => offer.key === planKey);
  const selectedNames = quote.data?.items.map((item) => item.name) ?? [];
  const go = (next: number) => setStep(next);
  const request = useMutation({
    mutationFn: async () => {
      const fields = schema.parse(form.getValues());
      if (!quote.data || quote.isFetching || quote.isError) throw new Error('Review a current quote before submitting.');
      return (await publicClient.post<{ data: AccessRequestReceipt }>('/public/access-requests', {
        ...selection, businessName: fields.businessName, businessType: fields.businessType, contactName: fields.contactName,
        phone: normalizePhone(fields.phone), ...(fields.email ? { email: fields.email } : {}), ...(fields.note ? { note: fields.note } : {}),
        quoteFingerprint: quote.data.quoteFingerprint,
      })).data.data;
    },
    onSuccess: (result) => { setReceiptNames(selectedNames); setReceipt(result); form.reset(defaults); cache.removeQueries({ queryKey: ['public-commercial-quote'] }); },
    onError: async (error) => {
      if (axios.isAxiosError(error) && [400, 409].includes(error.response?.status ?? 0)) {
        setFeedback('The setup or pricing changed. Review the refreshed selection before submitting again.');
        go(1);
        await Promise.all([catalogue.refetch(), quote.refetch()]);
      }
    },
  });
  const choosePlan = (offer: PublicCommercialOffer) => {
    const next = planKey === offer.key ? null : offer.key;
    setPlan(next);
    if (next) {
      const included = catalogue.data?.addOns.filter((item) => includedInPlan(offer, item)).map((item) => item.key) ?? [];
      if (addOnKeys.some((key) => included.includes(key))) setFeedback(`Included modules removed from extra selections: ${offer.name} already covers them.`);
      setAddOns((keys) => keys.filter((key) => !included.includes(key)));
    }
  };
  const chooseAddOn = (offer: PublicCommercialOffer) => {
    if (includedInPlan(selectedPlan, offer)) return;
    const others = catalogue.data?.addOns.filter((item) => item.key !== offer.key && item.moduleKeys.some((key) => offer.moduleKeys.includes(key))).map((item) => item.key) ?? [];
    if (addOnKeys.some((key) => others.includes(key))) { setFeedback('Those modules are already selected. Remove the overlapping add-on first.'); return; }
    setAddOns((keys) => keys.includes(offer.key) ? keys.filter((key) => key !== offer.key) : [...keys, offer.key]);
  };
  const reset = () => { setReceipt(null); setPlan(null); setAddOns([]); setCycle('monthly'); setFeedback(''); setCopied(false); setBusinessCategory('Clinic'); request.reset(); go(1); };
  const field = (name: 'businessName' | 'contactName' | 'email' | 'note', label: string, required = false) => <div className={name === 'note' ? 'field full-width' : 'field'}><label htmlFor={`request-${name}`}>{label}</label>{name === 'note' ? <textarea id={`request-${name}`} rows={3} maxLength={500} {...form.register(name)} aria-invalid={Boolean(form.formState.errors[name])} aria-describedby={form.formState.errors[name] ? `error-${name}` : undefined} /> : <input id={`request-${name}`} required={required} type={name === 'email' ? 'email' : 'text'} maxLength={name === 'email' ? 254 : name === 'businessName' ? 160 : 120} {...form.register(name)} aria-invalid={Boolean(form.formState.errors[name])} aria-describedby={form.formState.errors[name] ? `error-${name}` : undefined} />} {form.formState.errors[name] && <p id={`error-${name}`} className="error-text" role="alert">{form.formState.errors[name]?.message}</p>}</div>;
  const summary = <div className="public-quote">{quote.data?.items.map((item) => <div key={`${item.offerType}:${item.key}`}><span>{item.name}</span><strong>{formatInrMinor(item.priceMinor)}</strong></div>)}<div><span>{quote.data?.contactRequired ? 'Discussion required' : 'Estimated total'} · {billingCycle}</span><strong>{quote.data ? formatInrMinor(quote.data.subtotalMinor) : 'Select your setup'}</strong></div><p className="public-small muted">An estimate, not an invoice or purchase. Final terms are confirmed manually.</p></div>;
  return <section className="public-section public-container" id="pricing"><p className="public-eyebrow">Your setup, your starting point</p><h2>Plans & modules. No surprise checkout.</h2><p className="public-lead">Choose a package or individual modules. Send one request and we’ll confirm the requirements, terms and next steps.</p>
    {receipt && feedback && <p className="muted" role="status">{feedback}</p>}
    {receipt ? <div className="panel public-wizard" role="status"><h3>Request received</h3><p className="public-reference">{receipt.publicReference ?? 'Your request has been recorded'}</p>{receipt.publicReference && <button className="quiet-button" type="button" onClick={() => { void navigator.clipboard.writeText(receipt.publicReference!).then(() => setCopied(true)).catch(() => setFeedback('Copy unavailable. Select and copy the reference above.')); }}>{copied ? 'Reference copied' : 'Copy reference'}</button>}<p>{receiptNames.join(' + ')} · {receipt.billingCycle}</p><p>{receipt.contactRequired ? 'Contact for pricing — final terms need a discussion.' : `Estimated total: ${formatInrMinor(receipt.subtotalMinor)}`}</p><p className="muted">{receipt.message}</p><p className="muted">Review → agreement → manual payment → one-time onboarding invitation. Your workspace is not activated by this request.</p><div className="public-actions"><a className="quiet-button" href="#product">Back to home</a><button className="action-link" type="button" onClick={reset}>Send another request</button></div></div> : <>
      <div className="public-actions" role="group" aria-label="Billing cycle">{(['monthly', 'yearly'] as const).map((cycle) => <button type="button" key={cycle} className={billingCycle === cycle ? 'action-link' : 'quiet-button'} aria-pressed={billingCycle === cycle} onClick={() => { setCycle(cycle); go(1); }}>{cycle === 'monthly' ? 'Monthly' : 'Yearly'}</button>)}</div>
      <h3>Request Access</h3><div className="public-wizard-heading"><h3 ref={heading} tabIndex={-1}>Step {step} of 3 — {step === 1 ? 'Choose your setup' : step === 2 ? 'Business & contact' : 'Review your request'}</h3><CommercialStepper steps={[{ label: 'Choose setup', complete: step > 1 }, { label: 'Business & contact', complete: step > 2 }, { label: 'Review & submit', complete: false }]} /></div>
      {feedback && <p className="muted" role="status">{feedback}</p>}
      {catalogue.isLoading && <p role="status">Loading current offers…</p>}
      {catalogue.isError && <div className="panel"><p role="alert">Pricing is unavailable right now. Your workspace has not been activated.</p><button className="quiet-button" onClick={() => { void catalogue.refetch(); }}>Retry pricing</button></div>}
      {step === 1 && catalogue.data && <><h3>Packages</h3>{catalogue.data.plans.length === 0 && <p className="muted">No packages are currently published.</p>}<div className="catalogue-grid">{catalogue.data.plans.map((offer) => <OfferCard key={offer.key} offer={offer} cycle={billingCycle} selected={planKey === offer.key} onSelect={() => choosePlan(offer)} />)}</div><h3>Individual modules</h3>{catalogue.data.addOns.length === 0 && <p className="muted">No individual modules are currently published.</p>}<div className="catalogue-grid">{catalogue.data.addOns.map((offer) => <OfferCard key={offer.key} offer={offer} cycle={billingCycle} selected={addOnKeys.includes(offer.key)} included={includedInPlan(selectedPlan, offer) ? selectedPlan?.name : undefined} onSelect={() => chooseAddOn(offer)} />)}</div></>}
      {quote.isFetching && <p role="status">Refreshing your estimate…</p>}{quote.isError && <p role="alert" className="error-text">{getErrorMessage(quote.error, 'This selection is unavailable. Change the setup or retry.')} <button className="quiet-button" onClick={() => { void quote.refetch(); }}>Retry estimate</button></p>}
      {step === 1 && <div className="panel public-wizard">{summary}<button className="action-link" type="button" disabled={!hasSelection || !quote.data || quote.isFetching || quote.isError} onClick={() => go(2)}>Continue to business details</button></div>}
      {step === 2 && <form className="panel public-wizard" onSubmit={form.handleSubmit(() => go(3))}><div className="public-form-grid">{field('businessName', 'Business name', true)}<div className="field"><label htmlFor="request-type">Business type</label><select id="request-type" value={businessCategory} onChange={(event) => { setBusinessCategory(event.target.value); form.setValue('businessType', event.target.value === 'Other' ? '' : event.target.value); }}>{businessTypes.map((type) => <option key={type}>{type}</option>)}</select>{businessCategory === 'Other' && <><label htmlFor="request-other">Other business type</label><input id="request-other" maxLength={80} {...form.register('businessType')} /></>}{form.formState.errors.businessType && <p role="alert" className="error-text">{form.formState.errors.businessType.message}</p>}</div>{field('contactName', 'Contact name', true)}<PhoneInput label="Phone number" value={phone} onChange={(value) => form.setValue('phone', value, { shouldValidate: form.formState.isSubmitted })} required error={form.formState.errors.phone?.message} />{field('email', 'Email (recommended, optional)')}{field('note', 'Requirements note (optional)')}</div><p className="public-small muted">Use staging details only. Don’t include patient information or payment credentials. <a className="public-text-link" href="/privacy">Privacy overview</a></p><div className="public-actions"><button className="quiet-button" type="button" onClick={() => go(1)}>Back to setup</button><button className="action-link" type="submit">Review request</button></div></form>}
      {step === 3 && <div className="panel public-wizard"><h3>{form.getValues('businessName')}</h3><p>{form.getValues('businessType')} · {form.getValues('contactName')}</p><p>{normalizePhone(form.getValues('phone'))}</p>{form.getValues('email') && <p>{form.getValues('email')}</p>}{form.getValues('note') && <p>{form.getValues('note')}</p>}{summary}<p className="muted">We’ll contact you to confirm the final agreement. Submitting does not charge you, create a subscription or grant access.</p><div className="public-actions"><button className="quiet-button" type="button" disabled={request.isPending} onClick={() => go(2)}>Edit business details</button><button className="action-link" type="button" disabled={request.isPending || quote.isFetching || !quote.data || quote.isError} onClick={() => request.mutate()}>{request.isPending ? 'Sending…' : 'Submit access request'}</button></div></div>}
      {request.isError && <p className="error-text" role="alert">{getErrorMessage(request.error, 'Your request could not be sent. Please try again.')}</p>}
    </>}
  </section>;
}
