import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { useSocketStore } from '../../store/useSocketStore';
import { queueKeys, type QueueToken, useQueue, useCreateToken, useUpdateTokenStatus } from '../../hooks/useQueue';
import { useOperationalContext } from '../../hooks/useOperationalContext';
import { useDynamicForm } from '../../hooks/useDynamicForm';
import { DynamicForm } from '../../components/forms/DynamicForm';
import { branchTime } from '../../utils/operations';
import { getErrorMessage } from '../../api/errors';
import { AdvancedTable, type Column } from '../../components/ui/AdvancedTable';
import { AdvancedModal } from '../../components/ui/AdvancedModal';
import { OperationForm } from '../../components/ui/OperationForm';
import { AppPage, PageHeader, StatusBadge, DetailSection, Skeleton, ErrorState } from '../../components/ui/WorkspacePrimitives';
import { EmptyState } from '../../components/ui/EmptyState';
import { ReceptionFields } from '../../components/forms/ReceptionSelection';
import { useReceptionSelection } from '../../hooks/useReceptionSelection';
import { CustomerFormFields } from '../../components/forms/CustomerFormFields';
import { blankCustomer, customerPhoneError, saveCustomer } from '../../utils/customerDraft';
const labels = { waiting: 'Waiting', serving: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };
const badge = (t: QueueToken) => <StatusBadge tone={t.status === 'waiting' ? 'warning' : t.status === 'serving' ? 'info' : 'neutral'}>{labels[t.status]}</StatusBadge>;
export function QueuePage() {
  const permissions = useAppStore(s => s.user?.permissions ?? []), canManage = permissions.includes('queue.manage');
  const [page, setPage] = useState(1), [open, setOpen] = useState(false), [quick, setQuick] = useState(false);
  const [detail, setDetail] = useState<QueueToken | null>(null), [action, setAction] = useState<{ token: QueueToken; status: QueueToken['status'] } | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID()), [customerDraft, setCustomerDraft] = useState(blankCustomer);
  const context = useOperationalContext(), selection = useReceptionSelection(), fields = useDynamicForm('customer', null, quick);
  const queue = useQueue(page), create = useCreateToken(), transition = useUpdateTokenStatus(), cache = useQueryClient(), socket = useSocketStore(s => s.socket);
  useEffect(() => {
    if (!socket) return;
    const refresh = () => void cache.invalidateQueries({ queryKey: queueKeys.root });
    socket.on('queue.token.created', refresh); socket.on('queue.token.status_changed', refresh); socket.on('connect', refresh);
    return () => { socket.off('queue.token.created', refresh); socket.off('queue.token.status_changed', refresh); socket.off('connect', refresh); };
  }, [socket, cache]);
  const customerSave = useMutation({ mutationFn: () => saveCustomer(customerDraft, fields.patch), onSuccess: async result => {
    await cache.invalidateQueries({ queryKey: ['operational-customers'] });
    selection.setCustomerSearch(result.data.name); selection.setCustomerId(result.data.id); setQuick(false); setOpen(true); toast.success('Customer created and selected');
  } });
  const begin = () => { selection.reset(); create.reset(); setKey(crypto.randomUUID()); setOpen(true); };
  const submit = async () => {
    if (!canManage || create.isPending || !selection.ready) return;
    try { await create.mutateAsync({ customerId: selection.customerId, serviceId: selection.serviceId, idempotencyKey: key }); setOpen(false); toast.success('Token created'); } catch { /* Retain reviewed payload/key. */ }
  };
  const change = async () => {
    if (!action || !canManage || transition.isPending) return;
    try { await transition.mutateAsync({ tokenId: action.token.id, status: action.status, expectedVersion: action.token.version }); setAction(null); setDetail(null); toast.success(`Token ${labels[action.status].toLowerCase()}`); } catch { await cache.invalidateQueries({ queryKey: queueKeys.root }); }
  };
  const next = (t: QueueToken) => <div className="record-actions"><button className="quiet-button" onClick={() => setDetail(t)}>Details</button>{canManage && ['waiting', 'serving'].includes(t.status) && <button className="action-link" disabled={transition.isPending} onClick={() => { transition.reset(); setAction({ token: t, status: t.status === 'waiting' ? 'serving' : 'completed' }); }}>{t.status === 'waiting' ? 'Serve customer' : 'Complete service'}</button>}</div>;
  const columns: Column<QueueToken>[] = [
    { header: 'Token', accessor: 'tokenNumber', cell: ({ row }) => <strong>#{row.tokenNumber}</strong> },
    { header: 'Customer', accessor: 'customer', cell: ({ row }) => row.customer.name }, { header: 'Service', accessor: 'service', cell: ({ row }) => row.service.name },
    { header: 'Status', accessor: 'status', cell: ({ row }) => badge(row) }, { header: 'Created', accessor: 'createdAt', cell: ({ row }) => branchTime(row.createdAt, context.timezone, true) },
    { header: 'Next action', accessor: 'actions', cell: ({ row }) => next(row) },
  ];
  return <AppPage className="operations-workspace"><PageHeader title="Queue Management" eyebrow="Daily operations · Reception" description={`${context.branchName} · Active waiting and in-progress records`} actions={<><button className="quiet-button" onClick={() => void queue.refetch()}>Refresh queue</button>{canManage && <button className="action-link" onClick={begin}>New token</button>}</>} />
    <div className="operations-summary">{(['active', 'waiting', 'serving'] as const).map((key, i) => <section className="panel" key={key}><h2>{['Active queue', 'Waiting', 'In progress'][i]}</h2><p className="stat-value">{queue.isError ? '—' : queue.data?.summary[key] ?? '—'}</p><p className="muted">{context.branchName}</p></section>)}</div>
    {context.isError && <ErrorState title="Branch time unavailable" message="Timestamps wait for the authorized branch timezone; no device-time fallback is used." retry={() => void context.refetch()} />}
    {!canManage && <p className="muted">Read-only queue. Your membership does not permit token creation or status changes.</p>}
    <AdvancedTable mode="server" title="Active tokens" description="Server order · Completed/cancelled tokens leave this active list. No wait estimates are inferred." columns={columns} data={queue.data?.data ?? []} rowKey={t => t.id} loading={queue.isPending} error={queue.isError ? getErrorMessage(queue.error, 'Queue unavailable') : null} onRetry={() => void queue.refetch()} retryLabel="Retry queue" server={{ search: '', page, pageSize: 20, total: queue.data?.pagination.total ?? 0, totalPages: queue.data?.pagination.totalPages ?? 1, onPage: setPage }} emptyState={<EmptyState title="No active tokens" description="This branch has no waiting or in-progress tokens." action={canManage ? 'Create the first token' : undefined} onAction={begin} />} mobileCard={t => <article className="panel mobile-record-card"><div className="operations-record-heading"><h2>#{t.tokenNumber} · {t.customer.name}</h2>{badge(t)}</div><p>{t.service.name}</p><p className="muted">Created {branchTime(t.createdAt, context.timezone, true)}{context.timezone ? ` · ${context.timezone}` : ''}</p>{next(t)}</article>} />
    <OperationForm open={open} title="Create queue token" valid={canManage && selection.ready} busy={create.isPending} dirty={Boolean(selection.customerId || selection.serviceId || selection.customerSearch)} error={create.error} confirmLabel="Generate token" onClose={() => setOpen(false)} onConfirm={() => void submit()} review={<DetailSection title="Walk-in token"><p>{selection.customer?.name} · {selection.service?.name}</p><p>{context.branchName} · New waiting token</p></DetailSection>}>
      <ReceptionFields selection={selection} />{permissions.includes('customers.manage') && <button className="quiet-button" onClick={() => { setOpen(false); setQuick(true); fields.reset(); customerSave.reset(); setCustomerDraft(blankCustomer); }}>Quick-create customer</button>}
      {permissions.includes('services.manage') && <Link className="quiet-button" to="/services">Manage branch services</Link>}
    </OperationForm>
    <OperationForm open={quick} title="Create customer" retryAdvice="Customer creation has no idempotent replay contract. Check the Customer directory before starting another attempt after an uncertain result." valid={!customerSave.isError && permissions.includes('customers.manage') && fields.ready && fields.valid && !fields.error && Boolean(customerDraft.name.trim()) && !customerPhoneError(customerDraft.phone)} busy={customerSave.isPending} dirty={JSON.stringify(customerDraft) !== JSON.stringify(blankCustomer) || Object.keys(fields.patch).length > 0} error={customerSave.error} onClose={() => { setQuick(false); setOpen(true); }} confirmLabel="Create and select" onConfirm={() => { if (!customerSave.isPending) customerSave.mutate(); }} review={<><p>{customerDraft.name} · {customerDraft.phone || 'No phone'} · {customerDraft.notes || 'No notes'}. Creates a customer only, then returns to token selection.</p>{fields.schema && <DynamicForm schema={fields.schema} values={fields.values} readOnly />}</>}>
      {fields.error ? <ErrorState title="Customer form unavailable" message="Reload authorized fields before creating." retry={fields.retry} /> : !fields.ready ? <Skeleton label="Loading customer form…" /> : <CustomerFormFields form={customerDraft} setForm={setCustomerDraft} fields={fields} />}
    </OperationForm>
    <AdvancedModal isOpen={Boolean(detail)} title="Queue token details" onClose={() => setDetail(null)} presentation="drawer" actions={detail && <><button className="quiet-button" onClick={() => setDetail(null)}>Back to queue</button>{canManage && ['waiting', 'serving'].includes(detail.status) && <button className="danger-button" onClick={() => { transition.reset(); setAction({ token: detail, status: 'cancelled' }); setDetail(null); }}>Cancel token</button>}</>}>{detail && <div className="page-stack"><h2>#{detail.tokenNumber} · {detail.customer.name}</h2>{badge(detail)}<DetailSection title="Service"><p>{detail.service.name}</p><p>{detail.provider?.name ?? 'Unassigned provider'}</p></DetailSection><DetailSection title="Customer"><p>{detail.customer.phone ?? 'No phone supplied'}</p></DetailSection><DetailSection title="Created"><p>{branchTime(detail.createdAt, context.timezone, true)} · {context.timezone ?? 'Branch timezone loading'}</p><p className="muted">Record version {detail.version}. Status commands use this exact version.</p></DetailSection></div>}</AdvancedModal>
    <AdvancedModal isOpen={Boolean(action)} title="Confirm token status" onClose={() => { if (!transition.isPending) setAction(null); }} closeOnEscape={!transition.isPending} closeOnBackdropClick={!transition.isPending} actions={<><button className="quiet-button" disabled={transition.isPending} onClick={() => setAction(null)}>Keep current status</button><button className="action-link" disabled={transition.isPending || transition.isError} onClick={() => void change()}>{transition.isPending ? 'Updating…' : 'Confirm status'}</button></>}>{action && <p>#{action.token.tokenNumber} · {action.token.customer.name}: {labels[action.token.status]} → {labels[action.status]}. {['completed', 'cancelled'].includes(action.status) ? 'The token will leave the active list; its history is preserved.' : 'Begin serving this customer.'}</p>}{transition.error && <p role="alert" className="error-text">{getErrorMessage(transition.error, 'Status changed elsewhere. Close this confirmation and review the refreshed queue.')}</p>}</AdvancedModal>
  </AppPage>;
}
export default QueuePage;
