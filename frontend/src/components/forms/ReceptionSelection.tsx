import { useReceptionSelection } from '../../hooks/useReceptionSelection';
import { useAppStore } from '../../store/useAppStore';
import { SearchField, ErrorState, Skeleton } from '../ui/WorkspacePrimitives';
import { OptionSelect } from '../ui/OptionSelect';
export function ReceptionFields({ selection: s }: { selection: ReturnType<typeof useReceptionSelection> }) {
  const permissions = useAppStore(state => state.user?.permissions ?? []);
  if (!permissions.includes('customers.read') || !permissions.includes('services.read')) return <p role="alert">Customer and Service read access is required to select authorized records. Ask your organization administrator.</p>;
  return <div className="operations-form-grid"><div className="page-stack"><SearchField label="Search customers" placeholder="Find by name or phone" maxLength={200} value={s.customerSearch} onChange={e => { s.setCustomerSearch(e.target.value); s.setCustomerId(''); }} />
    {s.customers.isError ? <ErrorState title="Customers unavailable" message="Retry before selecting a customer." retry={() => void s.customers.refetch()} /> : s.customers.isPending ? <Skeleton label="Loading customer choices…" rows={1} /> : <OptionSelect label="Customer" value={s.customerId} onChange={s.setCustomerId} placeholder="Select customer" options={s.customers.data?.data.map(c => ({ id: c.id, name: `${c.name}${c.phone ? ` · ${c.phone}` : ''}` })) ?? []} />}
    <p className="muted">Up to 100 server matches. Refine search to find another customer.</p></div><div className="page-stack"><SearchField label="Search branch services" maxLength={200} value={s.serviceSearch} onChange={e => { s.setServiceSearch(e.target.value); s.setServiceId(''); }} />
    {s.services.isError ? <ErrorState title="Services unavailable" message="Retry the selected branch catalogue." retry={() => void s.services.refetch()} /> : s.services.isPending ? <Skeleton label="Loading branch services…" rows={1} /> : <OptionSelect label="Branch-available service" value={s.serviceId} onChange={s.setServiceId} placeholder="Select service" options={s.services.data?.data.map(service => ({ id: service.id, name: `${service.name}${service.durationMinutes ? ` · ${service.durationMinutes} min` : ''}` })) ?? []} />}
    <p className="muted">Only active branch-available services; up to 100 server matches.</p></div></div>;
}
