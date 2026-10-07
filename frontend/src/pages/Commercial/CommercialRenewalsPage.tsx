import { rupeesToPaise } from '../../utils/money';
import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  CalendarClock,
  CheckCircle2,
  History,
  ReceiptIndianRupee,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { client } from '../../api/client';
import type { ManualPaymentMethod } from '../../commercial/manualCommercial';
import {
  type CommercialRenewalBundle,
  type CommercialRenewalPreview,
  type RenewalQueueItem,
  type RenewalQueueView,
} from '../../commercial/renewals';
import { formatInrMinor } from '../../commercial/publicCommercial';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { CommercialStepper } from '../../components/commercial/CommercialStepper';

const views: Array<{ value: RenewalQueueView; label: string }> = [
  { value: 'due', label: 'Expires within 30 days' },
  { value: 'expired', label: 'Expired' },
  { value: 'in_progress', label: 'Renewal in progress' },
  { value: 'paid', label: 'Paid awaiting application' },
  { value: 'recent', label: 'Recently renewed' },
  { value: 'all', label: 'All subscriptions' },
];

const errorMessage = (error: unknown): string => {
  if (axios.isAxiosError<{ error?: { message?: string } }>(error)) {
    return error.response?.data?.error?.message ?? 'The renewal action could not be completed.';
  }
  return 'The renewal action could not be completed.';
};

const toIso = (value: string): string => new Date(value).toISOString();
const emptyToNull = (value: string): string | null => value.trim() || null;
const toLocalInput = (value: string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 16);
};
const titleCase = (value: string): string =>
  value.replaceAll('_', ' ').replace(/^./, (character) => character.toUpperCase());

const statusColor = (status: string | null): string => {
  if (status === 'applied') return 'bg-emerald-500/15 text-emerald-300';
  if (status === 'paid') return 'bg-sky-500/15 text-sky-300';
  if (status === 'cancelled') return 'bg-rose-500/15 text-rose-300';
  return 'bg-amber-500/15 text-amber-300';
};

const CommercialRenewalsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [view, setView] = useState<RenewalQueueView>('due');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<RenewalQueueItem | null>(null);
  const [createdRenewalId, setCreatedRenewalId] = useState<string | null>(null);
  const [startingNextRenewal, setStartingNextRenewal] = useState(false);
  const [agreedTotalMinor, setAgreedTotalMinor] = useState('');
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [renewalStartsAt, setRenewalStartsAt] = useState('');
  const [renewalEndsAt, setRenewalEndsAt] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<ManualPaymentMethod>('upi');
  const [paymentReference, setPaymentReference] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [paymentKey, setPaymentKey] = useState(() => crypto.randomUUID());
  const [voidReason, setVoidReason] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  const queueQuery = useQuery({
    queryKey: ['operator-renewal-queue', view, page],
    queryFn: async () => {
      const response = await client.get<{
        data: RenewalQueueItem[];
        pagination: { total: number };
        observedAt: string;
      }>('/billing/operator/renewals', { params: { view, page, limit: 50 } });
      return response.data;
    },
  });
  const activeRenewalId = startingNextRenewal
    ? null
    : createdRenewalId ?? selected?.renewalId ?? null;
  const previewQuery = useQuery({
    queryKey: ['operator-renewal-preview', selected?.subscriptionId],
    enabled: Boolean(selected && !activeRenewalId),
    queryFn: async () => {
      const response = await client.get<{ data: CommercialRenewalPreview }>(
        `/billing/operator/subscriptions/${selected!.subscriptionId}/renewal-preview`,
      );
      return response.data.data;
    },
  });
  const renewalQuery = useQuery({
    queryKey: ['operator-renewal', activeRenewalId],
    enabled: Boolean(activeRenewalId),
    queryFn: async () => {
      const response = await client.get<{ data: CommercialRenewalBundle }>(
        `/billing/operator/renewals/${activeRenewalId}`,
      );
      return response.data.data;
    },
  });
  const setBundle = (bundle: CommercialRenewalBundle) => {
    setStartingNextRenewal(false);
    setCreatedRenewalId(bundle.renewal.id);
    queryClient.setQueryData(['operator-renewal', bundle.renewal.id], bundle);
    void queryClient.invalidateQueries({ queryKey: ['operator-renewal-queue'] });
  };

  const finalize = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error('Select a subscription');
      const response = await client.post<{ data: CommercialRenewalBundle }>(
        `/billing/operator/subscriptions/${selected.subscriptionId}/renewals`,
        {
          organizationId: selected.organizationId,
          agreedTotalMinor: rupeesToPaise(agreedTotalMinor),
          adjustmentReason: emptyToNull(adjustmentReason),
          renewalStartsAt: toIso(renewalStartsAt),
          renewalEndsAt: toIso(renewalEndsAt),
        },
      );
      return response.data.data;
    },
    onSuccess: setBundle,
  });
  const recordPayment = useMutation({
    mutationFn: async () => {
      if (!activeRenewalId) throw new Error('Renewal not found');
      const response = await client.post<{ data: CommercialRenewalBundle }>(
        `/billing/operator/renewals/${activeRenewalId}/payments`,
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
      setBundle(bundle);
      setPaymentAmount('');
      setPaymentReference('');
      setPaidAt('');
      setPaymentKey(crypto.randomUUID());
    },
  });
  const voidPayment = useMutation({
    mutationFn: async (paymentId: string) => {
      if (!activeRenewalId) throw new Error('Renewal not found');
      const response = await client.post<{ data: CommercialRenewalBundle }>(
        `/billing/operator/renewals/${activeRenewalId}/payments/${paymentId}/void`,
        { reason: voidReason },
      );
      return response.data.data;
    },
    onSuccess: (bundle) => {
      setBundle(bundle);
      setVoidReason('');
    },
  });
  const applyRenewal = useMutation({
    mutationFn: async () => {
      if (!activeRenewalId) throw new Error('Renewal not found');
      if (!window.confirm('Apply this settled renewal to the canonical subscription now?')) {
        throw new Error('Renewal application was not confirmed');
      }
      const response = await client.post<{ data: CommercialRenewalBundle }>(
        `/billing/operator/renewals/${activeRenewalId}/apply`,
        {},
      );
      return response.data.data;
    },
    onSuccess: setBundle,
  });
  const cancelRenewal = useMutation({
    mutationFn: async () => {
      if (!activeRenewalId) throw new Error('Renewal not found');
      const response = await client.post<{ data: CommercialRenewalBundle }>(
        `/billing/operator/renewals/${activeRenewalId}/cancel`,
        { reason: cancelReason },
      );
      return response.data.data;
    },
    onSuccess: (bundle) => {
      setBundle(bundle);
      setCancelReason('');
    },
  });

  const bundle = renewalQuery.data;
  const remainingMinor = useMemo(() => bundle
    ? (BigInt(bundle.renewal.agreedTotalMinor) - BigInt(bundle.confirmedTotalMinor)).toString()
    : '0', [bundle]);
  const actionError = finalize.error ?? recordPayment.error ?? voidPayment.error
    ?? applyRenewal.error ?? cancelRenewal.error;
  const createInvalid = !selected || !renewalStartsAt || !renewalEndsAt
    || new Date(renewalEndsAt) <= new Date(renewalStartsAt)
    || rupeesToPaise(agreedTotalMinor) === null;

  const chooseSubscription = (item: RenewalQueueItem) => {
    setSelected(item);
    setCreatedRenewalId(null);
    setStartingNextRenewal(false);
    setAgreedTotalMinor('');
    setAdjustmentReason('');
    setRenewalStartsAt(item.expired ? '' : toLocalInput(item.currentPeriodEndsAt));
    setRenewalEndsAt('');
    setPaymentAmount('');
    setPaymentReference('');
    setPaidAt('');
    setVoidReason('');
    setCancelReason('');
  };
  const startNextRenewal = () => {
    if (!selected) return;
    setCreatedRenewalId(null);
    setStartingNextRenewal(true);
    setAgreedTotalMinor('');
    setAdjustmentReason('');
    setRenewalStartsAt(selected.expired ? '' : toLocalInput(selected.currentPeriodEndsAt));
    setRenewalEndsAt('');
  };
  const totalPages = Math.max(1, Math.ceil((queueQuery.data?.pagination.total ?? 0) / 50));
  const changePage = (nextPage: number) => {
    setPage(nextPage);
    setSelected(null);
    setCreatedRenewalId(null);
    setStartingNextRenewal(false);
  };

  return (
    <div className="space-y-6 p-4 md:p-8">
      <header className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        {bundle && <CommercialStepper steps={[{ label: 'Finalized', complete: true }, { label: 'Payment settled', complete: bundle.settlementSatisfied }, { label: 'Applied', complete: bundle.renewal.status === 'applied' }]} />}
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-500/20 p-3 text-indigo-300"><RefreshCw className="h-7 w-7" /></div>
          <div><h1 className="text-2xl font-bold text-white">Subscriptions & Renewals</h1><p className="text-sm text-slate-400">Manual, exact-settlement subscription lifecycle</p></div>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-bold text-white">Renewal queue</h2><p className="text-sm text-slate-400">{queueQuery.data?.pagination.total ?? 0} matching subscriptions</p></div>
          <select aria-label="Renewal queue view" value={view} onChange={(event) => { setView(event.target.value as RenewalQueueView); setPage(1); setSelected(null); setCreatedRenewalId(null); setStartingNextRenewal(false); }} className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white">
            {views.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </select>
        </div>
        {queueQuery.isError && <p className="mt-3 text-sm text-rose-300">{errorMessage(queueQuery.error)}</p>}
        <div className="mt-5 grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="max-h-[720px] space-y-3 overflow-y-auto pr-1">
            {(queueQuery.data?.data ?? []).map((item) => (
              <button key={item.subscriptionId} type="button" onClick={() => chooseSubscription(item)} className={`w-full rounded-2xl border p-4 text-left ${selected?.subscriptionId === item.subscriptionId ? 'border-indigo-400 bg-indigo-500/10' : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'}`}>
                <div className="flex items-start justify-between gap-3"><div><h3 className="font-bold text-white">{item.organizationName}</h3><p className="text-xs text-slate-500">{item.planName ?? 'Manual module access'}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${statusColor(item.renewalStatus ?? (item.expired ? 'cancelled' : 'awaiting_payment'))}`}>{item.renewalStatus ? titleCase(item.renewalStatus) : item.expired ? 'Expired' : 'Due'}</span></div>
                <p className="mt-3 text-xs text-slate-400">Period ends {item.currentPeriodEndsAt ? new Date(item.currentPeriodEndsAt).toLocaleString() : 'without a boundary'}</p>
                <p className="mt-1 text-xs text-slate-500">{item.addOnNames?.join(', ') || 'No add-ons'} · {item.billingCycle ?? 'No cycle'}</p>
              </button>
            ))}
            {queueQuery.data?.data.length === 0 && <p className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-500">No subscriptions match this view.</p>}
            {totalPages > 1 && <div className="flex items-center justify-between gap-3 pt-2"><Button size="sm" variant="secondary" disabled={page <= 1 || queueQuery.isFetching} onClick={() => changePage(page - 1)}>Previous</Button><span className="text-xs text-slate-400">Page {page} of {totalPages}</span><Button size="sm" variant="secondary" disabled={page >= totalPages || queueQuery.isFetching} onClick={() => changePage(page + 1)}>Next</Button></div>}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
            {!selected && <p className="py-24 text-center text-slate-500">Select a subscription to review its renewal lifecycle.</p>}
            {selected && !activeRenewalId && (
              <div className="space-y-5">
                <div><h3 className="text-xl font-bold text-white">Finalize renewal</h3><p className="text-sm text-slate-400">Review the current server-calculated package and list pricing before entering the negotiated amount. Finalization reloads these facts again. Package changes remain a separate operator action.</p></div>
                <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Organization</dt><dd className="font-semibold text-white">{selected.organizationName}</dd></div><div><dt className="text-slate-500">Current plan</dt><dd className="font-semibold text-white">{selected.planName ?? 'No base plan'}</dd></div><div><dt className="text-slate-500">Add-ons</dt><dd className="text-white">{selected.addOnNames?.join(', ') || 'None'}</dd></div><div><dt className="text-slate-500">Lifecycle</dt><dd className="text-white">{selected.expired ? 'Reactivation after expiry' : 'Continuous renewal'}</dd></div></dl>
                {previewQuery.isLoading && <p className="rounded-xl border border-slate-800 bg-slate-900 p-3 text-sm text-slate-400">Calculating the authoritative list-price preview…</p>}
                {previewQuery.isError && <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-200">{errorMessage(previewQuery.error)}</p>}
                {previewQuery.data && <div className="rounded-xl border border-slate-800 bg-slate-900 p-3"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold uppercase text-slate-500">Current server list-price preview</p><p className="font-bold text-white">{previewQuery.data.listSubtotalMinor === null ? 'List amount unavailable — agree terms manually' : formatInrMinor(previewQuery.data.listSubtotalMinor)}</p></div>{previewQuery.data.listPricingSnapshot.items.map((item) => <div key={`${item.offerType}:${item.key}`} className="mt-2 flex justify-between gap-3 text-sm"><span className="text-slate-300">{item.name}</span><span className="text-white">{item.priceMinor === null ? 'Amount to confirm' : formatInrMinor(item.priceMinor)}</span></div>)}</div>}
                {selected.expired && <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-100">Enter and review an explicit non-backdated reactivation start. The backend will not silently fill the expired gap.</p>}
                <div className="grid gap-3 sm:grid-cols-2"><Input label="Agreed renewal total ₹" inputMode="decimal" value={agreedTotalMinor} onChange={(event) => setAgreedTotalMinor(event.target.value)} /><Input label="Negotiated / complimentary reason" maxLength={500} value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} /><Input label="Renewal starts" type="datetime-local" value={renewalStartsAt} onChange={(event) => setRenewalStartsAt(event.target.value)} /><Input label="Renewal ends" type="datetime-local" value={renewalEndsAt} onChange={(event) => setRenewalEndsAt(event.target.value)} /></div>
                <Button disabled={createInvalid || !previewQuery.data} isLoading={finalize.isPending} onClick={() => finalize.mutate()}><ShieldCheck className="h-4 w-4" /> Finalize renewal</Button>
              </div>
            )}
            {selected && activeRenewalId && renewalQuery.isLoading && <p className="py-20 text-center text-slate-400">Loading renewal…</p>}
            {renewalQuery.isError && <p className="text-rose-300">{errorMessage(renewalQuery.error)}</p>}
            {bundle && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-bold text-white">Renewal history</h3><p className="text-sm capitalize text-slate-400">{bundle.renewal.renewalKind} · {bundle.renewal.billingCycle}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusColor(bundle.renewal.status)}`}>{titleCase(bundle.renewal.status)}</span></div>
                <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Previous period</dt><dd className="text-white">{new Date(bundle.renewal.priorPeriodStartsAt).toLocaleDateString()} – {new Date(bundle.renewal.priorPeriodEndsAt).toLocaleDateString()}</dd></div><div><dt className="text-slate-500">Renewal period</dt><dd className="text-white">{new Date(bundle.renewal.renewalStartsAt).toLocaleDateString()} – {new Date(bundle.renewal.renewalEndsAt).toLocaleDateString()}</dd></div><div><dt className="text-slate-500">List subtotal</dt><dd className="font-semibold text-white">{bundle.renewal.listSubtotalMinor === null ? 'Not fully published' : formatInrMinor(bundle.renewal.listSubtotalMinor)}</dd></div><div><dt className="text-slate-500">Agreed total</dt><dd className="font-semibold text-white">{formatInrMinor(bundle.renewal.agreedTotalMinor)}</dd></div><div><dt className="text-slate-500">Confirmed settlement</dt><dd className="font-semibold text-white">{formatInrMinor(bundle.confirmedTotalMinor)}</dd></div><div><dt className="text-slate-500">Package</dt><dd className="text-white">{bundle.renewal.packageSnapshot.plan?.name ?? 'No plan'} · {bundle.renewal.packageSnapshot.addOns.map((item) => item.name).join(', ') || 'No add-ons'}</dd></div></dl>
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-3"><p className="text-xs font-semibold uppercase text-slate-500">Server list-price snapshot</p>{bundle.renewal.listPricingSnapshot.items.map((item) => <div key={`${item.offerType}:${item.key}`} className="mt-2 flex justify-between gap-3 text-sm"><span className="text-slate-300">{item.name}</span><span className="text-white">{item.priceMinor === null ? 'Not published' : formatInrMinor(item.priceMinor)}</span></div>)}</div>
                {bundle.renewal.adjustmentReason && <p className="rounded-xl bg-slate-900 p-3 text-sm text-slate-300">Reason: {bundle.renewal.adjustmentReason}</p>}

                {bundle.renewal.status === 'awaiting_payment' && <div className="space-y-3 border-t border-slate-800 pt-4"><h4 className="flex items-center gap-2 font-semibold text-white"><ReceiptIndianRupee className="h-4 w-4" /> Record manual renewal payment</h4><p className="text-xs text-slate-400">Remaining {formatInrMinor(remainingMinor)}. This records a human-confirmed payment fact; it is not gateway verification.</p><div className="grid gap-3 sm:grid-cols-2"><Input label="Amount ₹" inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} /><label className="text-sm text-slate-300">Method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as ManualPaymentMethod)} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="other">Other</option></select></label><Input label="Safe reference (optional)" maxLength={160} value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} /><Input label="Paid at" type="datetime-local" value={paidAt} onChange={(event) => setPaidAt(event.target.value)} /></div><Button size="sm" disabled={(rupeesToPaise(paymentAmount) === null || rupeesToPaise(paymentAmount) === '0') || !paidAt} isLoading={recordPayment.isPending} onClick={() => recordPayment.mutate()}>Record payment</Button></div>}

                {bundle.payments.length > 0 && <div className="space-y-2 border-t border-slate-800 pt-4"><h4 className="flex items-center gap-2 font-semibold text-white"><History className="h-4 w-4" /> Renewal payment history</h4>{bundle.payments.map((payment) => <div key={payment.id} className="rounded-xl bg-slate-900 p-3 text-sm"><div className="flex justify-between gap-3"><span className="text-white">{formatInrMinor(payment.amountMinor)} · {payment.method.replace('_', ' ')}</span><span className={payment.status === 'confirmed' ? 'text-emerald-300' : 'text-rose-300'}>{titleCase(payment.status)}</span></div><p className="mt-1 text-xs text-slate-500">{new Date(payment.paidAt).toLocaleString()} {payment.reference ? `· ${payment.reference}` : ''}</p>{payment.status === 'confirmed' && ['awaiting_payment', 'paid'].includes(bundle.renewal.status) && <Button size="sm" variant="danger" className="mt-2" disabled={voidReason.trim().length < 3} isLoading={voidPayment.isPending} onClick={() => voidPayment.mutate(payment.id)}><XCircle className="h-4 w-4" /> Void payment</Button>}</div>)}{bundle.payments.some(({ status }) => status === 'confirmed') && ['awaiting_payment', 'paid'].includes(bundle.renewal.status) && <Input label="Void reason" maxLength={500} value={voidReason} onChange={(event) => setVoidReason(event.target.value)} />}</div>}

                {bundle.renewal.status === 'paid' && <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4"><h4 className="flex items-center gap-2 font-semibold text-emerald-200"><CheckCircle2 className="h-5 w-5" /> Exact settlement confirmed</h4><p className="mt-1 text-xs text-emerald-100/70">Final application atomically updates the canonical subscription. Confirm the reviewed period before applying.</p><Button className="mt-3" isLoading={applyRenewal.isPending} onClick={() => applyRenewal.mutate()}><CalendarClock className="h-4 w-4" /> Apply renewal</Button></div>}
                {['awaiting_payment', 'paid'].includes(bundle.renewal.status) && <div className="space-y-2 border-t border-slate-800 pt-4"><Input label="Cancellation reason" maxLength={500} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /><Button size="sm" variant="danger" disabled={cancelReason.trim().length < 3} isLoading={cancelRenewal.isPending} onClick={() => cancelRenewal.mutate()}>Cancel renewal</Button></div>}
                {['applied', 'cancelled'].includes(bundle.renewal.status) && <div className="border-t border-slate-800 pt-4"><Button size="sm" variant="secondary" onClick={startNextRenewal}><RefreshCw className="h-4 w-4" /> Create next renewal</Button></div>}
                {bundle.renewal.status === 'applied' && <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">Renewal applied once on {bundle.renewal.appliedAt ? new Date(bundle.renewal.appliedAt).toLocaleString() : 'the recorded application time'}.</p>}
                {bundle.renewal.status === 'cancelled' && <p className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">Cancelled: {bundle.renewal.cancellationReason}</p>}
              </div>
            )}
            {actionError && <p className="mt-4 text-sm text-rose-300">{errorMessage(actionError)}</p>}
          </div>
        </div>
      </section>
    </div>
  );
};

export default CommercialRenewalsPage;
