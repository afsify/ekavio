import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Plus, Users, Pencil, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { client } from '../../api/client';
import { getErrorMessage } from '../../api/errors';
import { useAppStore } from '../../store/useAppStore';
import { type Paginated } from '../../hooks/useQueue';
import { AdvancedModal } from '../../components/ui/AdvancedModal';
import { AdvancedTable, type Column } from '../../components/ui/AdvancedTable';
import { Input } from '../../components/ui/Input';
import { PhoneInput } from '../../components/ui/PhoneInput';
import { EmptyState } from '../../components/ui/EmptyState';
import { TechnicalDetails } from '../../components/ui/TechnicalDetails';
import { AppPage, PageHeader, SearchField, FilterPanel, FilterChip, StatusBadge, DetailSection, Skeleton, ErrorState } from '../../components/ui/WorkspacePrimitives';
import { normalizePhone } from '../../utils/phone';
import { useDynamicForm } from '../../hooks/useDynamicForm';
import { DynamicForm } from '../../components/forms/DynamicForm';
import { CustomerCrmContext } from '../../components/crm/CustomerCrmContext';
import { EntityFields } from '../../components/forms/EntityFields';

interface Customer { id: string; name: string; phone: string | null; notes: string | null; status: 'active' | 'inactive'; createdAt?: string; updatedAt?: string }
const blank = { name: '', phone: '', notes: '', status: 'active' as Customer['status'] };
const canonicalForm = (customer: Customer | null) => customer ? { name: customer.name, phone: customer.phone ?? '', notes: customer.notes ?? '', status: customer.status } : blank;
const status = (customer: Customer) => <StatusBadge tone={customer.status === 'active' ? 'success' : 'neutral'}>{customer.status === 'active' ? 'Active' : 'Inactive'}</StatusBadge>;

