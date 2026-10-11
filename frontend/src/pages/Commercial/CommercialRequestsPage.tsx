import React, { useState } from 'react';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { CommercialActivationPanel } from './CommercialActivationPanel';
import { rupeesToPaise, paiseToRupees } from '../../utils/money';
import { TechnicalDetails } from '../../components/ui/TechnicalDetails';
import { OfferCard } from '../../components/commercial/OfferCard';
import { CommercialReview, type CommercialCommand } from '../../components/commercial/CommercialReview';
import { useOperationalScope } from '../../hooks/useOperationalContext';
import { uncertainWrite } from '../../utils/mutationOutcome';
import { CommercialStepper } from '../../components/commercial/CommercialStepper';

const errorMessage = (error: unknown): string => {
  if (axios.isAxiosError<{ message?: string; error?: { message?: string } }>(error)) {
    if ((error.response?.status ?? 500) >= 500) return 'The operation could not be completed.';
    return error.response?.data?.message ?? error.response?.data?.error?.message ?? 'The operation could not be completed.';
  }
  return 'The operation could not be completed.';
};

const PricingEditor: React.FC<{ offer: OperatorPricing }> = ({ offer }) => {
  const queryClient = useQueryClient();
  const [command,setCommand]=useState<CommercialCommand|null>(null);
  const [monthly, setMonthly] = useState(paiseToRupees(offer.pricing?.monthlyPriceMinor));
  const [pricingMode, setPricingMode] = useState<'fixed' | 'contact'>(offer.pricing?.pricingMode ?? 'fixed');
  const [yearly, setYearly] = useState(paiseToRupees(offer.pricing?.yearlyPriceMinor));
  const [published, setPublished] = useState(offer.pricing?.published ?? false);
  const [displayOrder, setDisplayOrder] = useState(String(offer.pricing?.displayOrder ?? 0));
  const [marketingLabel, setMarketingLabel] = useState(offer.pricing?.marketingLabel ?? '');
  const update = useMutation({
    mutationFn: async () => {
      await client.put(`/billing/operator/public-pricing/${offer.offerType}/${offer.key}`, {
        currency: 'INR',
        pricingMode,
        monthlyPriceMinor: pricingMode === 'contact' ? null : monthly ? rupeesToPaise(monthly) : null,
        yearlyPriceMinor: pricingMode === 'contact' ? null : yearly ? rupeesToPaise(yearly) : null,
        published,
        displayOrder: Number(displayOrder),
        marketingLabel: marketingLabel.trim() || null,
      });
    },
    onSuccess: async () => {setCommand(null);await queryClient.invalidateQueries({ queryKey: ['operator-public-pricing'] });},
  });
  const invalidAmount = (value: string) => value !== '' && rupeesToPaise(value) === null;
  const invalid = (pricingMode === 'fixed' && (invalidAmount(monthly) || invalidAmount(yearly)))
    || !/^\d{1,5}$/.test(displayOrder)
    || Number(displayOrder) > 10000
    || (pricingMode === 'fixed' && published && !monthly && !yearly);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-5"><fieldset className="page-stack min-w-0" disabled={Boolean(command)||update.isPending||uncertainWrite(update.error)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider muted">{offer.offerType.replace('_', ' ')}</p>
          <h3 className="font-bold text-foreground">{offer.name}</h3>
          <TechnicalDetails values={{ 'Offer key': offer.key }} />
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input type="checkbox" checked={published} onChange={(event) => setPublished(event.target.checked)} />
          Published
        </label>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="field">Pricing mode<select value={pricingMode} onChange={(event) => setPricingMode(event.target.value as typeof pricingMode)}><option value="fixed">Fixed published price</option><option value="contact">Contact for pricing</option></select></label>
        <Input label="Monthly price ₹" disabled={pricingMode === 'contact'} inputMode="decimal" value={monthly} onChange={(event) => setMonthly(event.target.value)} />
        <Input label="Yearly price ₹" disabled={pricingMode === 'contact'} inputMode="decimal" value={yearly} onChange={(event) => setYearly(event.target.value)} />
        <Input label="Display order" inputMode="numeric" value={displayOrder} onChange={(event) => setDisplayOrder(event.target.value)} />
        <Input label="Marketing label" maxLength={80} value={marketingLabel} onChange={(event) => setMarketingLabel(event.target.value)} />
      </div>
      {invalid && <p className="mt-3 text-xs text-[var(--error)]">Enter rupees with up to two decimal places; published pricing needs at least one amount.</p>}
      {update.isError && <p className="mt-3 text-xs text-[var(--error)]">{errorMessage(update.error)}</p>}
      <Button
        size="sm"
        className="mt-4 w-full"
        disabled={invalid || !offer.available || offer.status !== 'active'}
        isLoading={update.isPending}
        onClick={() => {update.reset();setCommand({title:'Save pricing',submit:()=>update.mutate(),facts:<><h3>{offer.name}</h3><p>{pricingMode==='contact'?'Contact for pricing — no fabricated amount':`Monthly ₹${monthly||'Not published'} · Yearly ₹${yearly||'Not published'}`} · {published?'Publicly published':'Unpublished'}</p><p>Order: {displayOrder} · Label: {marketingLabel||'None'}</p><p>Only future public catalogue pricing changes. Historical accepted requests and finalized agreements remain frozen.</p></>});}}
      >
        <Save className="h-4 w-4" /> Save pricing
      </Button>
      <details className="mt-4"><summary>Public card preview</summary><p className="muted text-xs">Draft preview only. Unpublished offers stay hidden publicly.</p>{(['monthly', 'yearly'] as const).map((cycle) => <OfferCard key={cycle} cycle={cycle} offer={{ offerType: offer.offerType, key: offer.key, name: offer.name, description: offer.description ?? '', available: true, category: offer.category ?? '', moduleKeys: offer.moduleKeys ?? [], capabilities: offer.capabilities ?? [], marketingLabel: marketingLabel || null, pricing: { currency: 'INR', pricingMode, monthlyPriceMinor: pricingMode === 'contact' ? null : monthly ? rupeesToPaise(monthly) : null, yearlyPriceMinor: pricingMode === 'contact' ? null : yearly ? rupeesToPaise(yearly) : null, billingCycles: ['monthly', 'yearly'] } }} />)}</details>
    </fieldset><CommercialReview command={command} busy={update.isPending} error={update.error} close={()=>setCommand(null)}/>{uncertainWrite(update.error)&&<p role="alert">Outcome uncertain. Reload pricing and compare persisted terms before another update.</p>}</div>
  );
};

