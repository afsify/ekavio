import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { BadgeIndianRupee, CheckCircle2, ClipboardList, Save, UserRound } from 'lucide-react';
import { client } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import {
  formatInrMinor,
  type AccessRequestStatus,
  type OperatorAccessRequest,
  type OperatorPricing,
} from '../../commercial/publicCommercial';

const errorMessage = (error: unknown): string => {
  if (axios.isAxiosError<{ message?: string }>(error)) {
    return error.response?.data?.message ?? 'The operation could not be completed.';
  }
  return 'The operation could not be completed.';
};

const PricingEditor: React.FC<{ offer: OperatorPricing }> = ({ offer }) => {
  const queryClient = useQueryClient();
  const [monthly, setMonthly] = useState(offer.pricing?.monthlyPriceMinor ?? '');
  const [yearly, setYearly] = useState(offer.pricing?.yearlyPriceMinor ?? '');
  const [published, setPublished] = useState(offer.pricing?.published ?? false);
  const [displayOrder, setDisplayOrder] = useState(String(offer.pricing?.displayOrder ?? 0));
  const [marketingLabel, setMarketingLabel] = useState(offer.pricing?.marketingLabel ?? '');
  const update = useMutation({
    mutationFn: async () => {
      await client.put(`/billing/operator/public-pricing/${offer.offerType}/${offer.key}`, {
        currency: 'INR',
        monthlyPriceMinor: monthly || null,
        yearlyPriceMinor: yearly || null,
        published,
        displayOrder: Number(displayOrder),
        marketingLabel: marketingLabel.trim() || null,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['operator-public-pricing'] }),
  });
  const invalidAmount = (value: string) => value !== '' && !/^(0|[1-9][0-9]{0,12})$/.test(value);
  const invalid = invalidAmount(monthly) || invalidAmount(yearly)
    || !/^\d{1,5}$/.test(displayOrder)
    || Number(displayOrder) > 10000
    || (published && !monthly && !yearly);

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{offer.offerType.replace('_', ' ')}</p>
          <h3 className="font-bold text-white">{offer.name}</h3>
          <p className="text-xs text-slate-500">{offer.key}</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} />
          Published
        </label>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Input label="Monthly paise" inputMode="numeric" value={monthly} onChange={(event) => setMonthly(event.target.value)} />
        <Input label="Yearly paise" inputMode="numeric" value={yearly} onChange={(event) => setYearly(event.target.value)} />
        <Input label="Display order" inputMode="numeric" value={displayOrder} onChange={(event) => setDisplayOrder(event.target.value)} />
        <Input label="Marketing label" maxLength={80} value={marketingLabel} onChange={(event) => setMarketingLabel(event.target.value)} />
      </div>
      {invalid && <p className="mt-3 text-xs text-rose-300">Use non-negative whole paise amounts; published pricing needs at least one amount.</p>}
      {update.isError && <p className="mt-3 text-xs text-rose-300">{errorMessage(update.error)}</p>}
      <Button
        size="sm"
        className="mt-4 w-full"
        disabled={invalid || !offer.available || offer.status !== 'active'}
        isLoading={update.isPending}
        onClick={() => update.mutate()}
      >
        <Save className="h-4 w-4" /> Save pricing
      </Button>
    </div>
  );
};

const statusStyle: Record<AccessRequestStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-300',
  contacted: 'bg-sky-500/15 text-sky-300',
  approved: 'bg-emerald-500/15 text-emerald-300',
  rejected: 'bg-rose-500/15 text-rose-300',
  activated: 'bg-indigo-500/15 text-indigo-300',
};

const CommercialRequestsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'' | AccessRequestStatus>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [internalNote, setInternalNote] = useState('');
  const pricingQuery = useQuery({
    queryKey: ['operator-public-pricing'],
    queryFn: async () => {
      const response = await client.get<{ data: OperatorPricing[] }>('/billing/operator/public-pricing');
      return response.data.data;
    },
  });
  const requestsQuery = useQuery({
    queryKey: ['operator-access-requests', status],
    queryFn: async () => {
      const response = await client.get<{
        data: OperatorAccessRequest[];
        pagination: { total: number };
      }>('/billing/operator/access-requests', { params: { ...(status ? { status } : {}), limit: 100 } });
      return response.data;
    },
  });
  const requestQuery = useQuery({
    queryKey: ['operator-access-request', selectedId],
    enabled: Boolean(selectedId),
    queryFn: async () => {
      const response = await client.get<{ data: OperatorAccessRequest }>(
        `/billing/operator/access-requests/${selectedId}`,
      );
      return response.data.data;
    },
  });
  const updateRequest = useMutation({
    mutationFn: async (body: { status?: 'contacted' | 'approved' | 'rejected'; internalNote?: string | null }) => {
      if (!selectedId) throw new Error('No request selected');
      const response = await client.patch<{ data: OperatorAccessRequest }>(
        `/billing/operator/access-requests/${selectedId}`,
        body,
      );
      return response.data.data;
    },
    onSuccess: async (updated) => {
      queryClient.setQueryData(['operator-access-request', selectedId], updated);
      setInternalNote(updated.internalNote ?? '');
      await queryClient.invalidateQueries({ queryKey: ['operator-access-requests'] });
    },
  });
  const selected = requestQuery.data;
  const transitions = selected?.status === 'pending'
    ? (['contacted', 'approved', 'rejected'] as const)
    : selected?.status === 'contacted'
      ? (['approved', 'rejected'] as const)
      : [];

  return (
    <div className="space-y-8 p-4 md:p-8">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-500/20 p-3 text-indigo-300"><ClipboardList className="h-7 w-7" /></div>
          <div>
            <h1 className="text-2xl font-bold text-white">Commercial Intake</h1>
            <p className="text-sm text-slate-400">Platform-operator pricing and public access-request review</p>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="mb-5 flex items-center gap-2">
          <BadgeIndianRupee className="h-5 w-5 text-indigo-400" />
          <div>
            <h2 className="text-lg font-bold text-white">Public list pricing</h2>
            <p className="text-sm text-slate-400">Amounts are whole paise. Unpublished values never appear publicly.</p>
          </div>
        </div>
        {pricingQuery.isError && <p className="text-rose-300">{errorMessage(pricingQuery.error)}</p>}
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {(pricingQuery.data ?? []).map((offer) => <PricingEditor key={`${offer.offerType}:${offer.key}`} offer={offer} />)}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white">Access requests</h2>
            <p className="text-sm text-slate-400">{requestsQuery.data?.pagination.total ?? 0} matching requests</p>
          </div>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
            className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white"
          >
            <option value="">All statuses</option>
            {(['pending', 'contacted', 'approved', 'rejected'] as const).map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </div>
        {requestsQuery.isError && <p className="text-rose-300">{errorMessage(requestsQuery.error)}</p>}
        <div className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="max-h-[680px] space-y-3 overflow-y-auto pr-1">
            {(requestsQuery.data?.data ?? []).map((request) => (
              <button
                type="button"
                key={request.id}
                onClick={() => {
                  setSelectedId(request.id);
                  setInternalNote(request.internalNote ?? '');
                }}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  selectedId === request.id ? 'border-indigo-400 bg-indigo-500/10' : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div><h3 className="font-bold text-white">{request.businessName}</h3><p className="text-sm text-slate-400">{request.contactName}</p></div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle[request.status]}`}>{request.status}</span>
                </div>
                <div className="mt-3 flex justify-between text-xs text-slate-500">
                  <span className="capitalize">{request.billingCycle}</span>
                  <span>{formatInrMinor(request.subtotalMinor)}</span>
                </div>
              </button>
            ))}
            {requestsQuery.data?.data.length === 0 && <p className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-500">No requests match this filter.</p>}
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
            {!selected && <p className="py-20 text-center text-slate-500">Select an access request to review it.</p>}
            {selected && (
              <div className="space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <div><h3 className="text-xl font-bold text-white">{selected.businessName}</h3><p className="text-sm text-slate-400">{selected.businessType}</p></div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyle[selected.status]}`}>{selected.status}</span>
                </div>
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-xl bg-slate-900 p-4"><p className="text-xs text-slate-500">Contact</p><p className="mt-1 text-white">{selected.contactName}</p><p className="text-slate-400">{selected.contactPhone}</p><p className="text-slate-400">{selected.email ?? 'No email supplied'}</p></div>
                  <div className="rounded-xl bg-slate-900 p-4"><p className="text-xs text-slate-500">Submitted</p><p className="mt-1 text-white">{new Date(selected.createdAt).toLocaleString()}</p><p className="mt-2 capitalize text-slate-400">{selected.billingCycle} · {formatInrMinor(selected.subtotalMinor)}</p></div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-slate-300">Accepted list-price snapshot</h4>
                  <ul className="mt-2 space-y-2">
                    {selected.pricingSnapshot.items.map((item) => (
                      <li key={`${item.offerType}:${item.key}`} className="flex justify-between rounded-xl bg-slate-900 px-4 py-3 text-sm"><span className="text-slate-300">{item.name}</span><span className="font-semibold text-white">{formatInrMinor(item.priceMinor)}</span></li>
                    ))}
                  </ul>
                </div>
                {selected.publicNote && <div><p className="text-xs font-semibold uppercase text-slate-500">Customer note</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{selected.publicNote}</p></div>}
                <div>
                  <label htmlFor="operator-note" className="text-xs font-semibold uppercase text-slate-500">Internal operator note</label>
                  <textarea id="operator-note" maxLength={1000} rows={4} value={internalNote} onChange={(event) => setInternalNote(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-500" />
                  <Button size="sm" variant="secondary" className="mt-2" isLoading={updateRequest.isPending} onClick={() => updateRequest.mutate({ internalNote: internalNote.trim() || null })}><Save className="h-4 w-4" /> Save note</Button>
                </div>
                {transitions.length > 0 && (
                  <div className="flex flex-wrap gap-2 border-t border-slate-800 pt-5">
                    {transitions.map((nextStatus) => (
                      <Button key={nextStatus} size="sm" variant={nextStatus === 'rejected' ? 'danger' : 'primary'} isLoading={updateRequest.isPending} onClick={() => updateRequest.mutate({ status: nextStatus, internalNote: internalNote.trim() || null })}>
                        {nextStatus === 'approved' ? <CheckCircle2 className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                        Mark {nextStatus}
                      </Button>
                    ))}
                  </div>
                )}
                {selected.status === 'approved' && (
                  <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-100/80">
                    Commercial/payment activation is completed manually in the next workflow.
                  </p>
                )}
                {updateRequest.isError && <p className="text-sm text-rose-300">{errorMessage(updateRequest.error)}</p>}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default CommercialRequestsPage;
