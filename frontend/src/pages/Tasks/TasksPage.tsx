import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, CheckCheck, ClipboardList, Plus, UserRound } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { hasEntitlement } from '../../commercial/catalogue';
import { AdvancedTable, type Column } from '../../components/ui/AdvancedTable';
import { AdvancedModal } from '../../components/ui/AdvancedModal';
import { EmptyState } from '../../components/ui/EmptyState';
import { AppPage, DetailSection, ErrorState, FilterChip, FilterPanel, PageHeader, Pagination, SearchField, Skeleton, StatusBadge } from '../../components/ui/WorkspacePrimitives';
import { AssigneePicker, TaskForm, type TaskEditor } from './forms';
import { eventLabels, getTaskData, priorityLabels, progressTargets, statusLabels, taskError, taskTime, type Page, type Task, type TaskDetail, type TaskEvent, type TaskPage } from './contracts';
import './Tasks.css';

const badges = (task: Task) => <div className="task-badges"><StatusBadge tone={task.status === 'completed' ? 'success' : task.status === 'in_progress' ? 'info' : 'neutral'}>{statusLabels[task.status]}</StatusBadge><StatusBadge tone={task.priority === 'high' ? 'warning' : 'neutral'}>{priorityLabels[task.priority]} priority</StatusBadge>{task.overdue && <StatusBadge tone="danger">Overdue</StatusBadge>}</div>;
const workViews = [['all', 'All'], ['today', 'Due today'], ['overdue', 'Overdue'], ['upcoming', 'Upcoming'], ['completed', 'Completed']] as const;
const attentionLabels: Record<string, string> = { today: 'Due today', overdue: 'Overdue', upcoming: 'Upcoming' };
const deadline = (task: Task, timezone: string) => <span className={`task-deadline ${task.overdue ? 'is-overdue' : ''}`}><CalendarClock size={16} aria-hidden="true" /><span>{taskTime(task.dueAt, timezone)}{task.overdue && <small>Past deadline · open work</small>}</span></span>;

export default function TasksPage() {
  const { user, activeTenantId, activeBranchId, entitlements } = useAppStore();
  const permissions = user?.permissions ?? [];
  if (!user || !activeTenantId || !activeBranchId) return <AppPage><ErrorState title="Select a workspace and branch" message="Sign in with an active membership and select an authorized branch to view Tasks." /></AppPage>;
  if (!hasEntitlement(entitlements, 'tasks')) return <AppPage><ErrorState title="Tasks is not enabled" message="This organization does not have effective Tasks access. Contact your workspace administrator; no automatic purchase or activation occurs here." /></AppPage>;
  if (!permissions.some(p => p === 'tasks.read_own' || p === 'tasks.read')) return <AppPage><ErrorState title="Task permission required" message="You do not have permission to read Tasks in this workspace." /></AppPage>;
  const scope = ['tasks', user.id, activeTenantId, activeBranchId, user.membershipId, [...permissions].sort().join(',')];
  const membership = user.memberships?.find(m => m.organizationId === activeTenantId);
  const branchName = membership?.branches.find(b => b.id === activeBranchId)?.name ?? 'Selected branch';
  return <Workspace key={JSON.stringify(scope)} scope={scope} own={permissions.includes('tasks.read_own')} team={permissions.includes('tasks.read')} manage={permissions.includes('tasks.read') && permissions.includes('tasks.manage')} branchName={branchName} />;
}

