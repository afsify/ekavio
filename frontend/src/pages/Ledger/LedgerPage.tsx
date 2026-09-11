import React, { useState } from 'react';
import { DetailViewLayout } from '../../components/layout/DetailViewLayout';
import { AdvancedTable } from '../../components/ui/AdvancedTable';
import { AdvancedModal } from '../../components/ui/AdvancedModal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Wallet, TrendingUp, TrendingDown, Download } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { exportToCSV } from '../../utils/exportUtils';

interface LedgerEntry {
  id: string;
  date: string;
  customerName: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
}

const mockLedgerData: LedgerEntry[] = [
  { id: '1', date: '2023-10-25', customerName: 'John Doe', type: 'credit', amount: 500, description: 'Advance payment' },
  { id: '2', date: '2023-10-26', customerName: 'Jane Smith', type: 'debit', amount: 200, description: 'Purchase items' },
];

const newEntrySchema = z.object({
  customerName: z.string().min(1, 'Customer name is required'),
  type: z.enum(['credit', 'debit']),
  amount: z.number({ invalid_type_error: 'Amount must be a number' }).min(1, 'Amount must be greater than 0'),
  description: z.string().optional(),
});

type NewEntryFormInputs = z.infer<typeof newEntrySchema>;

export const LedgerPage: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [data, setData] = useState<LedgerEntry[]>(mockLedgerData);

  const { register, handleSubmit, formState: { errors }, reset } = useForm<NewEntryFormInputs>({
    resolver: zodResolver(newEntrySchema),
    defaultValues: { type: 'credit' }
  });

  const columns = [
    { header: 'Date', accessor: 'date', sortable: true },
    { header: 'Customer', accessor: 'customerName', sortable: true },
    { 
      header: 'Type', 
      accessor: 'type', 
      sortable: true,
      cell: ({ value }: { value: string }) => (
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${value === 'credit' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
          {value.toUpperCase()}
        </span>
      )
    },
    { 
      header: 'Amount', 
      accessor: 'amount', 
      sortable: true,
      cell: ({ value }: { value: number }) => `₹${value.toFixed(2)}`
    },
    { header: 'Description', accessor: 'description' },
  ];

  const onSubmit = (formData: NewEntryFormInputs) => {
    const newEntry: LedgerEntry = {
      id: Math.random().toString(),
      date: new Date().toISOString().split('T')[0],
      ...formData,
      description: formData.description || ''
    };
    setData([...data, newEntry]);
    setIsModalOpen(false);
    reset();
  };

  const header = (
    <div className="flex items-center justify-between bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-indigo-500/20 rounded-xl text-indigo-400">
          <BookOpenCheck className="w-8 h-8" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Digital Khata (Ledger)</h1>
          <p className="text-slate-400 text-sm">Manage customer credits and debits</p>
        </div>
      </div>
      <Button 
        variant="secondary" 
        onClick={() => {
          if (data) exportToCSV(data, 'ledger_export');
        }}
        disabled={!data || data.length === 0}
        className="hidden md:flex gap-2"
      >
        <Download className="w-4 h-4" />
        Export CSV
      </Button>
    </div>
  );

  const sidebarCards = (
    <>
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl flex items-center gap-4">
         <div className="p-3 bg-emerald-500/20 rounded-xl text-emerald-400">
            <TrendingUp className="w-6 h-6" />
         </div>
         <div>
           <p className="text-sm text-slate-400">Total Credits</p>
           <p className="text-xl font-bold text-white">₹{data.filter(d => d.type === 'credit').reduce((a, b) => a + b.amount, 0).toFixed(2)}</p>
         </div>
      </div>
      <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl flex items-center gap-4">
         <div className="p-3 bg-rose-500/20 rounded-xl text-rose-400">
            <TrendingDown className="w-6 h-6" />
         </div>
         <div>
           <p className="text-sm text-slate-400">Total Debits</p>
           <p className="text-xl font-bold text-white">₹{data.filter(d => d.type === 'debit').reduce((a, b) => a + b.amount, 0).toFixed(2)}</p>
         </div>
      </div>
    </>
  );

  const mainContent = (
    <>
      <AdvancedTable
        columns={columns}
        data={data}
        title="Ledger Entries"
        description="A list of all credit and debit transactions."
        onAdd={() => setIsModalOpen(true)}
        searchPlaceholder="Search customer..."
      />

      <AdvancedModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Add New Entry"
        actions={
          <>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmit(onSubmit)}>Save Entry</Button>
          </>
        }
      >
        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <Input
            id="customerName"
            label="Customer Name"
            {...register('customerName')}
            error={errors.customerName?.message}
          />
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-300">Transaction Type</label>
            <select
              {...register('type')}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-white focus:ring-2 focus:ring-indigo-500"
            >
              <option value="credit">Credit</option>
              <option value="debit">Debit</option>
            </select>
            {errors.type?.message && <p className="text-xs text-rose-500 mt-1">{errors.type.message}</p>}
          </div>
          <Input
            id="amount"
            label="Amount (₹)"
            type="number"
            {...register('amount', { valueAsNumber: true })}
            error={errors.amount?.message}
          />
          <Input
            id="description"
            label="Description (Optional)"
            {...register('description')}
          />
        </form>
      </AdvancedModal>
    </>
  );

  return (
    <DetailViewLayout
      header={header}
      sidebarCards={sidebarCards}
      mainContent={mainContent}
    />
  );
};

export default LedgerPage;
