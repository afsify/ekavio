import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CalendarClock, LogIn } from 'lucide-react';
import { client } from '../../api/client';
import { getErrorMessage } from '../../api/errors';
import { AdvancedModal } from '../../components/ui/AdvancedModal';
import { AdvancedTable, type Column } from '../../components/ui/AdvancedTable';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAppStore } from '../../store/useAppStore';
import { queueKeys, type Paginated, useBranchServices, useCustomers } from '../../hooks/useQueue';

interface Appointment {
  id: string;
  customerId: string;
  serviceId: string;
  startsAt: string;
  endsAt: string;
  status: 'scheduled' | 'confirmed' | 'checked_in' | 'completed' | 'cancelled' | 'no_show';
  version: number;
  customer: { name: string; phone: string | null };
  service: { name: string };
  provider: { name: string | null } | null;
}

const localToday = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};
const selectClass = 'mt-1.5 block min-h-[44px] w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white';

export const AppointmentsPage: React.FC = () => {
  const [date, setDate] = useState(localToday());
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [localTime, setLocalTime] = useState('09:00');
  const organizationId = useAppStore((state) => state.activeTenantId);
  const branchId = useAppStore((state) => state.activeBranchId);
  const queryClient = useQueryClient();
  const customers = useCustomers();
  const services = useBranchServices();
  const key = ['operational-appointments', organizationId, branchId, date, page] as const;
  const appointments = useQuery({
    queryKey: key,
    queryFn: async () => (await client.get<Paginated<Appointment>>('/appointments', { params: { date, page, limit: 20 } })).data,
    enabled: Boolean(organizationId && branchId),
  });
  const create = useMutation({
    mutationFn: async () => (await client.post('/appointments', {
      customerId,
      serviceId,
      localStart: `${date}T${localTime}:00`,
      idempotencyKey: crypto.randomUUID(),
    })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['operational-appointments'] }),
  });
  const checkIn = useMutation({
    mutationFn: async (appointmentId: string) => (await client.post(`/appointments/${appointmentId}/check-in`, {
      idempotencyKey: `check-in:${appointmentId}`,
    })).data,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['operational-appointments'] }),
        queryClient.invalidateQueries({ queryKey: queueKeys.root }),
      ]);
    },
  });

  const submit = async () => {
    if (!customerId || !serviceId) { toast.error('Select a customer and service'); return; }
    try {
      await create.mutateAsync();
      toast.success('Appointment created');
      setOpen(false);
    } catch (error) { toast.error(getErrorMessage(error, 'Appointment could not be created')); }
  };
  const checkInNow = async (appointment: Appointment) => {
    try {
      await checkIn.mutateAsync(appointment.id);
      toast.success('Appointment checked in to Queue');
    } catch (error) { toast.error(getErrorMessage(error, 'Check-in could not be completed')); }
  };

  const columns: Column<Appointment>[] = [
    { header: 'Time', accessor: 'startsAt', cell: ({ row }) => new Date(row.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) },
    { header: 'Customer', accessor: 'customer', cell: ({ row }) => row.customer.name },
    { header: 'Service', accessor: 'service', cell: ({ row }) => row.service.name },
    { header: 'Provider', accessor: 'provider', cell: ({ row }) => row.provider?.name ?? 'Unassigned' },
    { header: 'Status', accessor: 'status', cell: ({ row }) => <span className="rounded-full bg-indigo-500/15 px-2 py-1 text-xs font-semibold uppercase text-indigo-300">{row.status.replace('_', ' ')}</span> },
    { header: 'Actions', accessor: 'actions', cell: ({ row }) => (
      ['scheduled', 'confirmed'].includes(row.status)
        ? <Button size="sm" onClick={() => void checkInNow(row)}><LogIn className="h-4 w-4" />Check in</Button>
        : null
    ) },
  ];

  return <div className="space-y-6">
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="rounded-xl bg-indigo-500/20 p-3 text-indigo-400"><CalendarClock className="h-7 w-7" /></div><div><h1 className="text-2xl font-bold text-white">Appointments</h1><p className="text-sm text-slate-400">Branch-local scheduling and Queue check-in</p></div></div><Input aria-label="Appointment date" type="date" value={date} onChange={(event) => { setDate(event.target.value); setPage(1); }} className="sm:w-48" /></div>
    <AdvancedTable columns={columns} data={appointments.data?.data ?? []} loading={appointments.isLoading} error={appointments.isError ? getErrorMessage(appointments.error, 'Appointments could not be loaded') : null} title="Daily appointments" description={`Selected business date: ${date}`} onAdd={() => setOpen(true)} emptyState={<div className="text-sm text-slate-400">No appointments for this branch and date.</div>} />
    <div className="flex items-center justify-end gap-3 text-sm text-slate-400"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><span>Page {page} of {Math.max(1, appointments.data?.pagination.totalPages ?? 1)}</span><Button variant="secondary" size="sm" disabled={page >= (appointments.data?.pagination.totalPages ?? 1)} onClick={() => setPage((value) => value + 1)}>Next</Button><Button variant="secondary" size="sm" onClick={() => void appointments.refetch()}>Retry</Button></div>
    <AdvancedModal isOpen={open} onClose={() => setOpen(false)} title="Create appointment" actions={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button isLoading={create.isPending} onClick={() => void submit()}>Create appointment</Button></>}><div className="space-y-4"><label className="block text-xs font-semibold uppercase text-slate-300">Customer<select className={selectClass} value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Select customer</option>{customers.data?.data.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</select></label><label className="block text-xs font-semibold uppercase text-slate-300">Branch-available service<select className={selectClass} value={serviceId} onChange={(event) => setServiceId(event.target.value)}><option value="">Select service</option>{services.data?.data.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label><Input label="Local start time" type="time" value={localTime} onChange={(event) => setLocalTime(event.target.value)} /></div></AdvancedModal>
  </div>;
};

export default AppointmentsPage;