function Workspace({ scope, own, team, manage, branchName }: { scope: readonly unknown[]; own: boolean; team: boolean; manage: boolean; branchName: string }) {
  const cache = useQueryClient();
  const [view, setView] = useState<'own' | 'team'>(own ? 'own' : 'team');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState(''), [page, setPage] = useState(1), [status, setStatus] = useState(''), [priority, setPriority] = useState(''), [attention, setAttention] = useState(''), [sort, setSort] = useState('due'), [assignee, setAssignee] = useState(''), [assigneeName, setAssigneeName] = useState(''), [showAssignee, setShowAssignee] = useState(false);
  const [detail, setDetail] = useState<string | null>(null), [editor, setEditor] = useState<TaskEditor | null>(null), [notice, setNotice] = useState('');
  const prefix = JSON.stringify(scope);
  useEffect(() => () => { const key = JSON.parse(prefix) as unknown[]; void cache.cancelQueries({ queryKey: key }); cache.removeQueries({ queryKey: key }); }, [cache, prefix]);
  const params = { scope: view, search, page, limit: 20, sort, status: status || undefined, priority: priority || undefined, attention: attention || undefined, assignee: view === 'team' && assignee ? assignee : undefined };
  const list = useQuery({ queryKey: [...scope, 'list', params], retry: false, gcTime: 0, queryFn: ({ signal }) => getTaskData<TaskPage>('/tasks', params, signal) });
  const selected = useQuery({ queryKey: [...scope, 'detail', detail], enabled: Boolean(detail), retry: false, gcTime: 0, queryFn: ({ signal }) => getTaskData<TaskDetail>(`/tasks/${detail}`, undefined, signal) });
  const [historyPage, setHistoryPage] = useState(1);
  const history = useQuery({ queryKey: [...scope, 'history', detail, historyPage], enabled: Boolean(detail && selected.data && !selected.isError && !editor), retry: false, gcTime: 0, queryFn: ({ signal }) => getTaskData<Page<TaskEvent>>(`/tasks/${detail}/history`, { page: historyPage, limit: 20 }, signal) });
  const open = (id: string) => { setDetail(id); setHistoryPage(1); setNotice(''); };
  const reset = () => { setSearch(''); setStatus(''); setPriority(''); setAttention(''); setAssignee(''); setAssigneeName(''); setSort('due'); setPage(1); };
  const changeView = (next: 'own' | 'team') => { setView(next); reset(); setDetail(null); };
  const finished = (id: string) => { setEditor(null); setDetail(id); setHistoryPage(1); setNotice('Task command saved. Current server facts are being refreshed.'); void cache.invalidateQueries({ queryKey: scope }); };
  const closeEditor = () => { setEditor(null); void cache.invalidateQueries({ queryKey: scope }); };
  const filtering = Boolean(search || status || priority || attention || assignee);
  const workView = attention || (status === 'completed' ? 'completed' : !status ? 'all' : '');
  const chooseWork = (next: string) => { setStatus(next === 'completed' ? 'completed' : ''); setAttention(['today', 'overdue', 'upcoming'].includes(next) ? next : ''); setPage(1); };
  const removeAssignee = () => { setAssignee(''); setAssigneeName(''); setPage(1); };
  const identity = (task: Task) => <div className="task-identity"><button className="record-open task-title" onClick={() => open(task.id)} aria-label={`View ${task.title}`}>{task.title}</button>{task.description && <p className="task-preview">{task.description}</p>}</div>;
  const columns: Column<Task>[] = [
    { header: 'Task', accessor: 'title', cell: ({ row }) => identity(row) },
    { header: 'Status & priority', accessor: 'status', cell: ({ row }) => badges(row) },
    { header: 'Deadline', accessor: 'dueAt', cell: ({ row }) => deadline(row, list.data?.timezone ?? 'UTC') },
    { header: 'Assigned to', accessor: 'assigneeName', cell: ({ row }) => <span className="task-assignee"><UserRound size={16} aria-hidden="true" /><span>{row.assigneeName}{(!row.assigneeBranchAssigned || row.assigneeStatus !== 'active') && <small>Assignment needs review</small>}</span></span> },
  ];
  const task = selected.isError ? undefined : selected.data;
  return <AppPage className="tasks-page"><PageHeader title="Tasks" eyebrow="Team & workforce" description="Clear ownership. Focused work. One branch at a time." actions={manage && <button className="action-link" disabled={!list.data || list.isError} onClick={() => { setDetail(null); setEditor({ kind: 'create', timezone: list.data!.timezone }); }}><Plus size={18} aria-hidden="true" />Create task</button>} />
    <div className="task-context"><ClipboardList size={16} aria-hidden="true" /><span>{branchName}</span>{list.data && !list.isError && <><span>· {list.data.timezone}</span><span>· {list.data.businessDate}</span></>}</div>
    <div className="task-views" role="group" aria-label="Task scope">{own && <button className="quiet-button" aria-pressed={view === 'own'} onClick={() => changeView('own')}>My Tasks</button>}{team && <button className="quiet-button" aria-pressed={view === 'team'} onClick={() => changeView('team')}>Team Tasks</button>}</div>
    {notice && <p role="status">{notice}</p>}
    <section className="panel page-stack task-search-panel" aria-label="Task search and filters"><div className="task-toolbar"><div><SearchField label="Search task titles" value={search} maxLength={200} placeholder="Find a task by title…" onChange={e => { setSearch(e.target.value); setPage(1); }} /></div>{(filtering || sort !== 'due') && <button className="quiet-button" onClick={reset}>Reset filters</button>}</div>
      <nav className="task-work-views" aria-label="Task work views">{workViews.map(([key, label]) => <button key={key} className="quiet-button" aria-pressed={workView === key} onClick={() => chooseWork(key)}>{label}</button>)}</nav>
      <FilterPanel open={filtersOpen} onToggle={() => setFiltersOpen(value => !value)} count={[status, priority, attention, assignee].filter(Boolean).length} label="Task filters"><div className="task-filters"><label className="field">Status<select value={status} onChange={e => { setStatus(e.target.value); setAttention(''); setPage(1); }}><option value="">All statuses</option>{Object.entries(statusLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
        <label className="field">Priority<select value={priority} onChange={e => { setPriority(e.target.value); setPage(1); }}><option value="">All priorities</option>{Object.entries(priorityLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></label>
        <label className="field">Deadline view<select value={attention} onChange={e => { setAttention(e.target.value); setStatus(''); setPage(1); }}><option value="">All deadlines</option><option value="today">Due today · open</option><option value="overdue">Overdue · open</option><option value="upcoming">Upcoming · open</option></select></label>
        <label className="field">Order<select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}><option value="due">Deadline first</option><option value="recent">Recently created</option></select></label>
      </div>
      {view === 'team' && manage && <div><button className="quiet-button" aria-expanded={showAssignee} onClick={() => setShowAssignee(v => !v)}>{assignee ? `Assigned to ${assigneeName}` : 'Filter by eligible assignee'}</button>{assignee && <button className="quiet-button" onClick={removeAssignee}>Clear assignee</button>}{showAssignee && <AssigneePicker value={assignee} name={assigneeName} scope={scope} onChange={(id, name) => { setAssignee(id); setAssigneeName(name); setPage(1); }} />}</div>}
      </FilterPanel>
      {attention && <p className="muted">Deadline views include only open work. Today and Overdue can overlap; these are not additive counts.</p>}
      {(filtering || sort !== 'due') && <div className="task-filter-chips" aria-label="Active task filters">
        {search && <FilterChip label="Task search" onRemove={() => { setSearch(''); setPage(1); }} />}
        {status && <FilterChip label={`Status: ${statusLabels[status as Task['status']]}`} onRemove={() => { setStatus(''); setPage(1); }} />}
        {priority && <FilterChip label={`Priority: ${priorityLabels[priority as Task['priority']]}`} onRemove={() => { setPriority(''); setPage(1); }} />}
        {attention && <FilterChip label={`Deadline: ${attentionLabels[attention]}`} onRemove={() => { setAttention(''); setPage(1); }} />}
        {assignee && <FilterChip label={`Assignee: ${assigneeName}`} onRemove={removeAssignee} />}
        {sort !== 'due' && <FilterChip label="Recently created" onRemove={() => { setSort('due'); setPage(1); }} />}
      </div>}
      <span className="sr-only" role="status">{list.isFetching ? 'Updating tasks…' : list.isError ? 'Task results unavailable.' : `${list.data?.total ?? 0} tasks in this server-filtered view. Page ${page}.`}</span>
    </section>
    <AdvancedTable mode="server" className="task-directory" title={view === 'own' ? 'My Tasks' : 'Team Tasks'} description="Up to 20 tasks per page. Search, filters and ordering apply on the server." data={list.isError ? [] : list.data?.data ?? []} rowKey={row => row.id} columns={columns}
      loading={list.isPending} error={list.isError ? taskError(list.error) : null} onRetry={() => void list.refetch()}
      emptyState={<EmptyState title={filtering ? 'No matching tasks' : view === 'own' ? 'No tasks assigned to you' : 'No team tasks yet'} description={filtering ? 'Try a different search or reset filters. Records are not changed.' : 'Assigned work will appear here when an authorized manager creates it.'} action={filtering ? 'Reset filters' : undefined} onAction={reset} />}
      mobileCard={row => <article className="panel task-card" data-priority={row.priority}>{badges(row)}{identity(row)}<div className="task-card-facts">{deadline(row, list.data?.timezone ?? 'UTC')}<p className="task-assignee"><UserRound size={16} aria-hidden="true" /><span>{row.assigneeName}{(!row.assigneeBranchAssigned || row.assigneeStatus !== 'active') && <small>Assignment needs review</small>}</span></p></div><div className="task-card-footer"><span className="muted">{row.status === 'completed' ? 'Work completed' : row.status === 'cancelled' ? 'Retained record' : 'Review and take action'}</span><button className="quiet-button" onClick={() => open(row.id)} aria-label={`Open task ${row.title}`}>View task</button></div></article>}
      server={{ search, page, pageSize: 20, total: list.data?.total ?? 0, totalPages: Math.min(200, Math.max(1, Math.ceil((list.data?.total ?? 0) / 20))), onPage: setPage }} />
    <AdvancedModal isOpen={Boolean(detail && !editor)} onClose={() => setDetail(null)} title="Task details" presentation="drawer" size="xl" className="task-dialog">
      {selected.isPending ? <Skeleton label="Loading current task…" /> : selected.isError ? <ErrorState title="Task unavailable" message={taskError(selected.error)} retry={() => void selected.refetch()} /> : task && <div className="page-stack">
        <div className="task-detail-identity"><p className="eyebrow">{branchName} · Version {task.version}</p><h3 className="task-title">{task.title}</h3>{badges(task)}</div>
        {selected.isFetching && <p role="status">Refreshing current Task version… Actions will resume when current facts are loaded.</p>}
        <div className="task-actions" role="group" aria-label="Available task actions">{progressTargets(task).map(status => <button key={status} disabled={selected.isFetching} className={status === 'completed' ? 'action-link' : 'quiet-button'} onClick={() => setEditor({ kind: 'status', task, status })}>{status === 'completed' && <CheckCheck size={16} aria-hidden="true" />}Mark {statusLabels[status].toLowerCase()}</button>)}{task.allowedActions.includes('edit') && <button className="quiet-button" disabled={selected.isFetching} onClick={() => setEditor({ kind: 'edit', task })}>Edit or reassign</button>}{task.allowedActions.includes('cancel') && <button className="quiet-button" disabled={selected.isFetching} onClick={() => setEditor({ kind: 'cancel', task })}>Cancel task</button>}{task.allowedActions.includes('reopen') && <button className="quiet-button" disabled={selected.isFetching} onClick={() => setEditor({ kind: 'reopen', task })}>Reopen task</button>}</div>
        {!task.allowedActions.length && <p className="task-read-only">Read-only record. No changes are currently permitted.</p>}
        <DetailSection title="Task information"><dl className="task-meta"><div><dt>Assigned to</dt><dd>{task.assigneeName}</dd></div><div><dt>Branch</dt><dd>{branchName}</dd></div><div><dt>Deadline · {task.timezone}</dt><dd>{taskTime(task.dueAt, task.timezone)}</dd></div>{task.completedAt && <div><dt>Completed · {task.timezone}</dt><dd>{taskTime(task.completedAt, task.timezone)}</dd></div>}{task.cancelledAt && <div><dt>Cancelled · {task.timezone}</dt><dd>{taskTime(task.cancelledAt, task.timezone)}</dd></div>}</dl>
          {(!task.assigneeBranchAssigned || task.assigneeStatus !== 'active') && <p className="task-warning">Recorded assignee is inactive or no longer assigned to this branch. History is retained. An authorized manager can reassign or cancel open work.</p>}
        </DetailSection>
        <DetailSection title="Description"><p className="task-description">{task.description || 'No description added.'}</p></DetailSection>
        <DetailSection title="Record details"><dl className="task-meta"><div><dt>Created · {task.timezone}</dt><dd>{taskTime(task.createdAt, task.timezone)}</dd></div><div><dt>Updated · {task.timezone}</dt><dd>{taskTime(task.updatedAt, task.timezone)}</dd></div></dl></DetailSection>
        <DetailSection title="Task history">{history.isPending ? <Skeleton label="Loading task history…" /> : history.isError ? <ErrorState title="History unavailable" message={taskError(history.error)} retry={() => void history.refetch()} /> : <><ol className="task-history">{history.data?.data.map(event => <li key={event.id}><h4>{eventLabels[event.action] ?? 'Task event'} · Version {event.resulting_version}</h4><p className="muted">{event.actor} · {taskTime(event.occurred_at, task.timezone)}</p><p>{event.old_status ? `${statusLabels[event.old_status]} → ` : ''}{statusLabels[event.new_status]}</p>{event.changed_fields.length > 0 && <p className="muted">Changed: {event.changed_fields.join(', ')}</p>}{event.reason && <p className="task-description">Reason: {event.reason}</p>}{event.old_due_at !== event.new_due_at && <p>Deadline: {taskTime(event.old_due_at, task.timezone)} → {taskTime(event.new_due_at, task.timezone)}</p>}</li>)}</ol>{!history.data?.data.length && <p>No events returned for this page.</p>}<Pagination page={historyPage} totalPages={Math.min(200, Math.ceil((history.data?.total ?? 0) / 20))} onPage={setHistoryPage} busy={history.isFetching} /></>}</DetailSection>
      </div>}
    </AdvancedModal>
    {editor && <TaskForm key={JSON.stringify(editor)} editor={editor} scope={scope} branchName={branchName} done={finished} close={closeEditor} />}
  </AppPage>;
}