const statusStyle: Record<AccessRequestStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-300',
  contacted: 'bg-sky-500/15 text-sky-300',
  approved: 'bg-emerald-500/15 text-emerald-300',
  rejected: 'bg-rose-500/15 text-[var(--error)]',
  activated: 'bg-indigo-500/15 text-indigo-300',
};

const CommercialRequestsPage: React.FC = () => {const scope=useOperationalScope();return <RequestsWorkspace key={JSON.stringify(scope)}/>;};
const RequestsWorkspace: React.FC = () => {
  const scope=useOperationalScope();
  const pendingCommands=useIsMutating();
  const [command,setCommand]=useState<CommercialCommand|null>(null);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'' | AccessRequestStatus>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [internalNote, setInternalNote] = useState('');
  const pricingQuery = useQuery({
    queryKey: ['operator-public-pricing', ...scope],
    queryFn: async ({signal}) => {
      const response = await client.get<{ data: OperatorPricing[] }>('/billing/operator/public-pricing',{signal});
      return response.data.data;
    },
  });
  const requestsQuery = useQuery({
    queryKey: ['operator-access-requests', ...scope, status, search, page],
    queryFn: async ({signal}) => {
      const response = await client.get<{
        data: OperatorAccessRequest[];
        pagination: { total: number };
      }>('/billing/operator/access-requests', { signal, params: { ...(status ? { status } : {}), ...(search.trim() ? { search: search.trim() } : {}), page, limit: 25 } });
      return response.data;
    },
  });
  const requestQuery = useQuery({
    queryKey: ['operator-access-request', ...scope, selectedId],
    enabled: Boolean(selectedId),
    queryFn: async ({signal}) => {
      const response = await client.get<{ data: OperatorAccessRequest }>(
        `/billing/operator/access-requests/${selectedId}`, {signal},
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
      queryClient.setQueryData(['operator-access-request', ...scope, selectedId], updated);
      setInternalNote(updated.internalNote ?? '');
      setCommand(null);
      await queryClient.invalidateQueries({ queryKey: ['operator-access-requests'] });
    },
  });
  const selected = requestQuery.data;
  const review=(body:{status?:'contacted'|'approved'|'rejected';internalNote?:string|null})=>{updateRequest.reset();setCommand({title:body.status?'Mark '+body.status:'Save note',submit:()=>updateRequest.mutate(body),facts:<><h3>{selected?.businessName}</h3><p>{selected?.publicReference} · {selected?.status} → {body.status??'unchanged'}</p><p>Internal note: {body.internalNote||'None'}</p><p>This changes only the reviewed intake record. Approval alone does not create an organization, paid subscription or onboarding authority.</p></>});};
  const transitions = selected?.status === 'pending'
    ? (['contacted', 'approved', 'rejected'] as const)
    : selected?.status === 'contacted'
      ? (['approved', 'rejected'] as const)
      : [];

  return (
    <div className="page-stack commercial-workspace min-w-0"><fieldset className="page-stack min-w-0" disabled={Boolean(command)||pendingCommands>0||uncertainWrite(updateRequest.error)}>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-500/20 p-3 text-indigo-300"><ClipboardList className="h-7 w-7" /></div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Commercial Intake</h1>
            <p className="text-sm muted">Platform-operator pricing and public access-request review</p>
          </div>
        </div>
      </div>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="mb-5 flex items-center gap-2">
          <BadgeIndianRupee className="h-5 w-5 text-indigo-400" />
          <div>
            <h2 className="text-lg font-bold text-foreground">Public list pricing</h2>
            <p className="text-sm muted">Enter prices in INR rupees. Unpublished values never appear publicly.</p>
          </div>
        </div>
        {pricingQuery.isError && <p className="text-[var(--error)]">{errorMessage(pricingQuery.error)}</p>}
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {(pricingQuery.data ?? []).map((offer) => <PricingEditor key={`${offer.offerType}:${offer.key}`} offer={offer} />)}
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Access requests</h2>
            <p className="text-sm muted">{requestsQuery.data?.pagination.total ?? 0} matching requests</p>
          </div>
          <select
            aria-label="Request status"
            value={status}
            onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1); setSelectedId(null); }}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-foreground"
          >
            <option value="">All statuses</option>
            {(['pending', 'contacted', 'approved', 'rejected', 'activated'] as const).map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </div>
        <Input label="Search reference, business or contact" maxLength={120} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); setSelectedId(null); }} />
        <div className="pagination mt-3"><Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => { setPage(page - 1); setSelectedId(null); }}>Previous</Button><span>Page {page}</span><Button size="sm" variant="secondary" disabled={page * 25 >= (requestsQuery.data?.pagination.total ?? 0)} onClick={() => { setPage(page + 1); setSelectedId(null); }}>Next</Button></div>
        {requestsQuery.isError && <p className="text-[var(--error)]">{errorMessage(requestsQuery.error)}</p>}
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
                  selectedId === request.id ? 'border-indigo-400 bg-indigo-500/10' : 'border-[var(--border)] bg-[var(--surface-muted)] hover:border-[var(--border)]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div><h3 className="font-bold text-foreground">{request.businessName}</h3><p className="text-sm muted">{request.contactName}</p><p className="text-xs break-all muted">{request.publicReference}</p></div>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle[request.status]}`}>{request.status}</span>
                </div>
                <div className="mt-3 flex justify-between text-xs muted">
                  <span className="capitalize">{request.billingCycle}</span>
                  <span>{formatInrMinor(request.subtotalMinor)}</span>
                </div>
              </button>
            ))}
            {requestsQuery.data?.data.length === 0 && <p className="rounded-xl border border-dashed border-[var(--border)] p-8 text-center muted">No requests match this filter.</p>}
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] p-5">
            {!selected && <p className="py-20 text-center muted">Select an access request to review it.</p>}
            {selected && (
              <div className="space-y-6">
                <div className="flex items-start justify-between gap-4">
                  <div><h3 className="text-xl font-bold text-foreground">{selected.businessName}</h3><p className="text-sm muted">{selected.businessType}</p></div>
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyle[selected.status]}`}>{selected.status}</span>
                </div>
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <p className="public-reference sm:col-span-2">{selected.publicReference}</p>
                  <div className="rounded-xl bg-[var(--surface)] p-4"><p className="text-xs muted">Contact</p><p className="mt-1 text-foreground">{selected.contactName}</p><p className="muted">{selected.contactPhone}</p><p className="muted">{selected.email ?? 'No email supplied'}</p></div>
                  <div className="rounded-xl bg-[var(--surface)] p-4"><p className="text-xs muted">Submitted</p><p className="mt-1 text-foreground">{new Date(selected.createdAt).toLocaleString()}</p><p className="mt-2 capitalize muted">{selected.billingCycle} · {formatInrMinor(selected.subtotalMinor)}</p></div>
                </div>
                {selected.status !== 'approved' && selected.status !== 'activated' && <CommercialStepper steps={[{ label: 'Request', complete: true }, { label: selected.status === 'rejected' ? 'Rejected' : 'Contacted', complete: selected.status === 'contacted' || selected.status === 'rejected' }, { label: 'Approved', complete: false }, { label: 'Agreement', complete: false }, { label: 'Payment settled', complete: false }, { label: 'Onboarding', complete: false }, { label: 'Activated', complete: false }]} />}
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Accepted list-price snapshot</h4>
                  <ul className="mt-2 space-y-2">
                    {selected.pricingSnapshot.items.map((item) => (
                      <li key={`${item.offerType}:${item.key}`} className="flex justify-between rounded-xl bg-[var(--surface)] px-4 py-3 text-sm"><span className="text-foreground">{item.name}</span><span className="font-semibold text-foreground">{formatInrMinor(item.priceMinor)}</span></li>
                    ))}
                  </ul>
                </div>
                {selected.publicNote && <div><p className="text-xs font-semibold uppercase muted">Customer note</p><p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{selected.publicNote}</p></div>}
                <div>
                  <label htmlFor="operator-note" className="text-xs font-semibold uppercase muted">Internal operator note</label>
                  <textarea id="operator-note" maxLength={1000} rows={4} value={internalNote} onChange={(event) => setInternalNote(event.target.value)} className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-foreground outline-none focus:border-indigo-500" />
                  <Button size="sm" variant="secondary" className="mt-2" isLoading={updateRequest.isPending} onClick={() => review({ internalNote: internalNote.trim() || null })}><Save className="h-4 w-4" /> Save note</Button>
                </div>
                {transitions.length > 0 && (
                  <div className="flex flex-wrap gap-2 border-t border-[var(--border)] pt-5">
                    {transitions.map((nextStatus) => (
                      <Button key={nextStatus} size="sm" variant={nextStatus === 'rejected' ? 'danger' : 'primary'} isLoading={updateRequest.isPending} onClick={() => review({ status: nextStatus, internalNote: internalNote.trim() || null })}>
                        {nextStatus === 'approved' ? <CheckCircle2 className="h-4 w-4" /> : <UserRound className="h-4 w-4" />}
                        Mark {nextStatus}
                      </Button>
                    ))}
                  </div>
                )}
                {(selected.status === 'approved' || selected.status === 'activated') && (
                  <CommercialActivationPanel
                    key={selected.id}
                    request={selected}
                    offers={pricingQuery.data ?? []}
                  />
                )}
                {updateRequest.isError && <p role="status" className={errorMessage(updateRequest.error) === 'Access request update made no changes' ? 'text-sm muted' : 'text-sm text-[var(--error)]'}>{errorMessage(updateRequest.error) === 'Access request update made no changes' ? 'No changes to save.' : errorMessage(updateRequest.error)}</p>}
              </div>
            )}
          </div>
        </div>
      </section>
    </fieldset><CommercialReview command={command} busy={updateRequest.isPending} error={updateRequest.error} close={()=>setCommand(null)}/>{uncertainWrite(updateRequest.error)&&<p role="alert">Outcome uncertain. Reload and check persisted intake status before another command. <button className="quiet-button" onClick={()=>window.location.reload()}>Reload authoritative workspace</button></p>}</div>
  );
};

export default CommercialRequestsPage;
