import { EmptyState } from '../../components/ui/EmptyState';
import { hasEntitlement } from '../../commercial/catalogue';
import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BookOpenCheck,
  Download,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  WalletCards,
} from 'lucide-react';
import { client } from '../../api/client';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAppStore } from '../../store/useAppStore';
import { exportToCSV } from '../../utils/exportUtils';

type EntryType = 'charge' | 'payment' | 'adjustment_increase' | 'adjustment_decrease' | 'reversal';
type CreateEntryType = Exclude<EntryType, 'reversal'>;

interface CustomerOption {
  id: string;
  name: string;
  status: string;
}

interface CustomerDueEntry {
  id: string;
  customerId: string;
  customerName: string;
  entryType: EntryType;
  amountMinor: string;
  signedEffectMinor: string;
  currency: 'INR';
  dueDate: string | null;
  description: string | null;
  reversesEntryId: string | null;
  reversedByEntryId: string | null;
  occurredAt: string;
}

interface Paginated<T> {
  data: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface BalanceResponse {
  customerId: string;
  currency: 'INR';
  organizationBalanceMinor: string;
  branchBalanceMinor: string;
}

const entryLabels: Record<EntryType, string> = {
  charge: 'Charge',
  payment: 'Payment',
  adjustment_increase: 'Increase adjustment',
  adjustment_decrease: 'Decrease adjustment',
  reversal: 'Reversal',
};

const formatMinor = (value: string): string => {
  const minor = BigInt(value);
  const sign = minor < 0n ? '-' : '';
  const magnitude = minor < 0n ? -minor : minor;
  return `${sign}₹${(magnitude / 100n).toString()}.${(magnitude % 100n).toString().padStart(2, '0')}`;
};

const errorMessage = (error: unknown): string => {
  if (axios.isAxiosError<{ message?: string; error?: { message?: string } }>(error)) {
    return error.response?.data?.error?.message
      ?? error.response?.data?.message
      ?? 'Customer Dues request failed.';
  }
  return error instanceof Error ? error.message : 'Customer Dues request failed.';
};

export const LedgerPage: React.FC = () => {
  const queryClient = useQueryClient();
  const activeTenantId = useAppStore((state) => state.activeTenantId);
  const activeBranchId = useAppStore((state) => state.activeBranchId);
  const user = useAppStore((state) => state.user);
  const entitlements = useAppStore((state) => state.entitlements);
  const customerCreate = (user?.permissions ?? []).includes('queue.manage') && hasEntitlement(entitlements, 'queue');
  const canManage = (user?.permissions ?? []).includes('ledger.manage');
  const branchName = user?.memberships
    ?.find((membership) => membership.organizationId === activeTenantId)
    ?.branches.find((branch) => branch.id === activeBranchId)?.name ?? 'Selected branch';

  const [page, setPage] = useState(1);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [entryTypeFilter, setEntryTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [createType, setCreateType] = useState<CreateEntryType>('charge');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [createKey, setCreateKey] = useState(() => crypto.randomUUID());
  const [reversal, setReversal] = useState<CustomerDueEntry | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalKey, setReversalKey] = useState(() => crypto.randomUUID());

  const customersQuery = useQuery({
    queryKey: ['customer-dues-customers', activeTenantId, activeBranchId, customerSearch],
    queryFn: async () => {
      const response = await client.get<Paginated<CustomerOption>>('/customer-dues/customers', {
        params: { search: customerSearch || undefined, page: 1, limit: 50 },
      });
      return response.data;
    },
    enabled: Boolean(activeTenantId && activeBranchId),
  });

  const entriesQuery = useQuery({
    queryKey: [
      'customer-dues-entries', activeTenantId, activeBranchId, page,
      customerId, entryTypeFilter, dateFrom, dateTo,
    ],
    queryFn: async () => {
      const response = await client.get<Paginated<CustomerDueEntry>>('/customer-dues/entries', {
        params: {
          page,
          limit: 20,
          customerId: customerId || undefined,
          entryType: entryTypeFilter || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        },
      });
      return response.data;
    },
    enabled: Boolean(activeTenantId && activeBranchId),
  });

  const balanceQuery = useQuery({
    queryKey: ['customer-dues-balance', activeTenantId, activeBranchId, customerId],
    queryFn: async () => {
      const response = await client.get<{ data: BalanceResponse }>(
        `/customer-dues/customers/${customerId}/balance`,
      );
      return response.data.data;
    },
    enabled: Boolean(activeTenantId && activeBranchId && customerId),
  });

  const refreshAuthority = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['customer-dues-entries'] }),
      queryClient.invalidateQueries({ queryKey: ['customer-dues-balance'] }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: async () => client.post('/customer-dues/entries', {
      customerId,
      entryType: createType,
      amount,
      currency: 'INR',
      dueDate: createType === 'charge' && dueDate ? dueDate : null,
      description: description.trim() || null,
      idempotencyKey: createKey,
    }),
    onSuccess: async () => {
      toast.success(`${entryLabels[createType]} recorded`);
      setShowCreate(false);
      setAmount('');
      setDescription('');
      setDueDate('');
      setCreateKey(crypto.randomUUID());
      await refreshAuthority();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const reversalMutation = useMutation({
    mutationFn: async () => client.post(`/customer-dues/entries/${reversal!.id}/reversal`, {
      description: reversalReason.trim(),
      idempotencyKey: reversalKey,
    }),
    onSuccess: async () => {
      toast.success('Reversal recorded; original history was preserved');
      setReversal(null);
      setReversalReason('');
      setReversalKey(crypto.randomUUID());
      await refreshAuthority();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const selectedCustomer = customersQuery.data?.data.find((customer) => customer.id === customerId);
  const createNeedsReason = createType.startsWith('adjustment_');
  const createInvalid = !customerId
    || !/^\d+(?:\.\d{1,2})?$/.test(amount)
    || /^0+(?:\.0{1,2})?$/.test(amount)
    || (createNeedsReason && description.trim().length < 3);

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <header className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-500/20 p-3 text-indigo-300"><BookOpenCheck className="h-7 w-7" /></div>
            <div>
              <h1 className="text-2xl font-bold text-white">Customer Dues</h1>
              <p className="text-sm text-slate-400">{branchName} journal · immutable INR records</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => void entriesQuery.refetch()}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={!entriesQuery.data?.data.length}
              onClick={() => exportToCSV(entriesQuery.data?.data ?? [], 'customer_dues_current_page')}
            >
              <Download className="h-4 w-4" /> Export current page
            </Button>
            {canManage && <Button size="sm" onClick={() => setShowCreate(true)}>Record entry</Button>}
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="grid gap-3 md:grid-cols-5">
          <Input label="Search customers" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} />
          <label className="text-sm text-slate-300">
            Customer
            <select
              value={customerId}
              onChange={(event) => { setCustomerId(event.target.value); setPage(1); }}
              className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            >
              <option value="">All customers</option>
              {(customersQuery.data?.data ?? []).map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-300">
            Entry type
            <select
              value={entryTypeFilter}
              onChange={(event) => { setEntryTypeFilter(event.target.value); setPage(1); }}
              className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            >
              <option value="">All types</option>
              {Object.entries(entryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <Input label="From date" type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPage(1); }} />
          <Input label="To date" type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPage(1); }} />
        </div>
      </section>

      {!customerSearch && customersQuery.data?.data.length === 0 && <EmptyState title="No customers yet" description="Create a customer before recording dues." action={customerCreate ? 'Create Customer' : undefined} to="/customers" />}
      {customerId && (
        <section className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-200">Organization-wide customer balance</p>
            <p className="mt-2 text-3xl font-bold text-white">
              {balanceQuery.data ? formatMinor(balanceQuery.data.organizationBalanceMinor) : '—'}
            </p>
            <p className="mt-1 text-xs text-slate-400">Explicit aggregate across all branches for {selectedCustomer?.name ?? 'the selected customer'}.</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Selected branch balance</p>
            <p className="mt-2 text-3xl font-bold text-white">
              {balanceQuery.data ? formatMinor(balanceQuery.data.branchBalanceMinor) : '—'}
            </p>
            <p className="mt-1 text-xs text-slate-500">The journal below remains restricted to {branchName}.</p>
          </div>
        </section>
      )}

      {entriesQuery.isError && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-6 text-rose-200">
          <div className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-5 w-5" /> Customer Dues could not be loaded</div>
          <p className="mt-2 text-sm">{errorMessage(entriesQuery.error)}</p>
        </div>
      )}
      {entriesQuery.isLoading && <div className="rounded-2xl border border-slate-800 bg-slate-900 p-12 text-center text-slate-400">Loading Customer Dues…</div>}
      {!entriesQuery.isLoading && !entriesQuery.isError && (entriesQuery.data?.data.length ?? 0) === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-12 text-center">
          <WalletCards className="mx-auto h-8 w-8 text-slate-600" />
          <p className="mt-3 font-semibold text-white">No Customer Due entries match this branch view</p>
          <p className="mt-1 text-sm text-slate-500">Choose a customer or record the first charge or payment.</p>
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        {(entriesQuery.data?.data ?? []).map((entry) => {
          const increases = BigInt(entry.signedEffectMinor) > 0n;
          return (
            <article key={entry.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-white">{entry.customerName}</h2>
                  <p className="mt-1 text-xs text-slate-500">{new Date(entry.occurredAt).toLocaleString()}</p>
                </div>
                <span className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${increases ? 'border-amber-500/20 bg-amber-500/10 text-amber-200' : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200'}`}>
                  {increases ? <ArrowUpCircle className="h-3.5 w-3.5" /> : <ArrowDownCircle className="h-3.5 w-3.5" />}
                  {entryLabels[entry.entryType]}
                </span>
              </div>
              <p className="mt-4 text-2xl font-bold text-white">{formatMinor(entry.amountMinor)}</p>
              <p className="mt-1 text-xs text-slate-400">Balance effect: {formatMinor(entry.signedEffectMinor)}</p>
              {entry.dueDate && <p className="mt-2 text-sm text-slate-400">Due {entry.dueDate}</p>}
              {entry.description && <p className="mt-2 text-sm text-slate-300">{entry.description}</p>}
              {entry.reversesEntryId && <p className="mt-2 text-xs text-slate-500">Exact reversal of a prior entry</p>}
              {entry.reversedByEntryId && <p className="mt-2 text-xs text-amber-300">This entry has been reversed</p>}
              {canManage && entry.entryType !== 'reversal' && !entry.reversedByEntryId && (
                <Button className="mt-4" size="sm" variant="secondary" onClick={() => setReversal(entry)}>
                  <RotateCcw className="h-4 w-4" /> Reverse
                </Button>
              )}
            </article>
          );
        })}
      </section>

      {(entriesQuery.data?.totalPages ?? 0) > 1 && (
        <div className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-900 p-4">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
          <span className="text-sm text-slate-400">Page {page} of {entriesQuery.data?.totalPages}</span>
          <Button variant="secondary" size="sm" disabled={page >= (entriesQuery.data?.totalPages ?? 1)} onClick={() => setPage((value) => value + 1)}>Next</Button>
        </div>
      )}

      {showCreate && (
        <section className="sticky bottom-4 z-20 rounded-2xl border border-indigo-500/30 bg-slate-900 p-5 shadow-2xl shadow-slate-950/70">
          <h2 className="font-bold text-white">Record Customer Due entry</h2>
          <p className="mt-1 text-sm text-slate-400">Charges increase money owed; payments reduce it and cannot exceed the organization-wide balance.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-sm text-slate-300">
              Customer
              <select value={customerId} onChange={(event) => setCustomerId(event.target.value)} className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white">
                <option value="">Select customer</option>
                {(customersQuery.data?.data ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              </select>
            </label>
            <label className="text-sm text-slate-300">
              Entry type
              <select value={createType} onChange={(event) => setCreateType(event.target.value as CreateEntryType)} className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white">
                <option value="charge">Charge — increases owed</option>
                <option value="payment">Payment received — decreases owed</option>
                <option value="adjustment_increase">Adjustment increase</option>
                <option value="adjustment_decrease">Adjustment decrease</option>
              </select>
            </label>
            <Input label="Amount (INR decimal)" inputMode="decimal" placeholder="1500.50" value={amount} onChange={(event) => setAmount(event.target.value)} />
            {createType === 'charge' && <Input label="Due date (optional)" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />}
            <Input label={createNeedsReason ? 'Adjustment reason' : 'Description (optional)'} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          {createType === 'payment' && balanceQuery.data && (
            <p className="mt-3 text-sm text-slate-300">Current organization-wide balance: <strong>{formatMinor(balanceQuery.data.organizationBalanceMinor)}</strong></p>
          )}
          <div className="mt-4 flex gap-3">
            <Button disabled={createInvalid} isLoading={createMutation.isPending} onClick={() => createMutation.mutate()}>Record {entryLabels[createType]}</Button>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
          </div>
        </section>
      )}

      {reversal && (
        <section className="sticky bottom-4 z-30 rounded-2xl border border-amber-500/30 bg-slate-900 p-5 shadow-2xl">
          <h2 className="font-bold text-white">Reverse immutable entry</h2>
          <p className="mt-1 text-sm text-slate-400">The original {entryLabels[reversal.entryType].toLowerCase()} remains visible. A new exact inverse entry will be appended.</p>
          <div className="mt-4 max-w-xl"><Input label="Reversal reason" maxLength={1000} value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} /></div>
          <div className="mt-4 flex gap-3">
            <Button disabled={reversalReason.trim().length < 3} isLoading={reversalMutation.isPending} onClick={() => reversalMutation.mutate()}>Confirm reversal</Button>
            <Button variant="secondary" onClick={() => setReversal(null)}>Cancel</Button>
          </div>
        </section>
      )}
    </div>
  );
};

export default LedgerPage;
