import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Store } from 'lucide-react';
import { client } from '../../api/client';
import { DetailViewLayout } from '../../components/layout/DetailViewLayout';
import { AdvancedTable } from '../../components/ui/AdvancedTable';

interface CorporateParent {
  id: string;
  name: string;
  consolidatedBilling: boolean;
}

interface CommercialOrganizationSummary {
  organizationId: string;
  name: string;
  type: string;
  subscriptionStatus: string;
  enabledModules: string[];
}

interface CorporateCommercialSummary {
  parent: CorporateParent;
  organizations: CommercialOrganizationSummary[];
}

export const CorporateDashboard: React.FC = () => {
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const parentsQuery = useQuery({
    queryKey: ['corporateParents'],
    queryFn: async () => {
      const response = await client.get<{ data: CorporateParent[] }>('/corporate/parents');
      return response.data.data;
    },
    retry: false,
  });

  const activeParentId = parentsQuery.data?.some(({ id }) => id === selectedParentId)
    ? selectedParentId
    : parentsQuery.data?.[0]?.id ?? null;

  const summaryQuery = useQuery({
    queryKey: ['corporateSummary', activeParentId],
    queryFn: async () => {
      const response = await client.get<{ data: CorporateCommercialSummary }>(
        `/corporate/parents/${activeParentId}/summary`,
      );
      return response.data.data;
    },
    enabled: activeParentId !== null,
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

  const parentName = summaryQuery.data?.parent.name
    ?? parentsQuery.data?.find(({ id }) => id === activeParentId)?.name
    ?? 'No parent organization configured';
  const organizations = summaryQuery.data?.organizations ?? [];
  const header = (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-indigo-500/20 p-3 text-indigo-400">
          <Building2 className="h-8 w-8" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Corporate HQ</h1>
          <p className="text-sm text-slate-400">{parentName}</p>
        </div>
      </div>
      {(parentsQuery.data?.length ?? 0) > 0 && (
        <label className="text-sm text-slate-300">
          Parent organization
          <select
            className="mt-1 block min-w-64 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            value={activeParentId ?? ''}
            onChange={(event) => setSelectedParentId(event.target.value)}
          >
            {parentsQuery.data?.map((parent) => (
              <option key={parent.id} value={parent.id}>{parent.name}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );

  const sidebarCards = (
    <div className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
      <div className="rounded-xl bg-blue-500/20 p-3 text-blue-400">
        <Store className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm text-slate-400">Linked organizations</p>
        <p className="text-xl font-bold text-white">{organizations.length}</p>
      </div>
    </div>
  );

  let mainContent: React.ReactNode;
  if (parentsQuery.isLoading) {
    mainContent = <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">Loading authorized parent organizations...</div>;
  } else if (parentsQuery.isError) {
    mainContent = <div className="rounded-2xl border border-rose-900 bg-slate-900 p-6 text-sm text-rose-300">Corporate parent organizations could not be loaded.</div>;
  } else if ((parentsQuery.data?.length ?? 0) === 0) {
    mainContent = <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">No parent organization is configured for your account.</div>;
  } else if (summaryQuery.isError) {
    mainContent = <div className="rounded-2xl border border-rose-900 bg-slate-900 p-6 text-sm text-rose-300">The selected corporate summary could not be loaded.</div>;
  } else if (!summaryQuery.isLoading && organizations.length === 0) {
    mainContent = <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-400">No organizations are linked to this parent.</div>;
  } else {
    mainContent = (
      <AdvancedTable
        columns={columns}
        data={organizations}
        loading={summaryQuery.isLoading}
        title="Organization subscriptions"
        description="Server-reported PostgreSQL commercial state for linked organizations. This is not a consolidated invoice."
        searchPlaceholder="Search organizations..."
      />
    );
  }

  return <DetailViewLayout header={header} sidebarCards={sidebarCards} mainContent={mainContent} />;
};

export default CorporateDashboard;
