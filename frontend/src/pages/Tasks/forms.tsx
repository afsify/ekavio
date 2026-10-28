import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { client } from '../../api/client';
import { useLayoutNavigationGuard } from '../../hooks/useLayoutNavigationGuard';
import { AdvancedModal } from '../../components/ui/AdvancedModal';
import { ConfirmationDialog, ErrorState, Pagination } from '../../components/ui/WorkspacePrimitives';
import { Input } from '../../components/ui/Input';
import { AdvancedSearchSelect } from '../../components/ui/AdvancedSearchSelect';
import { blankDraft, draftFor, editPatch, getTaskData, priorityLabels, statusLabels, taskError, type Assignee, type Page, type TaskDetail, type TaskDraft, type TaskStatus } from './contracts';

export function AssigneePicker({ value, name, onChange, scope, disabled = false }: { value: string; name?: string; onChange: (id: string, name: string) => void; scope: readonly unknown[]; disabled?: boolean }) {
  const [search, setSearch] = useState(''), [page, setPage] = useState(1);
  const roster = useQuery({ queryKey: [...scope, 'assignees', search, page], retry: false, gcTime: 0,
    queryFn: ({ signal }) => getTaskData<Page<Assignee>>('/tasks/assignees', { search, page, limit: 20 }, signal) });
  const choices = roster.data?.data ?? [];
  const received = [...(value && !choices.some(a => a.id === value) ? [{ id: value, name: `${name ?? 'Current assignee'} — retained selection; eligibility rechecked on save` }] : []), ...choices.map(a => ({ id: a.id, name: a.name }))];
  return <fieldset disabled={disabled} className="page-stack task-assignment"><legend className="form-label">Assignment · eligible staff</legend>
    <Input label="Find eligible staff" type="search" value={search} maxLength={200} onChange={e => { setSearch(e.target.value); setPage(1); }} helper="Active members of this branch with their own Task capabilities. Search and pages are server-scoped." />
    {roster.isError ? <ErrorState title="Eligible staff unavailable" message={taskError(roster.error)} retry={() => void roster.refetch()} /> : <>
      {choices.length > 5 ? <AdvancedSearchSelect label="Assign to" required options={received} value={received.find(a => a.id === value) ?? null} displayKey="name" disabled={roster.isFetching || disabled} onChange={selected => { if (selected && !Array.isArray(selected)) onChange(selected.id, choices.find(a => a.id === selected.id)?.name ?? name ?? ''); }} /> : <label className="field">Assign to (required)<select required value={value} disabled={roster.isFetching || disabled} onChange={e => onChange(e.target.value, choices.find(a => a.id === e.target.value)?.name ?? name ?? '')}>
        <option value="">Choose eligible staff</option>
        {value && !choices.some(a => a.id === value) && <option value={value}>{name ?? 'Current assignee'} — retained selection; eligibility rechecked on save</option>}
        {choices.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select></label>}
      {roster.isFetching && <p role="status">Loading eligible staff…</p>}
      {!roster.isFetching && !choices.length && <p className="muted">No eligible staff match this page. Try a different search.</p>}
      <Pagination page={page} totalPages={Math.min(200, Math.ceil((roster.data?.total ?? 0) / 20))} onPage={setPage} busy={roster.isFetching} />
    </>}
  </fieldset>;
}

export type TaskEditor = { kind: 'create'; timezone: string } | { kind: 'edit'; task: TaskDetail } | { kind: 'status'; task: TaskDetail; status: TaskStatus } | { kind: 'cancel' | 'reopen'; task: TaskDetail };
interface Command { method: 'post' | 'patch'; path: string; body: Record<string, unknown> }
export function TaskForm({ editor, scope, branchName, done, close }: { editor: TaskEditor; scope: readonly unknown[]; branchName: string; done: (id: string) => void; close: () => void }) {
  const record = editor.kind === 'create' ? null : editor.task;
  const [initial] = useState(() => record ? draftFor(record) : { ...blankDraft });
  const [draft, setDraft] = useState<TaskDraft>(initial), [assigneeName, setAssigneeName] = useState(record?.assigneeName ?? '');
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [review, setReview] = useState(false), [uncertain, setUncertain] = useState(false), [conflict, setConflict] = useState(false);
  const [leave, setLeave] = useState<null | (() => void)>(null);
  const command = useRef<Command | null>(null), mounted = useRef(true), inFlight = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const fields = editor.kind === 'create' || editor.kind === 'edit';
  const dirty = fields ? JSON.stringify(draft) !== JSON.stringify(initial) : Boolean(reason.trim());
  const protect = dirty || uncertain;
  const askLeave = (next: () => void) => { if (!busy) setLeave(() => next); };
  useLayoutNavigationGuard(protect, busy, askLeave);
  const requestClose = () => { if (!busy && !leave) { if (protect) askLeave(close); else close(); } };
  const patch = editPatch(draft, initial);
  const valid = fields ? Boolean(draft.title.trim() && draft.title.trim().length <= 200 && draft.description.trim().length <= 5000 && draft.assignedMembershipId && (editor.kind === 'create' || Object.keys(patch).length)) : editor.kind === 'status' || Boolean(reason.trim() && reason.trim().length <= 500);
  const title = editor.kind === 'create' ? 'Create task' : editor.kind === 'edit' ? 'Edit task' : editor.kind === 'status' ? `Mark ${statusLabels[editor.status].toLowerCase()}` : editor.kind === 'cancel' ? 'Cancel task' : 'Reopen completed task';
  const timezone = editor.kind === 'create' ? editor.timezone : editor.task.timezone;
  const update = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => { setDraft(current => ({ ...current, [key]: value })); setError(''); };
  const prepare = (): Command => {
    const idempotencyKey = crypto.randomUUID();
    if (editor.kind === 'create') return { method: 'post', path: '/tasks', body: { title: draft.title.trim(), description: draft.description.trim(), priority: draft.priority, assignedMembershipId: draft.assignedMembershipId, localDue: draft.localDue || null, idempotencyKey } };
    return { method: editor.kind === 'edit' ? 'patch' : 'post', path: `/tasks/${editor.task.id}${editor.kind === 'edit' ? '' : `/${editor.kind}`}`, body: { ...(editor.kind === 'edit' ? patch : editor.kind === 'status' ? { status: editor.status } : { reason: reason.trim() }), expectedVersion: editor.task.version, idempotencyKey } };
  };
  const send = async () => {
    if (inFlight.current || conflict || !valid) return;
    // Freeze exactly one command for uncertain outcomes. Only an explicit action
    // may resend it, never a new key or a background mutation retry.
    command.current ??= prepare();
    inFlight.current = true; setBusy(true); setError('');
    try {
      const result = await client[command.current.method]<{ data: { id: string } }>(command.current.path, command.current.body);
      if (mounted.current) done(result.data.data.id);
    } catch (failure) {
      if (!mounted.current) return;
      const code = axios.isAxiosError(failure) ? failure.response?.status : undefined;
      const unknownOutcome = code === undefined || code >= 500;
      setUncertain(unknownOutcome); setConflict(code === 409 || code === 401 || code === 403 || code === 404);
      setError(unknownOutcome ? 'The server may have saved this command. Do not submit a new copy. Your draft and original command key are retained in this open form. Retry only the identical command to recover its result, or inspect current tasks before discarding.' : taskError(failure));
      if (!unknownOutcome) command.current = null;
    } finally { inFlight.current = false; if (mounted.current) setBusy(false); }
  };
  return <><AdvancedModal isOpen title={title} className="task-dialog" size="xl" onClose={requestClose} closeOnEscape={!leave && !busy}
    actions={<><button className="quiet-button" disabled={busy} onClick={requestClose}>{conflict ? 'Close and reload' : 'Close'}</button>{!conflict && (uncertain ? <button className="action-link" disabled={busy} onClick={() => void send()}>{busy ? 'Recovering result…' : 'Retry identical command'}</button> : review ? <><button className="quiet-button" disabled={busy} onClick={() => setReview(false)}>Back to editing</button><button className="action-link" disabled={busy} onClick={() => void send()}>{busy ? 'Saving…' : 'Confirm save'}</button></> : <button className="action-link" disabled={!valid || busy} onClick={() => setReview(true)}>Review task</button>)}</>}>
    <div className="page-stack"><p className="task-form-context">{branchName} · {timezone}. {record ? `Current record version ${record.version}.` : 'New tasks start in To do.'}</p>
      {error && <p role="alert" className="task-warning">{error}</p>}
      {conflict && <p>Close this form and reload the current task before starting a new decision. No changes have been merged automatically.</p>}
      {review && <section className="task-review" aria-label="Review task command"><p className="eyebrow">Review & save</p><h3>Review before saving</h3><p className="task-title">{fields ? draft.title.trim() : record?.title}</p>{fields ? <dl className="task-meta"><div><dt>Assigned to</dt><dd>{assigneeName || 'Selected staff'}</dd></div><div><dt>Priority</dt><dd>{priorityLabels[draft.priority]}</dd></div><div><dt>Deadline · {timezone}</dt><dd>{draft.localDue.replace('T', ' ') || 'No deadline'}</dd></div>{editor.kind === 'edit' && <div><dt>Changed information</dt><dd>{Object.keys(patch).map(key => ({ title: 'Title', description: 'Description', priority: 'Priority', assignedMembershipId: 'Assignee', localDue: 'Deadline' })[key]).join(', ')}</dd></div>}</dl> : <p>{title}{reason.trim() && ` · Reason: ${reason.trim()}`}</p>}<p className="muted">Saving affects this branch only. The server checks current permissions, eligibility and version.</p></section>}
      <fieldset disabled={busy || uncertain || conflict || review} className="page-stack">
        {fields ? <><section className="page-stack task-form-section"><h3>Task information</h3><Input label="Task title" required maxLength={200} value={draft.title} onChange={e => update('title', e.target.value)} helper="Start with a clear action. Up to 200 characters." error={draft.title.length > 0 && !draft.title.trim() ? 'Enter a task title.' : undefined} />
          <label className="field">Description (optional)<textarea maxLength={5000} value={draft.description} onChange={e => update('description', e.target.value)} aria-describedby="task-description-help" /></label><p id="task-description-help" className="muted">Up to 5,000 characters. Include only information needed to complete this work.</p>
          </section>
          {record && (!record.assigneeBranchAssigned || record.assigneeStatus !== 'active') && <p className="task-warning">The recorded assignee is inactive or no longer assigned to this branch. History is retained; choose an eligible replacement or explicitly cancel the open task.</p>}
          <AssigneePicker value={draft.assignedMembershipId} name={assigneeName} scope={scope} disabled={busy || uncertain || conflict || review} onChange={(id, name) => { update('assignedMembershipId', id); setAssigneeName(name); }} />
          <section className="page-stack task-form-section"><h3>Priority & deadline</h3><div className="task-form-grid"><label className="field">Priority<select value={draft.priority} onChange={e => update('priority', e.target.value as TaskDraft['priority'])}>{Object.entries(priorityLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            <Input label="Deadline (optional)" type="datetime-local" step="1" value={draft.localDue} onChange={e => update('localDue', e.target.value)} helper={`Branch time: ${timezone}. Leave blank for no deadline. The server rejects ambiguous or nonexistent daylight-saving times.`} />
          </div></section>
        </> : <section className="page-stack"><h3 className="task-title">{record?.title}</h3><p>{editor.kind === 'status' ? `Change ${statusLabels[record!.status]} to ${statusLabels[editor.status]}.` : editor.kind === 'cancel' ? 'Cancellation is terminal. This task cannot be reopened.' : 'Reopen to To do. Previous completion remains in history.'}</p>{editor.kind !== 'status' && <label className="field">Reason (required)<textarea required maxLength={500} value={reason} onChange={e => setReason(e.target.value)} /></label>}</section>}
      </fieldset>
      {editor.kind === 'edit' && <p className="muted">Only changed fields are sent. Clearing the deadline is explicit; other omitted values remain unchanged.</p>}
    </div>
  </AdvancedModal><ConfirmationDialog open={Boolean(leave)} title="Discard task draft?" description={uncertain ? 'The command may already have committed. Discarding loses this in-memory retry key. Inspect current tasks before creating another copy. Forced workspace or permission changes also remove this private draft.' : 'Your unsaved changes will be discarded. No automatic save will occur.'} confirmLabel="Discard draft" onCancel={() => setLeave(null)} onConfirm={() => { const next = leave; setLeave(null); next?.(); }} /></>;
}
