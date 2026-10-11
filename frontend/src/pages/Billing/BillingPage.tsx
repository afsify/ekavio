import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpenCheck,
  CheckCircle2,
  Clock,
  CreditCard,
  PackageCheck,
  RefreshCw,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { client } from '../../api/client';
import {
  MODULES,
  type CommercialCatalogue,
  type EffectiveEntitlements,
  type ModuleKey,
} from '../../commercial/catalogue';
import { useOperationalScope } from '../../hooks/useOperationalContext';
import { useAppStore } from '../../store/useAppStore';
import type { CustomerCommercialSummary } from '../../commercial/manualCommercial';
import type { CustomerRenewalHistory } from '../../commercial/renewals';
import { formatInrMinor } from '../../commercial/publicCommercial';
import { TechnicalDetails } from '../../components/ui/TechnicalDetails';

const moduleIcons: Record<ModuleKey, React.ElementType> = {
  [MODULES.HR_PLUS]: Users,
  [MODULES.LEDGER]: BookOpenCheck,
  [MODULES.INVENTORY]: PackageCheck,
  [MODULES.ATTENDANCE]: Users,
  [MODULES.QUEUE]: Clock,
  [MODULES.CRM]: Users,
  [MODULES.PURCHASING]: PackageCheck,
};

const limitLabels: Record<keyof EffectiveEntitlements['limits'], string> = {
  staff: 'Staff',
  branches: 'Branches',
  storageMb: 'Storage (MB)',
  documents: 'Documents',
  automationRuns: 'Automation runs',
};

const formatStatus = (status: string): string =>
  status.replace('-', ' ').replace(/^./, (character) => character.toUpperCase());

