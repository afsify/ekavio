import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, IndianRupee, Users, Store } from 'lucide-react';
import { DetailViewLayout } from '../../components/layout/DetailViewLayout';
import { AdvancedTable } from '../../components/ui/AdvancedTable';
import { client } from '../../api/client';

interface ChildOrg {
  id: string;
  name: string;
  location: string;
  totalRevenue: number;
  activeModules: string[];
  staffCount: number;
  status: 'active' | 'suspended';
}

interface CorporateBilling {
  parentOrgName: string;
  totalNetworkRevenue: number;
  totalStaff: number;
  totalShops: number;
  childOrganizations: ChildOrg[];
}

export const CorporateDashboard: React.FC = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['corporateBilling'],
    queryFn: async () => {
      try {
        const response = await client.get('/corporate/billing/defaultParent');
        return response.data.data as CorporateBilling;
      } catch (e) {
        // Fallback mock data if endpoint is unseeded
        return {
          parentOrgName: 'Ekavio Enterprises HQ',
          totalNetworkRevenue: 450000,
          totalStaff: 124,
          totalShops: 8,
          childOrganizations: [
            { id: '1', name: 'Branch A - Downtown', location: 'City Center', totalRevenue: 150000, activeModules: ['inventory', 'queue'], staffCount: 45, status: 'active' },
            { id: '2', name: 'Branch B - Westside', location: 'West Avenue', totalRevenue: 95000, activeModules: ['inventory'], staffCount: 22, status: 'active' },
            { id: '3', name: 'Branch C - North', location: 'North Mall', totalRevenue: 205000, activeModules: ['inventory', 'queue', 'attendance'], staffCount: 57, status: 'active' },
          ]
        } as CorporateBilling;
      }
    },
  });

  const columns = [
    { header: 'Branch Name', accessor: 'name', sortable: true },
    { header: 'Location', accessor: 'location' },
    { 
      header: 'Revenue', 
      accessor: 'totalRevenue', 
      sortable: true,
      cell: ({ value }: { value: number }) => `₹${value.toLocaleString()}`
    },
    { 
      header: 'Staff', 
      accessor: 'staffCount', 
      sortable: true,
    },
    {
      header: 'Modules',
      accessor: 'activeModules',
      cell: ({ value }: { value: string[] }) => (
        <div className="flex gap-1 flex-wrap">
          {value.map(mod => (
            <span key={mod} className="px-2 py-0.5 bg-slate-800 text-slate-300 text-[10px] uppercase rounded-full border border-slate-700">
              {mod}
            </span>
          ))}
        </div>
      )
    },
    {
      header: 'Status',
      accessor: 'status',
      cell: ({ value }: { value: string }) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium uppercase tracking-wider ${
          value === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
        }`}>
          {value}
        </span>
      )
    }
  ];

  const header = (
    <div className="flex items-center gap-3 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
      <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400">
        <Building2 className="w-8 h-8" />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-white">Corporate HQ</h1>
        <p className="text-slate-400 text-sm">Managing {data?.parentOrgName || 'Organization'}</p>
      </div>
    </div>
  );

  const sidebarCards = (
    <>
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl flex items-center gap-4">
        <div className="p-3 bg-emerald-500/20 rounded-xl text-emerald-400">
          <IndianRupee className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm text-slate-400">Network Revenue</p>
          <p className="text-xl font-bold text-white">
            ₹{isLoading ? '...' : data?.totalNetworkRevenue.toLocaleString()}
          </p>
        </div>
      </div>
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl flex items-center gap-4">
        <div className="p-3 bg-blue-500/20 rounded-xl text-blue-400">
          <Store className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm text-slate-400">Total Branches</p>
          <p className="text-xl font-bold text-white">
            {isLoading ? '...' : data?.totalShops}
          </p>
        </div>
      </div>
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl flex items-center gap-4">
        <div className="p-3 bg-amber-500/20 rounded-xl text-amber-400">
          <Users className="w-6 h-6" />
        </div>
        <div>
          <p className="text-sm text-slate-400">Total Network Staff</p>
          <p className="text-xl font-bold text-white">
            {isLoading ? '...' : data?.totalStaff}
          </p>
        </div>
      </div>
    </>
  );

  const mainContent = (
    <AdvancedTable
      columns={columns}
      data={data?.childOrganizations || []}
      loading={isLoading}
      title="Branch Organizations"
      description="List of all child branches and their active Ekavio subscriptions."
      searchPlaceholder="Search branches..."
    />
  );

  return (
    <DetailViewLayout header={header} sidebarCards={sidebarCards} mainContent={mainContent} />
  );
};

export default CorporateDashboard;
