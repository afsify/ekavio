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
import { useDynamicForm } from '../../hooks/useDynamicForm';
import { DynamicForm } from '../../components/forms/DynamicForm';
import { useSearchParams } from 'react-router-dom';
import { CustomerCrmContext } from '../../components/crm/CustomerCrmContext';
import { EntityFields } from '../../components/forms/EntityFields';

interface Customer { id: string; name: string; phone: string | null; notes: string | null; status: 'active' | 'inactive' }
const blank = { name: '', phone: '', notes: '', status: 'active' as Customer['status'] };
export default function CustomersPage() {
  const { activeTenantId, activeBranchId, user } = useAppStore();
  const canManage = user?.permissions?.includes('customers.manage');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [filterField,setFilterField]=useState(''),[filterValue,setFilterValue]=useState(''),[filterOperator,setFilterOperator]=useState('eq');
  const [editing, setEditing] = useState<Customer | null | undefined>(undefined);
  const [params]=useSearchParams();
  const [detail, setDetail] = useState<string | null>(params.get('customer'));
  const [form, setForm] = useState(blank);
  const fields=useDynamicForm('customer',editing?.id);
  const filterDefinition=fields.schema?.definitions.find(f=>f.key===filterField);
  const filtering=Boolean(search||(filterField&&filterValue));
  const cache = useQueryClient();
  const customers = useQuery({ queryKey: ['operational-customers', activeTenantId, search, page,filterField,filterValue,filterOperator], queryFn: async () => (await client.get<Paginated<Customer>>('/customers', { params: { search: search || undefined, page, limit: 20,...(filterField&&filterValue?{field:filterField,value:filterValue,operator:filterOperator}:{}) } })).data });
  const selected = useQuery({ queryKey: ['customer-detail', activeTenantId, detail], enabled: Boolean(detail), queryFn: async () => (await client.get<{ data: Customer }>(`/customers/${detail}`)).data.data });
  const save = useMutation({
    mutationFn: async () => {
      const body = { customFields:fields.patch,name: form.name.trim(), phone: form.phone.trim() || null, notes: form.notes.trim() || null, ...(editing ? { status: form.status } : {}) };
      if (editing) return client.patch(`/customers/${editing.id}`, body);
      return client.post('/customers', body);
    },
    onSuccess: async () => { await cache.invalidateQueries({ queryKey: ['form-values'] });await cache.invalidateQueries({ queryKey: ['operational-customers'] }); await cache.invalidateQueries({ queryKey: ['customer-detail'] }); await cache.invalidateQueries({ queryKey: ['customer-dues-customers'] }); setEditing(undefined); toast.success('Customer saved'); },
  });
  const open = (customer: Customer | null) => { fields.reset();save.reset(); setEditing(customer); setForm(customer ? { name: customer.name, phone: customer.phone ?? '', notes: customer.notes ?? '', status: customer.status } : blank); };
  // Preserve legacy valid display numbers on an unrelated edit; normalize newly entered phones.
  const phoneError = form.phone && form.phone !== editing?.phone && !normalizePhone(form.phone) ? 'Enter a valid phone number or leave it blank.' : undefined;
  return <div className="page-stack"><header className="page-heading"><div><h1>Customers</h1><p>Manage the customer records used across your workspace.</p></div>{canManage && <button className="action-link" onClick={() => open(null)}>Create customer</button>}</header>
    <Input label="Search customers" type="search" maxLength={200} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
    {fields.schema?.definitions.some(f=>f.status==='active'&&f.filterable&&f.field_type!=='multiselect')&&<div className="panel flex flex-wrap gap-3"><label className="field">Custom field filter<select value={filterField} onChange={e=>{setFilterField(e.target.value);setFilterValue('');setFilterOperator('eq');setPage(1);}}><option value="">All customers</option>{fields.schema.definitions.filter(f=>f.status==='active'&&f.filterable&&f.field_type!=='multiselect').map(f=><option key={f.id} value={f.key}>{f.label}</option>)}</select></label>{filterDefinition&&<><label className="field">Comparison<select value={filterOperator} onChange={e=>{setFilterOperator(e.target.value);setPage(1);}}><option value="eq">Equals</option>{['number','currency','date','datetime'].includes(filterDefinition.field_type)&&<><option value="gte">At least / on or after</option><option value="lte">At most / on or before</option></>}</select></label>{['select','radio','checkbox'].includes(filterDefinition.field_type)?<label className="field">Filter value<select value={filterValue} onChange={e=>{setFilterValue(e.target.value);setPage(1);}}><option value="">Choose a value</option>{filterDefinition.field_type==='checkbox'?<><option value="true">Yes</option><option value="false">No</option></>:filterDefinition.options.map(o=><option key={o.id} value={o.id}>{o.label}{o.status==='archived'?' (archived)':''}</option>)}</select></label>:<Input label="Filter value" value={filterValue} maxLength={1000} onChange={e=>{setFilterValue(e.target.value);setPage(1);}}/>}</>}</div>}
    {customers.isLoading ? <p role="status">Loading customers…</p> : customers.isError ? <section className="panel" role="alert"><p>{getErrorMessage(customers.error, 'Customers could not be loaded.')}</p><button className="quiet-button mt-3" onClick={() => void customers.refetch()}>Retry customers</button></section> : customers.data?.data.length === 0 ? <EmptyState title={filtering ? 'No matching customers' : 'No customers yet'} description={filtering ? 'Try another name or phone number.' : 'Create a customer before booking visits or recording dues.'} action={filtering ? 'Clear search' : canManage ? 'Create your first customer' : undefined} onAction={filtering ? () => {setSearch('');setFilterField('');setFilterValue('');} : () => open(null)} /> : <div className="catalogue-grid">{customers.data?.data.map((customer) => <article className="panel record-card" key={customer.id}><h2>{customer.name}</h2><p className="muted">{customer.phone ?? 'No phone supplied'}</p><p className="muted capitalize">{customer.status}</p><div className="record-actions"><button className="quiet-button" onClick={() => setDetail(customer.id)}>View {customer.name}</button>{canManage && <button className="quiet-button" onClick={() => open(customer)}>Edit {customer.name}</button>}</div></article>)}</div>}
    {customers.data && <div className="pagination"><button className="quiet-button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {Math.max(1, customers.data.pagination.totalPages)}</span><button className="quiet-button" disabled={page >= customers.data.pagination.totalPages} onClick={() => setPage(page + 1)}>Next</button></div>}
    <AdvancedModal isOpen={editing !== undefined} onClose={() => setEditing(undefined)} title={editing ? 'Edit customer' : 'Create customer'}><form className="page-stack" onSubmit={(event) => { event.preventDefault(); if (canManage && fields.valid && !phoneError) save.mutate(); }}>
      {fields.error&&<p role="alert">Form configuration unavailable. <button type="button" onClick={fields.retry}>Retry fields</button></p>}
      {fields.schema&&<DynamicForm schema={fields.schema} values={fields.values} onChange={fields.change} builtins={{
        name:<Input label="Customer name" value={form.name} maxLength={200} required onChange={(event) => setForm({ ...form, name: event.target.value })}/>,
        phone:<PhoneInput label="Customer phone (optional)" value={form.phone} error={phoneError} onChange={(phone) => setForm({ ...form, phone })}/>,
        notes:<div className="field"><label htmlFor="customer-notes">Notes (optional)</label><textarea id="customer-notes" maxLength={2000} rows={4} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })}/></div>,
        status:editing&&<label className="field">Status<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as Customer['status'] })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      }}/>}
      {save.isError && <p role="alert" className="error-text">{getErrorMessage(save.error, 'Customer could not be saved.')}</p>}
      <button className="action-link" type="submit" disabled={save.isPending || !fields.ready||!fields.valid || Boolean(fields.error) || !form.name.trim() || Boolean(phoneError)}>{save.isPending ? 'Saving…' : 'Save customer'}</button>
    </form></AdvancedModal>
    <AdvancedModal isOpen={Boolean(detail)} onClose={() => setDetail(null)} title="Customer details">{selected.isLoading ? <p>Loading customer…</p> : selected.isError ? <><p role="alert">Customer details could not be loaded.</p><button className="quiet-button" onClick={() => void selected.refetch()}>Retry details</button></> : selected.data && <div className="page-stack"><h2 className="font-semibold">{selected.data.name}</h2><p>{selected.data.phone ?? 'No phone supplied'}</p><p className="whitespace-pre-wrap break-words">{selected.data.notes ?? 'No notes added'}</p><p className="capitalize">{selected.data.status}</p><EntityFields entity="customer" id={selected.data.id}/><CustomerCrmContext customerId={selected.data.id}/>{canManage && <button className="quiet-button" onClick={() => { setDetail(null); open(selected.data!); }}>Edit customer</button>}</div>}</AdvancedModal>
    <span className="sr-only">Selected branch context is applied to new customers.</span>{!activeBranchId && <p className="muted">Select a branch before creating a customer.</p>}
  </div>;
}
