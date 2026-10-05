import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { client } from '../../api/client';
import { getErrorMessage } from '../../api/errors';
import { useAppStore } from '../../store/useAppStore';
import { type Paginated } from '../../hooks/useQueue';
import { AdvancedModal } from '../../components/ui/AdvancedModal';
import { Input } from '../../components/ui/Input';
import { PhoneInput } from '../../components/ui/PhoneInput';
import { EmptyState } from '../../components/ui/EmptyState';
import { normalizePhone } from '../../utils/phone';

interface Customer { id: string; name: string; phone: string | null; notes: string | null; status: 'active' | 'inactive' }
const blank = { name: '', phone: '', notes: '', status: 'active' as Customer['status'] };
export default function CustomersPage() {
  const { activeTenantId, activeBranchId, user } = useAppStore();
  const canManage = user?.permissions?.includes('queue.manage');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Customer | null | undefined>(undefined);
  const [detail, setDetail] = useState<string | null>(null);
  const [form, setForm] = useState(blank);
  const cache = useQueryClient();
  const customers = useQuery({ queryKey: ['operational-customers', activeTenantId, search, page], queryFn: async () => (await client.get<Paginated<Customer>>('/customers', { params: { search: search || undefined, page, limit: 20 } })).data });
  const selected = useQuery({ queryKey: ['customer-detail', activeTenantId, detail], enabled: Boolean(detail), queryFn: async () => (await client.get<{ data: Customer }>(`/customers/${detail}`)).data.data });
  const save = useMutation({
    mutationFn: async () => {
      const body = { name: form.name.trim(), phone: form.phone.trim() || null, notes: form.notes.trim() || null, ...(editing ? { status: form.status } : {}) };
      if (editing) return client.patch(`/customers/${editing.id}`, body);
      return client.post('/customers', body);
    },
    onSuccess: async () => { await cache.invalidateQueries({ queryKey: ['operational-customers'] }); await cache.invalidateQueries({ queryKey: ['customer-detail'] }); await cache.invalidateQueries({ queryKey: ['customer-dues-customers'] }); setEditing(undefined); toast.success('Customer saved'); },
  });
  const open = (customer: Customer | null) => { save.reset(); setEditing(customer); setForm(customer ? { name: customer.name, phone: customer.phone ?? '', notes: customer.notes ?? '', status: customer.status } : blank); };
  // Preserve legacy valid display numbers on an unrelated edit; normalize newly entered phones.
  const phoneError = form.phone && form.phone !== editing?.phone && !normalizePhone(form.phone) ? 'Enter a valid phone number or leave it blank.' : undefined;
  return <div className="page-stack"><header className="page-heading"><div><h1>Customers</h1><p>Manage the customer records used across your workspace.</p></div>{canManage && <button className="action-link" onClick={() => open(null)}>Create customer</button>}</header>
    <Input label="Search customers" type="search" maxLength={200} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
    {customers.isLoading ? <p role="status">Loading customers…</p> : customers.isError ? <section className="panel" role="alert"><p>{getErrorMessage(customers.error, 'Customers could not be loaded.')}</p><button className="quiet-button mt-3" onClick={() => void customers.refetch()}>Retry customers</button></section> : customers.data?.data.length === 0 ? <EmptyState title={search ? 'No matching customers' : 'No customers yet'} description={search ? 'Try another name or phone number.' : 'Create a customer before booking visits or recording dues.'} action={search ? 'Clear search' : canManage ? 'Create your first customer' : undefined} onAction={search ? () => setSearch('') : () => open(null)} /> : <div className="catalogue-grid">{customers.data?.data.map((customer) => <article className="panel record-card" key={customer.id}><h2>{customer.name}</h2><p className="muted">{customer.phone ?? 'No phone supplied'}</p><p className="muted capitalize">{customer.status}</p><div className="record-actions"><button className="quiet-button" onClick={() => setDetail(customer.id)}>View {customer.name}</button>{canManage && <button className="quiet-button" onClick={() => open(customer)}>Edit {customer.name}</button>}</div></article>)}</div>}
    {customers.data && <div className="pagination"><button className="quiet-button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {Math.max(1, customers.data.pagination.totalPages)}</span><button className="quiet-button" disabled={page >= customers.data.pagination.totalPages} onClick={() => setPage(page + 1)}>Next</button></div>}
    <AdvancedModal isOpen={editing !== undefined} onClose={() => setEditing(undefined)} title={editing ? 'Edit customer' : 'Create customer'}><form className="page-stack" onSubmit={(event) => { event.preventDefault(); if (canManage && !phoneError) save.mutate(); }}>
      <Input label="Customer name" value={form.name} maxLength={200} required onChange={(event) => setForm({ ...form, name: event.target.value })} />
      <PhoneInput label="Customer phone (optional)" value={form.phone} error={phoneError} onChange={(phone) => setForm({ ...form, phone })} />
      <div className="field"><label htmlFor="customer-notes">Notes (optional)</label><textarea id="customer-notes" maxLength={2000} rows={4} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></div>
      {editing && <label className="field">Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Customer['status'] })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>}
      {save.isError && <p role="alert" className="error-text">{getErrorMessage(save.error, 'Customer could not be saved.')}</p>}
      <button className="action-link" type="submit" disabled={save.isPending || !form.name.trim() || Boolean(phoneError)}>{save.isPending ? 'Saving…' : 'Save customer'}</button>
    </form></AdvancedModal>
    <AdvancedModal isOpen={Boolean(detail)} onClose={() => setDetail(null)} title="Customer details">{selected.isLoading ? <p>Loading customer…</p> : selected.isError ? <><p role="alert">Customer details could not be loaded.</p><button className="quiet-button" onClick={() => void selected.refetch()}>Retry details</button></> : selected.data && <div className="page-stack"><h2 className="font-semibold">{selected.data.name}</h2><p>{selected.data.phone ?? 'No phone supplied'}</p><p className="whitespace-pre-wrap break-words">{selected.data.notes ?? 'No notes added'}</p><p className="capitalize">{selected.data.status}</p>{canManage && <button className="quiet-button" onClick={() => { setDetail(null); open(selected.data!); }}>Edit customer</button>}</div>}</AdvancedModal>
    <span className="sr-only">Selected branch context is applied to new customers.</span>{!activeBranchId && <p className="muted">Select a branch before creating a customer.</p>}
  </div>;
}
