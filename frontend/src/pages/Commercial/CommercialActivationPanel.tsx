import { rupeesToPaise, paiseToRupees } from '../../utils/money';
import { TechnicalDetails } from '../../components/ui/TechnicalDetails';
import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Copy, Link2, ReceiptIndianRupee, ShieldCheck, XCircle } from 'lucide-react';
import { client } from '../../api/client';
import type {
  AgreementBundle,
  ManualPaymentMethod,
} from '../../commercial/manualCommercial';
import {
  formatInrMinor,
  type OperatorAccessRequest,
  type OperatorPricing,
} from '../../commercial/publicCommercial';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

const errorMessage = (error: unknown): string => {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message ?? 'The commercial action could not be completed.';
  }
  return 'The commercial action could not be completed.';
};

const toIso = (value: string): string => new Date(value).toISOString();
const emptyToNull = (value: string): string | null => value.trim() || null;

export const CommercialActivationPanel: React.FC<{
  request: OperatorAccessRequest;
  offers: OperatorPricing[];
}> = ({ request, offers }) => {
  const queryClient = useQueryClient();
  const [billingCycle, setBillingCycle] = useState(request.billingCycle);
  const [planKey, setPlanKey] = useState(request.selectedPlanKey ?? '');
  const [addOnKeys, setAddOnKeys] = useState<string[]>(request.selectedAddOnKeys);
  const [agreedTotalMinor, setAgreedTotalMinor] = useState(paiseToRupees(request.subtotalMinor));
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [legalName, setLegalName] = useState(request.businessName);
  const [billingContact, setBillingContact] = useState(request.contactName);
  const [billingPhone, setBillingPhone] = useState(request.contactPhone);
  const [billingEmail, setBillingEmail] = useState(request.email ?? '');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('Kerala');
  const [postalCode, setPostalCode] = useState('');
  const [gstin, setGstin] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<ManualPaymentMethod>('upi');
  const [paymentReference, setPaymentReference] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [paymentKey, setPaymentKey] = useState(() => crypto.randomUUID());
  const [voidReason, setVoidReason] = useState('');
  const [revokeReason, setRevokeReason] = useState('');
  const [oneTimeLink, setOneTimeLink] = useState<string | null>(null);

  const agreementQuery = useQuery({
    queryKey: ['operator-commercial-agreement', request.id],
    enabled: request.status === 'approved' || request.status === 'activated',
    queryFn: async () => {
      try {
        const response = await client.get<{ data: AgreementBundle }>(
          `/billing/operator/access-requests/${request.id}/agreement`,
        );
        return response.data.data;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) return null;
        throw error;
      }
    },
  });

  const refreshAgreement = (bundle: AgreementBundle) => {
    queryClient.setQueryData(['operator-commercial-agreement', request.id], bundle);
    setOneTimeLink(null);
  };
  const finalize = useMutation({
    mutationFn: async () => {
      const response = await client.post<{ data: AgreementBundle }>(
        `/billing/operator/access-requests/${request.id}/agreement`,
        {
          billingCycle,
          planKey: planKey || null,
          addOnKeys,
          agreedTotalMinor: rupeesToPaise(agreedTotalMinor),
          adjustmentReason: emptyToNull(adjustmentReason),
          startsAt: toIso(startsAt),
          currentPeriodEndsAt: toIso(endsAt),
          billingProfile: {
            legalName,
            contactName: billingContact,
            phone: billingPhone,
            email: emptyToNull(billingEmail),
            addressLine1: emptyToNull(addressLine1),
            addressLine2: emptyToNull(addressLine2),
            city: emptyToNull(city),
            state: emptyToNull(state),
            postalCode: emptyToNull(postalCode),
            gstin: emptyToNull(gstin.toUpperCase()),
          },
        },
      );
      return response.data.data;
    },
    onSuccess: refreshAgreement,
  });
  const recordPayment = useMutation({
    mutationFn: async () => {
      const agreementId = agreementQuery.data?.agreement.id;
      if (!agreementId) throw new Error('Agreement is not finalized');
      const response = await client.post<{ data: AgreementBundle }>(
        `/billing/operator/agreements/${agreementId}/payments`,
        {
          amountMinor: rupeesToPaise(paymentAmount),
          method: paymentMethod,
          reference: emptyToNull(paymentReference),
          paidAt: toIso(paidAt),
          idempotencyKey: paymentKey,
        },
      );
      return response.data.data;
    },
    onSuccess: (bundle) => {
      refreshAgreement(bundle);
      setPaymentAmount('');
      setPaymentReference('');
      setPaidAt('');
      setPaymentKey(crypto.randomUUID());
    },
  });
  const voidPayment = useMutation({
    mutationFn: async (paymentId: string) => {
      const agreementId = agreementQuery.data?.agreement.id;
      if (!agreementId) throw new Error('Agreement is not finalized');
      const response = await client.post<{ data: AgreementBundle }>(
        `/billing/operator/agreements/${agreementId}/payments/${paymentId}/void`,
        { reason: voidReason },
      );
      return response.data.data;
    },
    onSuccess: (bundle) => {
      refreshAgreement(bundle);
      setVoidReason('');
    },
  });
  const issueInvitation = useMutation({
    mutationFn: async () => {
      const agreementId = agreementQuery.data?.agreement.id;
      if (!agreementId) throw new Error('Agreement is not finalized');
      const response = await client.post<{
        data: { onboardingPath: string; message: string; invitation: { expiresAt: string } };
      }>(`/billing/operator/agreements/${agreementId}/onboarding-invitations`, {});
      return response.data.data;
    },
    onSuccess: async (data) => {
      setOneTimeLink(`${window.location.origin}${data.onboardingPath}`);
      await agreementQuery.refetch();
    },
  });
  const revokeInvitation = useMutation({
    mutationFn: async (invitationId: string) => {
      const agreementId = agreementQuery.data?.agreement.id;
      if (!agreementId) throw new Error('Agreement is not finalized');
      const response = await client.post<{ data: AgreementBundle }>(
        `/billing/operator/agreements/${agreementId}/onboarding-invitations/${invitationId}/revoke`,
        { reason: revokeReason },
      );
      return response.data.data;
    },
    onSuccess: (bundle) => {
      refreshAgreement(bundle);
      setRevokeReason('');
    },
  });

  const bundle = agreementQuery.data;
  const hasPublishedCyclePrice = (offer: OperatorPricing): boolean => Boolean(
    offer.pricing?.published
    && (billingCycle === 'monthly'
      ? offer.pricing.monthlyPriceMinor !== null
      : offer.pricing.yearlyPriceMinor !== null),
  );
  const plans = offers.filter((offer) => offer.offerType === 'plan'
    && offer.available && offer.status === 'active' && hasPublishedCyclePrice(offer));
  const addOns = offers.filter((offer) => offer.offerType === 'add_on'
    && offer.available && offer.status === 'active' && hasPublishedCyclePrice(offer));
  const remainingMinor = useMemo(() => bundle
    ? (BigInt(bundle.agreement.agreedTotalMinor) - BigInt(bundle.confirmedTotalMinor)).toString()
    : '0', [bundle]);
  const activeInvitation = bundle?.invitations.find((invitation) =>
    !invitation.revokedAt && !invitation.consumedAt && new Date(invitation.expiresAt) > new Date());
  const formInvalid = !startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)
    || rupeesToPaise(agreedTotalMinor) === null
    || (!planKey && addOnKeys.length === 0)
    || !legalName.trim() || !billingContact.trim() || !billingPhone.trim();
  const actionError = finalize.error ?? recordPayment.error ?? voidPayment.error
    ?? issueInvitation.error ?? revokeInvitation.error;

  if (agreementQuery.isLoading) return <p className="text-sm text-slate-400">Loading commercial agreement…</p>;
  if (agreementQuery.isError) return <p className="text-sm text-rose-300">{errorMessage(agreementQuery.error)}</p>;

  if (!bundle) {
    return (
      <div className="space-y-5 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-5">
        <div>
          <h4 className="font-bold text-white">Finalize commercial agreement</h4>
          <p className="mt-1 text-xs text-slate-400">Current list pricing is recalculated by the backend. Enter the negotiated total in INR rupees.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm text-slate-300">Billing cycle
            <select value={billingCycle} onChange={(event) => setBillingCycle(event.target.value as typeof billingCycle)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select>
          </label>
          <label className="text-sm text-slate-300">Plan
            <select value={planKey} onChange={(event) => setPlanKey(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"><option value="">No plan</option>{plans.map((plan) => <option key={plan.key} value={plan.key}>{plan.name}</option>)}</select>
          </label>
          <Input label="Agreed total ₹" inputMode="decimal" value={agreedTotalMinor} onChange={(event) => setAgreedTotalMinor(event.target.value)} />
          <Input label="Adjustment / complimentary reason" maxLength={500} value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} />
          <Input label="Subscription starts" type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
          <Input label="Subscription ends" type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-300">Final add-ons</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {addOns.map((addOn) => <label key={addOn.key} className="flex items-center gap-2 rounded-xl border border-slate-800 p-3 text-sm text-slate-300"><input type="checkbox" checked={addOnKeys.includes(addOn.key)} onChange={(event) => setAddOnKeys((current) => event.target.checked ? [...current, addOn.key] : current.filter((key) => key !== addOn.key))} />{addOn.name}</label>)}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Billing legal name" maxLength={160} value={legalName} onChange={(event) => setLegalName(event.target.value)} />
          <Input label="Billing contact" maxLength={120} value={billingContact} onChange={(event) => setBillingContact(event.target.value)} />
          <Input label="Billing phone" maxLength={32} value={billingPhone} onChange={(event) => setBillingPhone(event.target.value)} />
          <Input label="Billing email (optional)" type="email" maxLength={254} value={billingEmail} onChange={(event) => setBillingEmail(event.target.value)} />
          <Input label="Address line 1" maxLength={200} value={addressLine1} onChange={(event) => setAddressLine1(event.target.value)} />
          <Input label="Address line 2" maxLength={200} value={addressLine2} onChange={(event) => setAddressLine2(event.target.value)} />
          <Input label="City" maxLength={100} value={city} onChange={(event) => setCity(event.target.value)} />
          <Input label="State" maxLength={100} value={state} onChange={(event) => setState(event.target.value)} />
          <Input label="Postal code" maxLength={20} value={postalCode} onChange={(event) => setPostalCode(event.target.value)} />
          <Input label="GSTIN (optional)" maxLength={15} value={gstin} onChange={(event) => setGstin(event.target.value.toUpperCase())} />
        </div>
        <Button disabled={formInvalid} isLoading={finalize.isPending} onClick={() => finalize.mutate()}><ShieldCheck className="h-4 w-4" /> Finalize agreement</Button>
        {finalize.isError && <p className="text-sm text-rose-300">{errorMessage(finalize.error)}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h4 className="font-bold text-white">Commercial agreement</h4><p className="text-xs text-slate-400">Finalized {new Date(bundle.agreement.finalizedAt).toLocaleString()}</p></div>
        <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-xs font-semibold text-indigo-200">{bundle.agreement.status.replace('_', ' ')}</span>
      </div>
      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Final plan</dt><dd className="font-semibold text-white">{bundle.agreement.listPricingSnapshot.items.find((item) => item.offerType === 'plan')?.name ?? 'No base plan'}</dd></div>
        <div><dt className="text-slate-500">Final add-ons</dt><dd className="font-semibold text-white">{bundle.agreement.listPricingSnapshot.items.filter((item) => item.offerType === 'add_on').map((item) => item.name).join(', ') || 'None'}</dd></div>
        <div><dt className="text-slate-500">Current list subtotal</dt><dd className="font-semibold text-white">{formatInrMinor(bundle.agreement.listSubtotalMinor)}</dd></div>
        <div><dt className="text-slate-500">Agreed total</dt><dd className="font-semibold text-white">{formatInrMinor(bundle.agreement.agreedTotalMinor)}</dd></div>
        <div><dt className="text-slate-500">Confirmed payments</dt><dd className="font-semibold text-white">{formatInrMinor(bundle.confirmedTotalMinor)}</dd></div>
        <div><dt className="text-slate-500">Billing cycle</dt><dd className="capitalize text-white">{bundle.agreement.billingCycle}</dd></div>
        <div><dt className="text-slate-500">Finalized by operator</dt><dd className="break-all text-xs text-slate-300">Platform operator<TechnicalDetails values={{ 'Finalizing operator': bundle.agreement.finalizedByUserId }} /></dd></div>
        <div><dt className="text-slate-500">Period</dt><dd className="text-white">{new Date(bundle.agreement.startsAt).toLocaleDateString()} – {new Date(bundle.agreement.currentPeriodEndsAt).toLocaleDateString()}</dd></div>
      </dl>
      {bundle.agreement.adjustmentReason && <p className="rounded-xl bg-slate-900 p-3 text-sm text-slate-300">Reason: {bundle.agreement.adjustmentReason}</p>}

      {bundle.agreement.status === 'awaiting_payment' && (
        <div className="space-y-3 border-t border-slate-800 pt-4">
          <h5 className="flex items-center gap-2 font-semibold text-white"><ReceiptIndianRupee className="h-4 w-4" /> Record manual payment</h5>
          <p className="text-xs text-slate-400">Remaining: {formatInrMinor(remainingMinor)}. This records the operator's assertion that funds were received.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Amount ₹" inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
            <label className="text-sm text-slate-300">Method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as ManualPaymentMethod)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="other">Other</option></select></label>
            <Input label="Safe reference (optional)" maxLength={160} value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} />
            <Input label="Paid at" type="datetime-local" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} />
          </div>
          <Button size="sm" disabled={(rupeesToPaise(paymentAmount) === null || rupeesToPaise(paymentAmount) === '0') || !paidAt} isLoading={recordPayment.isPending} onClick={() => recordPayment.mutate()}>Record payment</Button>
        </div>
      )}

      {bundle.payments.length > 0 && <div className="space-y-2 border-t border-slate-800 pt-4"><h5 className="font-semibold text-white">Payment history</h5>{bundle.payments.map((payment) => <div key={payment.id} className="rounded-xl bg-slate-900 p-3 text-sm"><div className="flex justify-between gap-3"><span className="text-white">{formatInrMinor(payment.amountMinor)} · {payment.method.replace('_', ' ')}</span><span className={payment.status === 'confirmed' ? 'text-emerald-300' : 'text-rose-300'}>{payment.status}</span></div><p className="text-xs text-slate-500">{new Date(payment.paidAt).toLocaleString()} {payment.reference ? `· ${payment.reference}` : ''}</p><p className="mt-1 break-all text-[11px] text-slate-600">Recorded by platform operator</p>{payment.status === 'confirmed' && ['awaiting_payment', 'paid'].includes(bundle.agreement.status) && <Button size="sm" variant="danger" className="mt-2" disabled={voidReason.trim().length < 3} isLoading={voidPayment.isPending} onClick={() => voidPayment.mutate(payment.id)}><XCircle className="h-4 w-4" /> Void</Button>}</div>)}{bundle.payments.some((payment) => payment.status === 'confirmed') && ['awaiting_payment', 'paid'].includes(bundle.agreement.status) && <Input label="Void reason (required before voiding)" maxLength={500} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} />}</div>}

      {['paid', 'onboarding_pending'].includes(bundle.agreement.status) && (
        <div className="space-y-3 border-t border-slate-800 pt-4">
          <h5 className="flex items-center gap-2 font-semibold text-white"><Link2 className="h-4 w-4" /> Secure onboarding</h5>
          <p className="text-xs text-slate-400">This link is shown once. Generate a replacement if lost. A replacement revokes the previous active link, and raw links are never stored.</p>
          <Button size="sm" isLoading={issueInvitation.isPending} onClick={() => issueInvitation.mutate()}>{activeInvitation ? 'Generate replacement link' : 'Generate onboarding link'}</Button>
          {oneTimeLink && <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3"><p className="text-xs font-semibold text-amber-200">Shown once — copy and share manually.</p><p className="mt-2 break-all text-xs text-slate-200">{oneTimeLink}</p><Button size="sm" variant="secondary" className="mt-2" onClick={() => void navigator.clipboard.writeText(oneTimeLink)}><Copy className="h-4 w-4" /> Copy link</Button></div>}
          {activeInvitation && <div className="space-y-2"><p className="text-xs text-slate-400">Active invitation expires {new Date(activeInvitation.expiresAt).toLocaleString()}</p><Input label="Revocation reason" maxLength={500} value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} /><Button size="sm" variant="danger" disabled={revokeReason.trim().length < 3} isLoading={revokeInvitation.isPending} onClick={() => revokeInvitation.mutate(activeInvitation.id)}>Revoke active link</Button></div>}
        </div>
      )}
      {bundle.agreement.status === 'activated' && <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">Customer organization and subscription are activated.</p>}
      {actionError && <p className="text-sm text-rose-300">{errorMessage(actionError)}</p>}
    </div>
  );
};
