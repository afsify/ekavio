import React from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { CreditCard, CheckCircle2, Zap, PackageCheck, Clock, BookOpenCheck, Users, MessageSquare, Plus } from 'lucide-react';
import toast from 'react-hot-toast';

import { DetailViewLayout } from '../../components/layout/DetailViewLayout';
import { AdvancedTable } from '../../components/ui/AdvancedTable';
import { Button } from '../../components/ui/Button';
import { client } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';

interface Invoice {
  id: string;
  date: string;
  amount: number;
  status: string;
  plan: string;
}

const nextBillingDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toLocaleDateString();

export const BillingPage: React.FC = () => {
  const user = useAppStore((state) => state.user);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      const response = await client.get('/billing/invoices');
      return response.data.data as Invoice[];
    },
  });

  const upgradeMutation = useMutation({
    mutationFn: async (planId: string) => {
      const response = await client.post('/billing/create-order', { planId });
      return response.data.data;
    },
    onSuccess: (data) => {
      // Mock triggering a payment gateway like Razorpay/Stripe
      toast.success(`Order created successfully! Redirecting to payment gateway for Order ID: ${data.orderId}`, {
        duration: 4000
      });
    },
    onError: () => {
      toast.error('Failed to initiate upgrade process.');
    }
  });

  const columns = [
    { header: 'Invoice ID', accessor: 'id' },
    { 
      header: 'Date', 
      accessor: 'date',
      cell: ({ value }: { value: unknown }) => new Date(String(value)).toLocaleDateString()
    },
    { header: 'Plan', accessor: 'plan' },
    { 
      header: 'Amount', 
      accessor: 'amount',
      cell: ({ value }: { value: unknown }) => `₹${Number(value).toLocaleString()}`
    },
    {
      header: 'Status',
      accessor: 'status',
      cell: ({ value }: { value: unknown }) => (
        <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-xs font-medium uppercase tracking-wider">
          {String(value)}
        </span>
      )
    }
  ];

  const availableModules = [
    { id: 'inventory', name: 'Inventory Management', description: 'Manage stock and supplies', price: '₹499/mo', icon: PackageCheck },
    { id: 'queue', name: 'Queue Management', description: 'Patient and customer flow', price: '₹299/mo', icon: Clock },
    { id: 'ledger', name: 'Financial Ledger', description: 'Accounting and ledgers', price: '₹599/mo', icon: BookOpenCheck },
    { id: 'attendance', name: 'Staff Attendance', description: 'Time tracking and shifts', price: '₹199/mo', icon: Users },
    { id: 'chat', name: 'Internal Chat', description: 'Team communication', price: '₹149/mo', icon: MessageSquare }
  ];

  const header = (
    <div className="flex items-center gap-3 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
      <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400">
        <CreditCard className="w-8 h-8" />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-white">Subscription & Billing</h1>
        <p className="text-slate-400 text-sm">Manage your plans, payments, and invoices</p>
      </div>
    </div>
  );

  const sidebarCards = (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl space-y-6">
      <div>
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-2">Current Plan</h3>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-white">Basic Tier</span>
          <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full text-[10px] font-bold uppercase tracking-widest flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Active
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-2">Your next billing cycle is on {nextBillingDate}</p>
      </div>

      <div className="pt-4 border-t border-slate-800">
        <h3 className="text-sm font-medium text-slate-400 mb-4">Upgrade Options</h3>
        
        <div className="space-y-3">
          <div className="p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:border-indigo-500 transition-colors">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h4 className="font-bold text-white">Pro Tier</h4>
                <p className="text-xs text-slate-400">Advanced features & unlimited staff</p>
              </div>
              <span className="font-bold text-indigo-400">₹2999/mo</span>
            </div>
            <Button 
              size="sm" 
              className="w-full mt-3 bg-indigo-600 hover:bg-indigo-700"
              onClick={() => upgradeMutation.mutate('pro')}
              isLoading={upgradeMutation.isPending}
            >
              <Zap className="w-4 h-4 mr-2" /> Upgrade to Pro
            </Button>
          </div>

          <div className="p-4 rounded-xl border border-purple-500/30 bg-purple-500/10 hover:border-purple-500 transition-colors">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h4 className="font-bold text-white">Enterprise</h4>
                <p className="text-xs text-slate-400">Multi-branch analytics & custom RBAC</p>
              </div>
              <span className="font-bold text-purple-400">₹9999/mo</span>
            </div>
            <Button 
              size="sm" 
              variant="secondary"
              className="w-full mt-3 text-purple-400 hover:bg-purple-500/20 border-purple-500/30"
              onClick={() => upgradeMutation.mutate('enterprise')}
              isLoading={upgradeMutation.isPending}
            >
              Contact Sales
            </Button>
          </div>
        </div>
      </div>
    </div>
  );

  const mainContent = (
    <div className="space-y-6">
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl">
        <h2 className="text-lg font-bold text-white mb-4">Available Modules</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {availableModules.map((mod) => {
            const isActive = user?.activeModules?.includes(mod.id);
            const Icon = mod.icon;
            
            return (
              <div 
                key={mod.id} 
                className={`p-4 rounded-xl border ${isActive ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-800 bg-slate-800/50 hover:border-slate-700'} transition-colors flex items-center justify-between`}
              >
                <div className="flex items-center gap-4">
                  <div className={`p-2 rounded-lg ${isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white flex items-center gap-2">
                      {mod.name}
                      {isActive && (
                        <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      )}
                    </h4>
                    <p className="text-xs text-slate-400">{mod.description}</p>
                  </div>
                </div>
                {!isActive && (
                  <div className="text-right">
                    <span className="block text-sm font-bold text-white mb-2">{mod.price}</span>
                    <Button 
                      size="sm" 
                      variant="secondary"
                      className="text-xs bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border-indigo-500/30"
                      onClick={() => upgradeMutation.mutate(mod.id)}
                      isLoading={upgradeMutation.isPending}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Add
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <AdvancedTable
        columns={columns}
        data={invoices || []}
        loading={isLoading}
        title="Billing History"
        description="View and download your past invoices."
        searchPlaceholder="Search invoices..."
      />
    </div>
  );

  return (
    <DetailViewLayout header={header} sidebarCards={sidebarCards} mainContent={mainContent} />
  );
};

export default BillingPage;
