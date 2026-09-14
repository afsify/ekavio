import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpenCheck,
  CheckCircle2,
  Clock,
  CreditCard,
  PackageCheck,
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
import { DetailViewLayout } from '../../components/layout/DetailViewLayout';
import { useAppStore } from '../../store/useAppStore';

const moduleIcons: Record<ModuleKey, React.ElementType> = {
  [MODULES.LEDGER]: BookOpenCheck,
  [MODULES.INVENTORY]: PackageCheck,
  [MODULES.ATTENDANCE]: Users,
  [MODULES.QUEUE]: Clock,
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

export const BillingPage: React.FC = () => {
  const activeTenantId = useAppStore((state) => state.activeTenantId);
  const refreshEntitlements = useAppStore((state) => state.refreshEntitlements);

  const subscriptionQuery = useQuery({
    queryKey: ['commercial-subscription', activeTenantId],
    queryFn: refreshEntitlements,
  });
  const catalogueQuery = useQuery({
    queryKey: ['commercial-catalogue'],
    queryFn: async () => {
      const response = await client.get<{ data: CommercialCatalogue }>('/billing/catalogue');
      return response.data.data;
    },
  });

  const state = subscriptionQuery.data;
  const subscription = state?.subscription;

  const header = (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
      <div className="rounded-xl bg-indigo-500/20 p-3 text-indigo-400">
        <CreditCard className="h-8 w-8" />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-white">Subscription & Modules</h1>
        <p className="text-sm text-slate-400">Authoritative commercial access for this organization</p>
      </div>
    </div>
  );

  const sidebarCards = (
    <div className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
      <div>
        <h3 className="mb-2 text-sm font-medium uppercase tracking-wider text-slate-400">
          Current subscription
        </h3>
        {subscription ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-2xl font-bold text-white">
                {subscription.plan?.name ?? 'Manual module access'}
              </span>
              <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-indigo-300">
                {formatStatus(subscription.status)}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500">Source: {subscription.source}</p>
            {subscription.currentPeriodEndsAt && (
              <p className="mt-1 text-xs text-slate-500">
                Current period ends {new Date(subscription.currentPeriodEndsAt).toLocaleDateString()}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-300">No commercial subscription has been assigned.</p>
        )}
      </div>

      <div className="border-t border-slate-800 pt-4">
        <h3 className="mb-3 text-sm font-medium text-slate-400">Effective limits</h3>
        <dl className="space-y-2">
          {state && Object.entries(state.limits).map(([key, value]) => (
            <div key={key} className="flex justify-between gap-3 text-sm">
              <dt className="text-slate-400">{limitLabels[key as keyof typeof limitLabels]}</dt>
              <dd className="font-semibold text-white">{value ?? 'Not set'}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="border-t border-slate-800 pt-4">
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <p className="text-xs leading-relaxed text-amber-100/80">
            Pilot subscriptions are managed manually by an EkaVio platform operator. Organization administrators can view access but cannot grant paid modules.
          </p>
        </div>
      </div>
    </div>
  );

  const mainContent = (
    <div className="space-y-6">
      {subscriptionQuery.isError ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6 text-rose-200">
          Commercial state could not be loaded. Access remains fail-closed.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
          <h2 className="mb-4 text-lg font-bold text-white">Effective modules</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {(state?.modules ?? []).map((module) => {
              const Icon = moduleIcons[module.key];
              return (
                <div
                  key={module.key}
                  className={`flex items-center justify-between rounded-xl border p-4 ${
                    module.enabled
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-slate-800 bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`rounded-lg p-2 ${module.enabled ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="flex items-center gap-2 font-bold text-white">
                        {module.displayName}
                        {module.enabled && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                      </h4>
                      <p className="text-xs text-slate-400">{module.description}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-bold uppercase ${module.enabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                    {module.enabled ? 'Enabled' : 'Unavailable'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <h2 className="text-lg font-bold text-white">Available pilot catalogue</h2>
        <p className="mt-1 text-sm text-slate-400">
          Catalogue entries have no automated purchase flow. Contact an EkaVio platform operator for manual assignment.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          {(catalogueQuery.data?.addOns ?? []).map((addOn) => (
            <div key={addOn.key} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
              <h3 className="font-semibold text-white">{addOn.name}</h3>
              <p className="mt-1 text-xs text-slate-400">{addOn.description}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
        <h2 className="text-lg font-bold text-white">Billing history</h2>
        <p className="mt-2 text-sm text-slate-400">
          No billing documents are available. EkaVio does not generate fabricated invoices, and automated payment ordering is not configured.
        </p>
      </div>
    </div>
  );

  return <DetailViewLayout header={header} sidebarCards={sidebarCards} mainContent={mainContent} />;
};

export default BillingPage;