export default function CustomersPage() {
  const { activeTenantId, activeBranchId, user } = useAppStore();
  const canManage = user?.permissions?.includes('customers.manage');
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  // Only page size is persisted in the URL. Names, phones and filter values
  // remain ephemeral, never in browser storage or shared URLs.
  const limit = [10,20,50,100].includes(Number(params.get('limit'))) ? Number(params.get('limit')) : 20;
  const [filterField, setFilterField] = useState('');
  const [filterValue, setFilterValue] = useState('');
  const [filterOperator, setFilterOperator] = useState('eq');
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [editing, setEditing] = useState<Customer | null | undefined>(undefined);
  const [detail, setDetail] = useState<string | null>(params.get('customer'));
  const [form, setForm] = useState(blank);
  const [discard, setDiscard] = useState(false);
  const fields = useDynamicForm('customer', editing?.id);
  const filterDefinition = fields.schema?.definitions.find(f => f.key === filterField);
  const filterable = fields.schema?.definitions.filter(f => f.status === 'active' && f.filterable && f.field_type !== 'multiselect') ?? [];
  const filtering = Boolean(search || (filterField && filterValue));
  const cache = useQueryClient();
  const accessScope = [user?.id, activeTenantId, activeBranchId, user?.permissions?.join(',')];
  useEffect(() => {
    if (search === debouncedSearch) return;
    const timer = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 250);
    return () => clearTimeout(timer);
  }, [search, debouncedSearch]);
  const customers = useQuery({ queryKey: ['operational-customers', ...accessScope, debouncedSearch, page, limit, filterField, filterValue, filterOperator], enabled: Boolean(activeTenantId), queryFn: async ({ signal }) => (await client.get<Paginated<Customer>>('/customers', { signal, params: { search: debouncedSearch || undefined, page, limit, ...(filterField && filterValue ? { field: filterField, value: filterValue, operator: filterOperator } : {}) } })).data });
  const selected = useQuery({ queryKey: ['customer-detail', ...accessScope, detail], enabled: Boolean(detail && activeTenantId), queryFn: async ({ signal }) => (await client.get<{ data: Customer }>(`/customers/${detail}`, { signal })).data.data });
  const save = useMutation({
    mutationFn: async () => {
      const body = { customFields: fields.patch, name: form.name.trim(), phone: form.phone.trim() || null, notes: form.notes.trim() || null, ...(editing ? { status: form.status } : {}) };
      return editing ? client.patch(`/customers/${editing.id}`, body) : client.post('/customers', body);
    },
    onSuccess: async () => {
      await Promise.all(['form-values', 'operational-customers', 'customer-detail', 'customer-dues-customers', 'dashboardStats'].map(key => cache.invalidateQueries({ queryKey: [key] })));
      setEditing(undefined); setDiscard(false); toast.success('Customer saved');
    },
  });
  const open = (customer: Customer | null) => { fields.reset(); save.reset(); setDiscard(false); setEditing(customer); setForm(canonicalForm(customer)); };
  const phoneError = form.phone && form.phone !== editing?.phone && !normalizePhone(form.phone) ? 'Enter a valid phone number or leave it blank.' : undefined;
  const dirty = JSON.stringify(form) !== JSON.stringify(canonicalForm(editing ?? null)) || Object.keys(fields.patch).length > 0;
  const closeForm = () => { if (save.isPending) return; if (dirty) setDiscard(true); else setEditing(undefined); };
  useEffect(() => {
    if (editing === undefined || !dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [editing, dirty]);
  const clear = () => { setSearch(''); setDebouncedSearch(''); setFilterField(''); setFilterValue(''); setPage(1); };
  const actions = (customer: Customer) => <div className="record-actions customer-row-actions"><button className="quiet-button" aria-label={`View ${customer.name}`} onClick={() => setDetail(customer.id)}>View</button>{canManage && <button className="icon-button" aria-label={`Edit ${customer.name}`} onClick={() => open(customer)}><Pencil size={18} aria-hidden="true" /></button>}</div>;
  const columns: Column<Customer>[] = [
{ header: 'Customer', accessor: 'name', cell: ({ row }) => <div className="customer-name"><span className="record-avatar" aria-hidden="true">{row.name.slice(0,1).toUpperCase()}</span><h2><button className="record-open" onClick={() => setDetail(row.id)}>{row.name}</button></h2></div> },
    { header: 'Phone', accessor: 'phone', cell: ({ row }) => row.phone ?? <span className="muted">Not supplied</span> },
    { header: 'Status', accessor: 'status', cell: ({ row }) => status(row) },
    { header: 'Actions', accessor: 'actions', align: 'right', cell: ({ row }) => actions(row) },
  ];
  return <AppPage className="customers-workspace"><PageHeader title="Customers" eyebrow="Customers & relationships" description="One customer record, connected to your daily work." actions={canManage && <button className="action-link" onClick={() => open(null)}><Plus size={18} aria-hidden="true" />Create customer</button>} />
    <div className="customer-tools"><SearchField label="Search customers" placeholder="Find by name or phone" maxLength={200} value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />{filterable.length > 0 && <FilterPanel open={filtersOpen} onToggle={() => setFiltersOpen(value => !value)} count={filterField && filterValue ? 1 : 0}>
      <label className="field">Custom field filter<select value={filterField} onChange={e => { setFilterField(e.target.value); setFilterValue(''); setFilterOperator('eq'); setPage(1); }}><option value="">All customers</option>{filterable.map(f => <option key={f.id} value={f.key}>{f.label}</option>)}</select></label>
      {filterDefinition && <><label className="field">Comparison<select value={filterOperator} onChange={e => { setFilterOperator(e.target.value); setPage(1); }}><option value="eq">Equals</option>{['number','currency','date','datetime'].includes(filterDefinition.field_type) && <><option value="gte">At least / on or after</option><option value="lte">At most / on or before</option></>}</select></label>{['select','radio','checkbox'].includes(filterDefinition.field_type) ? <label className="field">Filter value<select value={filterValue} onChange={e => { setFilterValue(e.target.value); setPage(1); }}><option value="">Choose a value</option>{filterDefinition.field_type === 'checkbox' ? <><option value="true">Yes</option><option value="false">No</option></> : filterDefinition.options.map(o => <option key={o.id} value={o.id}>{o.label}{o.status === 'archived' ? ' (archived)' : ''}</option>)}</select></label> : <Input label="Filter value" value={filterValue} maxLength={1000} onChange={e => { setFilterValue(e.target.value); setPage(1); }} />}</>}
    </FilterPanel>}</div>
    <div className="list-context"><p className="muted">Organization-wide customer directory · Alphabetical server order</p>{filtering && <FilterChip label="Customer search" onRemove={clear} />}</div>
    {fields.error && <p role="alert">Custom field configuration unavailable. <button className="quiet-button" onClick={fields.retry}>Retry fields</button></p>}
<AdvancedTable mode="server" columns={columns} data={customers.data?.data ?? []} rowKey={row => row.id} onRowClick={row => setDetail(row.id)} loading={customers.isPending || search !== debouncedSearch} error={customers.isError ? getErrorMessage(customers.error, 'Customers could not be loaded.') : null} onRetry={() => void customers.refetch()} retryLabel="Retry customers" emptyState={<EmptyState title={filtering ? 'No matching customers' : 'No customers yet'} description={filtering ? 'Try another name, phone number or field filter.' : 'Create a customer before booking visits or recording dues.'} action={filtering ? 'Clear search' : canManage ? 'Create your first customer' : undefined} onAction={filtering ? clear : () => open(null)} />} server={{ search: debouncedSearch, page, pageSize: limit, total: customers.data?.pagination.total ?? 0, totalPages: customers.data?.pagination.totalPages ?? 1, onPage: setPage, onPageSize: size => { const next = new URLSearchParams(params); next.set('limit', String(size)); setParams(next, { replace: true }); setPage(1); } }} mobileCard={customer => <article className="panel mobile-record-card"><div className="customer-name"><span className="record-avatar" aria-hidden="true"><Users size={20} /></span><h2><button className="record-open" onClick={() => setDetail(customer.id)}>{customer.name}</button></h2>{status(customer)}</div><p className="muted">{customer.phone ?? 'No phone supplied'}</p>{actions(customer)}</article>} />
    <AdvancedModal isOpen={editing !== undefined} onClose={closeForm} title={discard ? 'Discard unsaved changes?' : editing ? 'Edit customer' : 'Create customer'} size="xl" closeOnBackdropClick={!save.isPending} closeOnEscape={!save.isPending} actions={discard ? <><button className="quiet-button" onClick={() => setDiscard(false)}>Keep editing</button><button className="danger-button" onClick={() => { setDiscard(false); setEditing(undefined); }}>Discard changes</button></> : <><button className="quiet-button" disabled={save.isPending} onClick={closeForm}>Cancel</button><button className="action-link" form="customer-form" type="submit" disabled={save.isPending || !fields.ready || !fields.valid || Boolean(fields.error) || !form.name.trim() || Boolean(phoneError)}>{save.isPending ? 'Saving…' : 'Save customer'}</button></>}>
      {discard ? <p>Your changes have not been saved. Discard them or return to the form.</p> : <form id="customer-form" className="page-stack customer-form" onSubmit={event => { event.preventDefault(); if (canManage && !save.isPending && fields.ready && fields.valid && !fields.error && !phoneError && form.name.trim()) save.mutate(); }}>
        <p className="muted">{editing ? 'Update this customer without changing their identity.' : 'Add the essentials now. You can add more information later.'}</p>
        {fields.error && <ErrorState title="Form configuration unavailable" message="Reload the authorized fields before saving." retry={fields.retry} retryLabel="Retry fields" />}
        {!fields.schema && !fields.error && <Skeleton label="Loading customer form…" />}
        {fields.schema && <DynamicForm schema={fields.schema} values={fields.values} onChange={fields.change} builtins={{
          name: <Input label="Customer name" value={form.name} maxLength={200} required onChange={e => setForm({ ...form, name: e.target.value })} />,
          phone: <PhoneInput label="Customer phone (optional)" value={form.phone} error={phoneError} onChange={phone => setForm({ ...form, phone })} />,
          notes: <div className="field"><label htmlFor="customer-notes">Notes (optional)</label><textarea id="customer-notes" maxLength={2000} rows={4} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>,
          status: editing && <label className="field">Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value as Customer['status'] })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>,
        }} />}
        {save.isError && <p role="alert" className="error-text">{getErrorMessage(save.error, 'Customer could not be saved.')}</p>}
      </form>}
    </AdvancedModal>
    <AdvancedModal isOpen={Boolean(detail)} onClose={() => setDetail(null)} title="Customer details" size="xl" presentation="drawer" actions={<><button className="quiet-button" onClick={() => setDetail(null)}><ArrowLeft size={16} aria-hidden="true" />Back to customers</button>{canManage && selected.data && <button className="action-link" onClick={() => { setDetail(null); open(selected.data!); }}>Edit customer</button>}</>}>
      {selected.isPending ? <Skeleton label="Loading customer details…" /> : selected.isError ? <ErrorState title="Customer details could not be loaded" message="The customer may be unavailable in this workspace." retry={() => void selected.refetch()} retryLabel="Retry details" /> : selected.data && <div className="page-stack customer-details"><div className="detail-identity"><span className="record-avatar" aria-hidden="true">{selected.data.name.slice(0,1).toUpperCase()}</span><div><h3>{selected.data.name}</h3>{status(selected.data)}</div></div><DetailSection title="Contact"><dl><dt>Phone</dt><dd>{selected.data.phone ?? 'No phone supplied'}</dd></dl></DetailSection><DetailSection title="Notes"><p>{selected.data.notes ?? 'No notes added'}</p></DetailSection><DetailSection title="Additional information"><EntityFields entity="customer" id={selected.data.id} /></DetailSection><CustomerCrmContext customerId={selected.data.id} /><TechnicalDetails values={{ 'Customer identifier': selected.data.id }} /></div>}
    </AdvancedModal>
    {!activeBranchId && <p className="muted">Select a branch before creating a customer.</p>}
  </AppPage>;
}
