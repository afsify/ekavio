import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { CheckCircle2, Clock, Play, Users } from 'lucide-react';
import { DetailViewLayout } from '../../components/layout/DetailViewLayout';
import { AdvancedTable, type Column } from '../../components/ui/AdvancedTable';
import { AdvancedModal } from '../../components/ui/AdvancedModal';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { getErrorMessage } from '../../api/errors';
import { useSocketStore } from '../../store/useSocketStore';
import {
  queueKeys,
  type QueueToken,
  useBranchServices,
  useCreateCustomer,
  useCreateToken,
  useCustomers,
  useQueue,
  useUpdateTokenStatus,
} from '../../hooks/useQueue';
import { useQueryClient } from '@tanstack/react-query';

const selectClass = 'block min-h-[44px] w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white';

export const QueuePage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '' });
  const queryClient = useQueryClient();
  const socket = useSocketStore((state) => state.socket);
  const queue = useQueue(page);
  const customers = useCustomers(customerSearch);
  const services = useBranchServices();
  const createToken = useCreateToken();
  const createCustomer = useCreateCustomer();
  const updateStatus = useUpdateTokenStatus();

  useEffect(() => {
    if (!socket) return;
    const refetch = () => void queryClient.invalidateQueries({ queryKey: queueKeys.root });
    socket.on('queue.token.created', refetch);
    socket.on('queue.token.status_changed', refetch);
    socket.on('connect', refetch);
    return () => {
      socket.off('queue.token.created', refetch);
      socket.off('queue.token.status_changed', refetch);
      socket.off('connect', refetch);
    };
  }, [socket, queryClient]);

  const submitToken = async () => {
    if (!customerId || !serviceId) { toast.error('Select a customer and branch-available service'); return; }
    try {
      await createToken.mutateAsync({ customerId, serviceId });
      toast.success('Token created');
      setOpen(false);
      setCustomerId('');
      setServiceId('');
    } catch (error) { toast.error(getErrorMessage(error, 'Failed to create token')); }
  };

  const submitCustomer = async () => {
    if (!newCustomer.name.trim()) { toast.error('Customer name is required'); return; }
    try {
      const customer = await createCustomer.mutateAsync({
        name: newCustomer.name,
        ...(newCustomer.phone.trim() ? { phone: newCustomer.phone } : {}),
      });
      setCustomerId(customer.id);
      setNewCustomer({ name: '', phone: '' });
      setCustomerOpen(false);
      toast.success('Customer created');
    } catch (error) { toast.error(getErrorMessage(error, 'Failed to create customer')); }
  };

  const transition = async (token: QueueToken, status: QueueToken['status']) => {
    try {
      await updateStatus.mutateAsync({ tokenId: token.id, status, expectedVersion: token.version });
      toast.success('Status updated');
    } catch (error) { toast.error(getErrorMessage(error, 'Queue changed; refresh and retry')); }
  };

  const columns: Column<QueueToken>[] = [
    { header: 'Token', accessor: 'tokenNumber', sortable: true, cell: ({ row }) => `#${row.tokenNumber}` },
    { header: 'Customer', accessor: 'customer', cell: ({ row }) => row.customer.name },
    { header: 'Phone', accessor: 'customerPhone', cell: ({ row }) => row.customer.phone ?? '--' },
    { header: 'Service', accessor: 'service', cell: ({ row }) => row.service.name },
    { header: 'Status', accessor: 'status', sortable: true, cell: ({ row }) => (
      <span className={`rounded-full px-2 py-1 text-xs font-medium uppercase ${row.status === 'waiting' ? 'bg-amber-500/20 text-amber-400' : 'bg-blue-500/20 text-blue-400'}`}>{row.status}</span>
    ) },
    { header: 'Actions', accessor: 'actions', cell: ({ row }) => (
      <div className="flex gap-2">
        {row.status === 'waiting' && <Button size="sm" title="Serve customer" onClick={() => void transition(row, 'serving')}><Play className="h-4 w-4" /></Button>}
        {row.status === 'serving' && <Button size="sm" title="Complete service" onClick={() => void transition(row, 'completed')}><CheckCircle2 className="h-4 w-4" /></Button>}
      </div>
    ) },
  ];

  const header = <div className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl"><div className="rounded-xl bg-indigo-500/20 p-3 text-indigo-400"><Clock className="h-8 w-8" /></div><div><h1 className="text-2xl font-bold text-white">Queue Management</h1><p className="text-sm text-slate-400">Branch-local PostgreSQL queue</p></div></div>;
  const sidebarCards = <><div className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6"><Users className="h-6 w-6 text-blue-400" /><div><p className="text-sm text-slate-400">Active Queue</p><p className="text-xl font-bold text-white">{queue.data?.summary.active ?? 0}</p></div></div><div className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6"><Clock className="h-6 w-6 text-amber-400" /><div><p className="text-sm text-slate-400">Waiting</p><p className="text-xl font-bold text-white">{queue.data?.summary.waiting ?? 0}</p></div></div></>;

  const mainContent = <>
    <AdvancedTable columns={columns} data={queue.data?.data ?? []} loading={queue.isLoading} error={queue.isError ? getErrorMessage(queue.error, 'Queue could not be loaded') : null} title="Active Tokens" description="Authoritative state for the selected branch." onAdd={() => setOpen(true)} emptyState={<div className="text-sm text-slate-400">No active tokens. Create the first walk-in token.</div>} />
    <div className="mt-4 flex items-center justify-end gap-3 text-sm text-slate-400"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><span>Page {page} of {Math.max(1, queue.data?.pagination.totalPages ?? 1)}</span><Button variant="secondary" size="sm" disabled={page >= (queue.data?.pagination.totalPages ?? 1)} onClick={() => setPage((value) => value + 1)}>Next</Button><Button variant="secondary" size="sm" onClick={() => void queue.refetch()}>Retry</Button></div>
    <AdvancedModal isOpen={open} onClose={() => setOpen(false)} title="Create queue token" actions={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button isLoading={createToken.isPending} onClick={() => void submitToken()}>Generate token</Button></>}>
      <div className="space-y-4"><Input label="Search customers" value={customerSearch} onChange={(event) => setCustomerSearch(event.target.value)} /><label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">Customer<select className={`${selectClass} mt-1.5`} value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Select customer</option>{customers.data?.data.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</option>)}</select></label><Button variant="secondary" onClick={() => setCustomerOpen(true)}>Create minimal customer</Button><label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">Branch-available service<select className={`${selectClass} mt-1.5`} value={serviceId} onChange={(event) => setServiceId(event.target.value)}><option value="">Select service</option>{services.data?.data.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label></div>
    </AdvancedModal>
    <AdvancedModal isOpen={customerOpen} onClose={() => setCustomerOpen(false)} title="Create customer" actions={<><Button variant="secondary" onClick={() => setCustomerOpen(false)}>Cancel</Button><Button isLoading={createCustomer.isPending} onClick={() => void submitCustomer()}>Create and select</Button></>}><div className="space-y-4"><Input label="Name" value={newCustomer.name} onChange={(event) => setNewCustomer((value) => ({ ...value, name: event.target.value }))} /><Input label="Phone (optional)" type="tel" value={newCustomer.phone} onChange={(event) => setNewCustomer((value) => ({ ...value, phone: event.target.value }))} /></div></AdvancedModal>
  </>;
  return <DetailViewLayout header={header} sidebarCards={sidebarCards} mainContent={mainContent} />;
};

export default QueuePage;
