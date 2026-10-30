import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client } from '../../api/client';
import { getErrorMessage } from '../../api/errors';
import { useAppStore } from '../../store/useAppStore';
import { type Paginated, useBranchServices } from '../../hooks/useQueue';
import { AdvancedModal } from '../../components/ui/AdvancedModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { AppPage, PageHeader, SearchField, StatusBadge, Pagination } from '../../components/ui/WorkspacePrimitives';
import './Services.css';
import { EntityFields } from '../../components/forms/EntityFields';
import { useOperationalScope } from '../../hooks/useOperationalContext';
import { ServiceEditor, type Service } from './ServiceEditor';

interface Staff { id: string; membershipId: string; name: string; branchIds: string[] }
interface Provider { membershipId: string; name: string }
// In-memory only, no credentials or record values. Modal/route replacement must
// not make a non-idempotent uncertain command replayable; full reload is explicit.
const uncertainServiceAuthorities = new Set<string>();
export default function ServicesPage() {
  const scope = useOperationalScope();
  return <ServiceWorkspace key={JSON.stringify(scope)} />;
}
function ServiceWorkspace() {
  const scope = useOperationalScope();
  const { activeTenantId, activeBranchId, user } = useAppStore();
  const manage = Boolean(user?.permissions?.includes('services.manage'));
  const staffRead = Boolean(user?.permissions?.includes('staff.read'));
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Service | null | undefined>();
  const [verificationRequired, setVerificationRequired] = useState(() => uncertainServiceAuthorities.has(JSON.stringify(scope)));
  const [providerService, setProviderService] = useState<Service | null>(null);
  const cache = useQueryClient();
  const services = useQuery({ queryKey: ['operational-services-admin', ...scope, search, page], enabled: Boolean(activeTenantId && user?.permissions?.includes('services.read')), queryFn: async ({ signal }) => (await client.get<Paginated<Service>>('/services', { signal, params: { scope: 'organization', search: search || undefined, page, limit: 20 } })).data });
  const available = useBranchServices();
  const providers = useQuery({ queryKey: ['service-providers', ...scope, providerService?.id], enabled: Boolean(providerService), queryFn: async ({ signal }) => (await client.get<{ data: Provider[] }>(`/services/${providerService!.id}/providers`, { signal })).data.data });
  const staff = useQuery({ queryKey: ['service-assignment-staff', ...scope], enabled: Boolean(providerService && staffRead), queryFn: async ({ signal }) => (await client.get<{ data: Staff[] }>('/staff', { signal })).data.data });
  const refresh = async () => {
    await cache.invalidateQueries({ queryKey: ['form-values', ...scope, 'service'] }, { throwOnError: true });
    await cache.invalidateQueries({ queryKey: ['operational-services-admin', ...scope] }, { throwOnError: true });
    await cache.invalidateQueries({ queryKey: ['operational-services', ...scope] }, { throwOnError: true });
  };
  const assign = useMutation({ mutationFn: async (input: { membershipId: string; active: boolean }) => client.put(`/services/${providerService!.id}/providers`, input), onSuccess: () => cache.invalidateQueries({ queryKey: ['service-providers'] }) });
  const open = (service: Service | null) => { if (!verificationRequired) setEditing(service ? structuredClone(service) : null); };
  const eligibleStaff = staff.data?.filter(person => person.branchIds.includes(activeBranchId ?? '') && !providers.data?.some(provider => provider.membershipId === person.membershipId));
  return <AppPage className="services-workspace"><PageHeader title="Services" eyebrow="Organization catalogue" description="Define what you offer. Manage branch providers separately from catalogue details." actions={manage && <button className="action-link" disabled={!activeBranchId || verificationRequired} onClick={() => open(null)}>Create service</button>} />
    {verificationRequired && <p role="alert">A Service write outcome is uncertain. Check authoritative catalogue records and reload the workspace before starting another Service command. No write was retried.</p>}
    <section className="panel services-toolbar" aria-label="Catalogue search"><SearchField label="Search services" placeholder="Search by service name" maxLength={200} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /><div className="services-scope"><strong>Organization catalogue</strong><p className="muted">Branch availability is shown on each service. New services are available in the selected branch.</p></div>{search && <button className="quiet-button" onClick={() => { setSearch(''); setPage(1); }}>Clear search</button>}</section>
    {services.isLoading ? <p role="status">Loading services…</p> : services.isError ? <section className="panel" role="alert"><p>{getErrorMessage(services.error, 'Services could not be loaded.')}</p><button className="quiet-button mt-3" onClick={() => void services.refetch()}>Retry services</button></section> : services.data?.data.length === 0 ? <EmptyState title={search ? 'No matching services' : 'No services yet'} description={search ? 'Try a different service name.' : 'Create your first service before booking appointments or issuing tokens.'} action={search ? 'Clear search' : manage ? 'Create your first service' : undefined} onAction={search ? () => setSearch('') : () => open(null)} /> : <div className="catalogue-grid">{services.data?.data.map((service) => <article className="panel record-card" key={service.id}><div className="service-card-heading"><h2>{service.name}</h2><StatusBadge tone={service.active ? 'success' : 'neutral'}>{service.active ? 'Active' : 'Inactive'}</StatusBadge></div><p className="muted">{service.durationMinutes} minutes</p><p className="mt-2">{service.description ?? 'No description added'}</p><p className="service-branch"><strong>Selected branch</strong>{available.data?.data.some((item) => item.id === service.id) ? 'Available in selected branch' : service.active ? 'Branch availability not confirmed' : 'Unavailable while inactive'}</p><div className="record-actions">{manage && <button className="quiet-button" aria-label={`Edit ${service.name}`} onClick={() => open(service)}>Edit</button>}<button className="quiet-button" aria-label={`Providers for ${service.name}`} onClick={() => { assign.reset(); setProviderService(service); }}>Providers</button></div></article>)}</div>}
    {services.data && <Pagination page={page} totalPages={services.data.pagination.totalPages} onPage={setPage} busy={services.isFetching} />}
    {editing !== undefined && manage && <ServiceEditor key={editing?.id ?? 'new'} service={editing} onSaved={refresh} onClose={() => setEditing(undefined)} onUncertain={() => { uncertainServiceAuthorities.add(JSON.stringify(scope)); setVerificationRequired(true); }} />}
    <AdvancedModal isOpen={Boolean(providerService)} onClose={() => setProviderService(null)} title={`Providers · ${providerService?.name ?? ''}`}><div className="service-providers"><p className="muted">Provider assignments apply to the selected branch, not the entire organization catalogue.</p>{providerService&&<EntityFields entity="service" id={providerService.id}/>}{providers.isLoading ? <p role="status">Loading providers…</p> : providers.isError ? <><p role="alert">Providers could not be loaded.</p><button className="quiet-button" onClick={() => void providers.refetch()}>Retry providers</button></> : <section className="service-provider-section"><h2>Assigned in selected branch</h2>{providers.data?.length ? providers.data.map((provider) => <div key={provider.membershipId} className="service-provider-row"><span>{provider.name}</span>{manage && <button className="quiet-button" disabled={assign.isPending} onClick={() => assign.mutate({ membershipId: provider.membershipId, active: false })}>Unassign {provider.name}</button>}</div>) : <p className="muted">No providers assigned. Bookings may remain unassigned.</p>}</section>}
      {manage && staffRead && <section className="service-provider-section"><h2>Available staff</h2><p className="muted">Only staff assigned to this branch are eligible. Assigning a provider does not change the service duration or catalogue status.</p>{staff.isLoading ? <p role="status">Loading staff…</p> : staff.isError ? <><p role="alert">Staff could not be loaded.</p><button className="quiet-button" onClick={() => void staff.refetch()}>Retry staff</button></> : eligibleStaff?.map((person) => <button key={person.membershipId} className="quiet-button" disabled={assign.isPending || providers.isError} onClick={() => assign.mutate({ membershipId: person.membershipId, active: true })}>Assign {person.name}</button>)}{staff.isSuccess && providers.isSuccess && eligibleStaff?.length === 0 && <p className="muted">No additional eligible staff in this branch.</p>}</section>}{assign.isError && <p role="alert" className="error-text">{getErrorMessage(assign.error, 'Assignment could not be saved.')}</p>}</div></AdvancedModal>
  </AppPage>;
}