export const BillingPage: React.FC = () => {const scope=useOperationalScope();return <BillingWorkspace key={JSON.stringify(scope)}/>;};
const BillingWorkspace: React.FC = () => {
  const scope=useOperationalScope();
  const activeTenantId = useAppStore((state) => state.activeTenantId);
  const refreshEntitlements = useAppStore((state) => state.refreshEntitlements);

  const subscriptionQuery = useQuery({
    queryKey: ['commercial-subscription', activeTenantId, ...scope],
    queryFn: ({signal})=>refreshEntitlements(signal),
  });
  const catalogueQuery = useQuery({
    queryKey: ['commercial-catalogue', ...scope],
    queryFn: async ({signal}) => {
      const response = await client.get<{ data: CommercialCatalogue }>('/billing/catalogue', {signal});
      return response.data.data;
    },
  });
  const commercialQuery = useQuery({
    queryKey: ['customer-commercial-summary', activeTenantId, ...scope],
    queryFn: async ({signal}) => {
      const response = await client.get<{ data: CustomerCommercialSummary | null }>(
        '/billing/commercial', {signal},
      );
      return response.data.data;
    },
  });
  const renewalsQuery = useQuery({
    queryKey: ['customer-commercial-renewals', activeTenantId, ...scope],
    queryFn: async ({signal}) => {
      const response = await client.get<{ data: CustomerRenewalHistory[] }>('/billing/renewals', {signal});
      return response.data.data;
    },
  });

  const state = subscriptionQuery.data;
  const subscription = state?.subscription;
  const sourceLabel=(source:string)=>source.startsWith('plan:')?`Included plan: ${subscription?.plan?.name??'Assigned plan'}`:source.startsWith('add-on:')?`Independent add-on: ${subscription?.addOns.find(a=>a.key===source.slice(7))?.name??'Assigned add-on'}`:source==='override:revoke'?'Explicitly revoked':source.startsWith('override:')?`Independent ${source.slice(9).replaceAll('_',' ')} assignment`:source.replaceAll('_',' ');
  const periodEnd = subscription?.currentPeriodEndsAt
    ? new Date(subscription.currentPeriodEndsAt)
    : null;
  const entitlementCheckedAt = subscriptionQuery.dataUpdatedAt;
  const expired = subscription?.status === 'expired';
  const approachingExpiry = Boolean(
    periodEnd
    && !expired
    && periodEnd.getTime() > entitlementCheckedAt
    && periodEnd.getTime() <= entitlementCheckedAt + 30 * 24 * 60 * 60 * 1000,
  );

  const header = (
    <div className="flex items-center gap-3 panel">
      <div className="rounded-xl bg-indigo-500/20 p-3 text-indigo-400">
        <CreditCard className="h-8 w-8" />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-foreground">Subscription & Modules</h1>
        <p className="text-sm muted">Authoritative commercial access for this organization</p>
      </div>
    </div>
  );

  const sidebarCards = (
    <div className="panel page-stack">
      <div>
        <h3 className="mb-2 text-sm font-medium uppercase tracking-wider muted">
          Current subscription
        </h3>
        {subscriptionQuery.isPending?<p role="status">Loading subscription…</p>:subscriptionQuery.isError?<p role="alert">Subscription unavailable. <button className="quiet-button" onClick={()=>void subscriptionQuery.refetch()}>Retry subscription</button></p>:subscription ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-2xl font-bold text-foreground">
                {subscription.plan?.name ?? 'Manual module access'}
              </span>
              <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-indigo-300">
                {formatStatus(subscription.status)}
              </span>
            </div>
            <p className="mt-2 text-xs muted">Source: {subscription.source}</p>
            {subscription.currentPeriodEndsAt && (
              <p className="mt-1 text-xs muted">
                Current period ends {new Date(subscription.currentPeriodEndsAt).toLocaleDateString()}
              </p>
            )}
            <div className="mt-3 page-stack"><h4>Included plan and independent add-ons</h4><p>{subscription.plan?.name??'No base plan'}</p>{subscription.addOns.map(addOn=><p key={addOn.key}>{addOn.name}{addOn.startsAt?` · Starts ${new Date(addOn.startsAt).toLocaleDateString()}`:''}{addOn.endsAt?` · Ends ${new Date(addOn.endsAt).toLocaleDateString()}`:''}</p>)}{subscription.addOns.length===0&&<p className="muted">No independent subscription add-ons.</p>}</div>
            {expired && <p className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-[var(--error)]">Your commercial access period has expired. You can still review Billing and contact EkaVio to renew.</p>}
            {approachingExpiry && periodEnd && <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-[var(--warning)]">Your subscription period ends on {periodEnd.toLocaleDateString()}. Contact EkaVio to renew.</p>}
          </>
        ) : (
          <p className="text-sm text-foreground">No commercial subscription has been assigned.</p>
        )}
      </div>

      <div className="border-t border-[var(--border)] pt-4">
        <h3 className="mb-3 text-sm font-medium muted">Effective limits</h3>
        <dl className="space-y-2">
          {state && Object.entries(state.limits).map(([key, value]) => (
            <div key={key} className="flex justify-between gap-3 text-sm">
              <dt className="muted">{limitLabels[key as keyof typeof limitLabels]}</dt>
              <dd className="font-semibold text-foreground">{value ?? 'Not set'}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="border-t border-[var(--border)] pt-4">
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <p className="text-xs leading-relaxed text-[var(--warning)]/80">
            Pilot subscriptions are managed manually by an EkaVio platform operator. Organization administrators can view access but cannot grant paid modules.
          </p>
        </div>
      </div>
    </div>
  );

  const mainContent = (
    <div className="space-y-6">
      {subscriptionQuery.isError ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-[var(--error)]">
          Commercial state could not be loaded. Access remains fail-closed.
        </div>
      ) : (
        <div className="panel">
          <h2 className="mb-4 text-lg font-bold text-foreground">Effective modules</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {(state?.modules ?? []).map((module) => {
              const Icon = moduleIcons[module.key];
              return (
                <div
                  key={module.key}
                  className={`flex items-center justify-between rounded-xl border p-4 ${
                    module.enabled
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-[var(--border)] bg-[var(--surface-muted)]'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`rounded-lg p-2 ${module.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 muted'}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="flex items-center gap-2 font-bold text-foreground">
                        {module.displayName}
                        {module.enabled && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                      </h4>
                      <p className="text-xs muted">{module.description}</p><p className="text-xs muted">Access source: {module.sources.map(sourceLabel).join(', ') || 'Not assigned'}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-bold uppercase ${module.enabled ? 'text-emerald-400' : 'muted'}`}>
                    {module.enabled ? 'Enabled' : 'Unavailable'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="panel">
        <h2 className="text-lg font-bold text-foreground">Available pilot catalogue</h2>
        <p className="mt-1 text-sm muted">
          Catalogue entries have no automated purchase flow. Contact an EkaVio platform operator for manual assignment.
        </p>
        {catalogueQuery.isPending&&<p role="status">Loading catalogue…</p>}{catalogueQuery.isError&&<p role="alert">Catalogue unavailable. <button className="quiet-button" onClick={()=>void catalogueQuery.refetch()}>Retry catalogue</button></p>}<div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {(catalogueQuery.data?.addOns ?? []).map((addOn) => (
            <div key={addOn.key} className="panel">
              <h3 className="font-semibold text-foreground">{addOn.name}</h3>
              <p className="mt-1 text-xs muted">{addOn.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2 className="text-lg font-bold text-foreground">Commercial agreement</h2>
        {commercialQuery.isPending&&<p role="status">Loading commercial agreement…</p>}{commercialQuery.isError && <p className="mt-2 text-sm text-[var(--error)]">Commercial agreement details could not be loaded. <button className="quiet-button" onClick={()=>void commercialQuery.refetch()}>Retry agreement</button></p>}
        {!commercialQuery.isLoading && !commercialQuery.isError && !commercialQuery.data && (
          <p className="mt-2 text-sm muted">No activated commercial agreement is linked to this organization.</p>
        )}
        {commercialQuery.data && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="panel"><p className="text-xs muted">Final agreed amount</p><p className="mt-1 text-xl font-bold text-foreground">{formatInrMinor(commercialQuery.data.agreement.agreedTotalMinor)}</p><p className="mt-1 text-xs capitalize muted">{commercialQuery.data.agreement.billingCycle} · {commercialQuery.data.agreement.status}</p></div>
            <div className="panel"><p className="text-xs muted">Subscription period</p><p className="mt-1 font-semibold text-foreground">{new Date(commercialQuery.data.agreement.startsAt).toLocaleDateString()} – {new Date(commercialQuery.data.agreement.currentPeriodEndsAt).toLocaleDateString()}</p><p className="mt-1 text-xs muted">Plan: {commercialQuery.data.agreement.planName ?? 'Individual modules'}</p><p className="text-xs muted">Add-ons: {commercialQuery.data.agreement.addOnNames?.join(', ') || 'None'}</p><TechnicalDetails values={{ Plan: commercialQuery.data.agreement.selectedPlanKey, "Add-ons": commercialQuery.data.agreement.selectedAddOnKeys.join(", ") || undefined }} /></div>
            <div className="panel sm:col-span-2"><p className="text-xs muted">Billing profile</p><p className="mt-1 font-semibold text-foreground">{commercialQuery.data.billingProfile.legalName}</p><p className="text-sm muted">{commercialQuery.data.billingProfile.contactName} · {commercialQuery.data.billingProfile.phone}</p>{commercialQuery.data.billingProfile.email && <p className="text-sm muted">{commercialQuery.data.billingProfile.email}</p>}<p className="mt-1 text-sm muted">{[commercialQuery.data.billingProfile.addressLine1, commercialQuery.data.billingProfile.addressLine2, commercialQuery.data.billingProfile.city, commercialQuery.data.billingProfile.state, commercialQuery.data.billingProfile.postalCode].filter(Boolean).join(', ') || 'No billing address recorded'}</p>{commercialQuery.data.billingProfile.gstin && <p className="mt-1 text-xs muted">GSTIN: {commercialQuery.data.billingProfile.gstin}</p>}</div>
          </div>
        )}
      </div>

      <div className="panel">
        <h2 className="text-lg font-bold text-foreground">Manual payment history</h2>
        <p className="mt-1 text-xs muted">These records are operator assertions of manually received payments, not statutory tax invoices.</p>
        {commercialQuery.data?.payments.length ? (
          <div className="mt-4 space-y-3">
            {commercialQuery.data.payments.map((payment, index) => (
              <div key={`${payment.paidAt}:${index}`} className="flex flex-wrap items-center justify-between gap-3 panel text-sm">
                <div><p className="font-semibold text-foreground">{formatInrMinor(payment.amountMinor)}</p><p className="text-xs capitalize muted">{payment.method.replace('_', ' ')} · {new Date(payment.paidAt).toLocaleString()}</p>{payment.reference && <p className="text-xs muted">Reference: {payment.reference}</p>}</div>
                <span className={payment.status === 'confirmed' ? 'text-[var(--success)]' : 'text-[var(--error)]'}>{formatStatus(payment.status)}</span>
              </div>
            ))}
          </div>
        ) : !commercialQuery.isPending&&!commercialQuery.isError&&<p className="mt-3 text-sm muted">No manual payment records are available.</p>}
      </div>

      <div className="panel">
        <div className="flex items-center gap-2"><RefreshCw className="h-5 w-5 text-indigo-400" /><h2 className="text-lg font-bold text-foreground">Renewal history</h2></div>
        <p className="mt-1 text-xs muted">Renewals are negotiated and settled manually. EkaVio does not charge automatically or provide a Pay Now flow.</p>
        {renewalsQuery.isPending&&<p role="status">Loading renewal history…</p>}{renewalsQuery.isError && <p className="mt-2 text-sm text-[var(--error)]">Renewal history could not be loaded. <button className="quiet-button" onClick={()=>void renewalsQuery.refetch()}>Retry renewals</button></p>}
        {(renewalsQuery.data ?? []).length > 0 ? (
          <div className="mt-4 space-y-4">
            {(renewalsQuery.data ?? []).map(({ renewal, payments }) => (
              <article key={renewal.id} className="panel">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-semibold text-foreground">{renewal.renewalKind === 'reactivation' ? 'Reactivation' : 'Continuous renewal'}</p><p className="mt-1 text-xs muted">{new Date(renewal.renewalStartsAt).toLocaleDateString()} – {new Date(renewal.renewalEndsAt).toLocaleDateString()}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase ${renewal.status === 'applied' ? 'bg-emerald-500/15 text-[var(--success)]' : renewal.status === 'cancelled' ? 'bg-rose-500/15 text-[var(--error)]' : 'bg-amber-500/15 text-amber-300'}`}>{renewal.status.replace('_', ' ')}</span></div>
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><p className="text-xs muted">Agreed amount</p><p className="font-semibold text-foreground">{formatInrMinor(renewal.agreedTotalMinor)}</p></div><div><p className="text-xs muted">Previous period ended</p><p className="text-foreground">{new Date(renewal.priorPeriodEndsAt).toLocaleDateString()}</p></div><div><p className="text-xs muted">Plan</p><p className="text-foreground">{renewal.planName ?? 'Individual modules'}</p></div><div><p className="text-xs muted">Add-ons</p><div className="text-foreground">{renewal.addOnNames?.join(', ') || 'None'}<TechnicalDetails values={{ Plan: renewal.selectedPlanKey, "Add-ons": renewal.selectedAddOnKeys.join(", ") || undefined }} /></div></div></div>
                {payments.length > 0 && <div className="mt-4 border-t border-[var(--border)] pt-3"><p className="text-xs font-semibold uppercase muted">Manual renewal payments</p>{payments.map((payment, index) => <div key={`${payment.paidAt}:${index}`} className="mt-2 flex flex-wrap justify-between gap-2 text-sm"><span className="text-foreground">{formatInrMinor(payment.amountMinor)} · {payment.method.replace('_', ' ')}</span><span className={payment.status === 'confirmed' ? 'text-[var(--success)]' : 'text-[var(--error)]'}>{formatStatus(payment.status)}</span></div>)}</div>}
              </article>
            ))}
          </div>
        ) : !renewalsQuery.isLoading && !renewalsQuery.isError && <p className="mt-3 text-sm muted">No renewal record exists for this organization.</p>}
      </div>
    </div>
  );

  return <div className="page-stack billing-workspace min-w-0">{header}<div className="billing-layout"><aside aria-label="Subscription facts">{sidebarCards}</aside><div className="min-w-0">{mainContent}</div></div></div>;
};

export default BillingPage;
