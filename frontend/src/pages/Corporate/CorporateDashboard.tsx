import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Store } from 'lucide-react';
import { client } from '../../api/client';
import { DetailViewLayout } from '../../components/layout/DetailViewLayout';
import { AdvancedTable } from '../../components/ui/AdvancedTable';

interface CommercialOrganizationSummary {
  organizationId: string;
  name: string;
  subscriptionStatus: string;
  enabledModules: string[];
}

interface CorporateCommercialSummary {
  parentOrganization: string;
  billingDetails: CommercialOrganizationSummary[];
}

export const CorporateDashboard: React.FC = () => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['corporateCommercialSummary'],
    queryFn: async () => {
      const response = await client.get<{ data: CorporateCommercialSummary }>(
        '/corporate/billing/defaultParent',
      );
      return response.data.data;
    },
    retry: false,
  });

  const columns = [
    { header: 'Organization', accessor: 'name', sortable: true },
    {
      header: 'Modules',
      accessor: 'enabledModules',
      cell: ({ value }: { value: unknown }) => (
        <div className="flex flex-wrap gap-1">
          {(Array.isArray(value) ? value.map(String) : []).map((module) => (
            <span key={module} className="rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] uppercase text-slate-300">
              {module}
            </span>
          ))}
        </div>
      ),
    },
    {
      header: 'Subscription',
      accessor: 'subscriptionStatus',
      cell: ({ value }: { value: unknown }) => (
        <span className="rounded-full bg-slate-800 px-2 py-1 text-xs font-medium uppercase tracking-wider text-slate-300">
          {String(value)}
        </span>
      ),
    },
  ];

  const header = (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
      <div className="rounded-xl bg-indigo-500/20 p-3 text-indigo-400">
        <Building2 className="h-8 w-8" />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-white">Corporate HQ</h1>
        <p className="text-sm text-slate-400">
          {data?.parentOrganization ?? 'No corporate relationship selected'}
        </p>
      </div>
    </div>
  );

  const sidebarCards = (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
      <div className="rounded-xl bg-blue-500/20 p-3 text-blue-400">
        <Store className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm text-slate-400">Organizations</p>
        <p className="text-xl font-bold text-white">{data?.billingDetails.length ?? 0}</p>
      </div>
    </div>
  );

  const mainContent = isError ? (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">
      No corporate commercial summary is configured. No fallback subscription data is shown.
    </div>
  ) : (
    <AdvancedTable
      columns={columns}
      data={data?.billingDetails ?? []}
      loading={isLoading}
      title="Organization subscriptions"
      description="Server-reported effective commercial state for linked organizations."
      searchPlaceholder="Search organizations..."
    />
  );

  return <DetailViewLayout header={header} sidebarCards={sidebarCards} mainContent={mainContent} />;
};

export default CorporateDashboard;
