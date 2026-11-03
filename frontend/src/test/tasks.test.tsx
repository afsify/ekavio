import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { client } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { visibleDestinations } from '../components/layout/navigation';
import TasksPage from '../pages/Tasks/TasksPage';
import { AdminLayout } from '../components/layout/AdminLayout';
import { TaskForm } from '../pages/Tasks/forms';
import { blankDraft, draftFor, editPatch, localDue, progressTargets, taskError, type TaskDetail } from '../pages/Tasks/contracts';

vi.mock('../api/client', () => ({ client: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const entitled = { modules: [{ key: 'tasks', enabled: true }] } as never;
const manager = ['tasks.read_own', 'tasks.manage_own', 'tasks.read', 'tasks.manage'];
const task: TaskDetail = { id: 'task', organizationId: 'org', branchId: 'branch', creatorMembershipId: 'owner', assignedMembershipId: 'staff', assigneeName: 'QA Staff', assigneeStatus: 'active', assigneeBranchAssigned: true, title: 'QA task', description: 'Retained description', priority: 'high', status: 'todo', version: 3, dueAt: '2026-10-20T05:00:00.000Z', dueTimezone: 'Asia/Kolkata', createdAt: '2026-10-16T00:00:00Z', updatedAt: '2026-10-16T00:00:00Z', completedAt: null, cancelledAt: null, overdue: false, allowedActions: ['progress', 'edit', 'cancel'], timezone: 'Asia/Kolkata', serverNow: '2026-10-16T00:00:00Z' };
const failure = (status: number) => ({ isAxiosError: true, response: { status, data: { message: 'QA validation failed' } } });
function setup(element = <TasksPage />, permissions = manager, entitlements = entitled) {
  useAppStore.setState({ user: { id: 'user', membershipId: 'member', permissions } as never, activeTenantId: 'org', activeBranchId: 'branch', entitlements });
  vi.mocked(client.get).mockImplementation(async path => ({ data: { data: path === '/organization/context' ? { permissions, role: 'admin' } : path === '/notifications' ? { rows: [], total: 0, unread: 0 } : String(path).endsWith('/assignees') ? { data: [{ id: 'staff', name: 'QA Staff' }], total: 1 } : String(path).endsWith('/history') ? { data: [{ id: 'event', action: 'task.created', actor: 'QA Owner', occurred_at: task.createdAt, resulting_version: 1, old_status: null, new_status: 'todo', changed_fields: [] }], total: 1 } : path === '/tasks/task' ? task : { data: [task], total: 21, page: 1, limit: 20, timezone: 'Asia/Kolkata', businessDate: '2026-10-16' } } }) as never);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={cache}><MemoryRouter>{element}</MemoryRouter></QueryClientProvider>); return cache;
}
const scope = ['tasks', 'user', 'org', 'branch'];
function form(kind: 'create' | 'edit' = 'create') {
  const done = vi.fn(), close = vi.fn();
  setup(<TaskForm editor={kind === 'create' ? { kind, timezone: 'Asia/Kolkata' } : { kind, task }} scope={scope} branchName="Main" done={done} close={close} />);
  return { done, close };
}
async function fillCreate() {
  fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'QA new task' } });
  await screen.findByRole('option', { name: 'QA Staff' });
  fireEvent.change(screen.getByLabelText('Assign to (required)'), { target: { value: 'staff' } });
}
function review() { fireEvent.click(screen.getByRole('button', { name: 'Review task' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm save' })); }
const requestParams = (config: { params?: unknown } | undefined) => config?.params as Record<string, unknown> | undefined;
async function directoryOpen() { return within(await screen.findByRole('table')).getByRole('button', { name: 'View QA task' }); }

it('navigation requires entitlement and one read permission, never management alone', () => {
  for (const grant of ['tasks.read_own', 'tasks.read']) expect(visibleDestinations([grant], entitled, false).some(d => d.path === '/tasks')).toBe(true);
  for (const grants of [[], ['tasks.manage'], ['hr_plus.read']]) expect(visibleDestinations(grants, entitled, true).some(d => d.path === '/tasks')).toBe(false);
  expect(visibleDestinations(manager, null, false).some(d => d.path === '/tasks')).toBe(false);
});
it.each(['light', 'dark', 'system'] as const)('Task navigation does not depend on theme %s or replace HR My Work', mode => {
  useAppStore.setState({ theme: { mode, primaryColor: '#4F46E5' } });
  const items = visibleDestinations(manager, { modules: [{ key: 'tasks', enabled: true }, { key: 'hr_plus', enabled: true }] } as never, false);
  expect(items.find(d => d.path === '/tasks')?.name).toBe('Tasks'); expect(items.find(d => d.path === '/hr')?.name).toBe('HR Plus / My Work');
});
it('missing entitlement denies direct page access without Task calls', () => { setup(<TasksPage />, manager, null as never); expect(screen.getByRole('heading', { name: 'Tasks is not enabled' })).toBeTruthy(); expect(client.get).not.toHaveBeenCalled(); });
it('missing read permission denies before fetching', () => { setup(<TasksPage />, ['tasks.manage']); expect(screen.getByRole('heading', { name: 'Task permission required' })).toBeTruthy(); expect(client.get).not.toHaveBeenCalled(); });
it('staff stays own-only and does not request roster/team', async () => {
  setup(<TasksPage />, ['tasks.read_own', 'tasks.manage_own']); await directoryOpen();
  expect(screen.queryByRole('button', { name: 'Team Tasks' })).toBeNull(); expect(screen.queryByRole('button', { name: 'Create task' })).toBeNull();
  expect(vi.mocked(client.get).mock.calls.every(([p, config]) => p === '/tasks' && requestParams(config)?.scope === 'own')).toBe(true);
});
it('search, supported filters and page changes remain server parameters; reset restores own scope', async () => {
  setup(); await directoryOpen();
  fireEvent.click(screen.getByRole('button', { name: 'Team Tasks' }));
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  fireEvent.change(screen.getByLabelText('Search task titles'), { target: { value: 'Needle' } });
  fireEvent.change(screen.getByLabelText('Priority', { exact: true }), { target: { value: 'high' } });
  await waitFor(() => expect(vi.mocked(client.get).mock.calls.some(([, config]) => requestParams(config)?.search === 'Needle' && requestParams(config)?.scope === 'team' && requestParams(config)?.priority === 'high')).toBe(true));
  await waitFor(() => expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(requestParams(vi.mocked(client.get).mock.calls.at(-1)?.[1])?.page).toBe(2));
  fireEvent.click(screen.getByRole('button', { name: 'Reset filters' }));
  await waitFor(() => expect(requestParams(vi.mocked(client.get).mock.calls.at(-1)?.[1])?.search).toBe(''));
});
it('detail reads actual history and record actions instead of inferring from role', async () => {
  setup(); fireEvent.click(await directoryOpen());
  await screen.findByRole('heading', { name: 'Task created · Version 1' }); expect(within(screen.getByRole('dialog')).getByText('Retained description')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Edit or reassign' })).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Reopen task' })).toBeNull();
});
it('create requires title and eligible assignee and does not submit at review', async () => {
  form(); expect((screen.getByRole('button', { name: 'Review task' }) as HTMLButtonElement).disabled).toBe(true);
  await fillCreate(); fireEvent.click(screen.getByRole('button', { name: 'Review task' })); expect(client.post).not.toHaveBeenCalled();
  expect(screen.getByRole('region', { name: 'Review task command' })).toBeTruthy();
});
it('edit sends only changed title and expected version, with no create defaults', async () => {
  vi.mocked(client.patch).mockResolvedValue({ data: { data: { id: task.id } } }); const { done } = form('edit');
  fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Changed title' } }); review();
  await waitFor(() => expect(done).toHaveBeenCalledWith('task'));
  const body = vi.mocked(client.patch).mock.calls[0][1]; expect(body).toEqual({ title: 'Changed title', expectedVersion: 3, idempotencyKey: expect.any(String) });
});
it('explicit deadline clear does not clear description, priority or assignee', () => {
  const initial = draftFor(task); expect(editPatch({ ...initial, localDue: '' }, initial)).toEqual({ localDue: null });
  expect(editPatch({ ...initial, description: '' }, initial)).toEqual({ description: '' }); expect(editPatch(initial, initial)).toEqual({});
});
it('branch-local input is independent of device timezone and retains seconds', () => { expect(localDue(task.dueAt, 'Asia/Kolkata')).toBe('2026-10-20T10:30:00'); expect(localDue(null, 'UTC')).toBe(''); });
it('transition choices enforce canonical open matrix and returned permission', () => {
  expect(progressTargets(task)).toEqual(['in_progress', 'completed']); expect(progressTargets({ ...task, status: 'in_progress' })).toEqual(['todo', 'completed']);
  for (const status of ['completed', 'cancelled'] as const) expect(progressTargets({ ...task, status })).toEqual([]);
  expect(progressTargets({ ...task, allowedActions: [] })).toEqual([]);
});
it('lost response freezes draft and explicitly retries identical command/key only', async () => {
  vi.mocked(client.post).mockRejectedValueOnce(new Error('Network lost')).mockResolvedValueOnce({ data: { data: { id: 'recovered' } } });
  const { done } = form(); await fillCreate(); review();
  await screen.findByText(/The server may have saved this command/); expect(client.post).toHaveBeenCalledTimes(1);
  expect((screen.getByLabelText('Task title') as HTMLInputElement).disabled).toBe(false); // disabled ancestor fieldset is semantic
  expect(screen.getByLabelText('Task title').closest('fieldset')?.disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Retry identical command' })); await waitFor(() => expect(done).toHaveBeenCalledWith('recovered'));
  expect(vi.mocked(client.post).mock.calls[1]).toEqual(vi.mocked(client.post).mock.calls[0]);
});
it('400 retains input and allows explicit correction; 409 freezes until reload', async () => {
  vi.mocked(client.patch).mockRejectedValue(failure(409)); form('edit'); fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Retained draft' } }); review();
  await screen.findByRole('alert'); expect((screen.getByLabelText('Task title') as HTMLInputElement).value).toBe('Retained draft');
  expect(screen.queryByRole('button', { name: 'Retry identical command' })).toBeNull(); expect(screen.queryByRole('button', { name: 'Confirm save' })).toBeNull();
});
it('ordinary validation error does not discard draft', async () => {
  vi.mocked(client.post).mockRejectedValue(failure(400)); form(); await fillCreate(); review(); await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Back to editing' })); expect((screen.getByLabelText('Task title') as HTMLInputElement).value).toBe('QA new task');
});
it('dirty close asks before discarding and keep editing retains input', () => {
  const { close } = form(); fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'Draft stays' } }); fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.getByRole('heading', { name: 'Discard task draft?' })).toBeTruthy(); fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect((screen.getByLabelText('Task title') as HTMLInputElement).value).toBe('Draft stays'); expect(close).not.toHaveBeenCalled();
});
it('forced scope replacement removes record detail and private draft', async () => {
  const cache = setup(); fireEvent.click(await directoryOpen()); await screen.findByRole('heading', { name: 'Task information' });
  await act(async () => { useAppStore.setState({ activeBranchId: 'another-branch' }); });
  expect(screen.queryByRole('heading', { name: 'Task information' })).toBeNull();
  expect(cache.getQueryCache().getAll().every(q => !q.queryKey.includes('branch'))).toBe(true);
});
it.each(['organization', 'account'] as const)('%s replacement clears prior Task details and query scope', async replacement => {
  const cache = setup(); fireEvent.click(await directoryOpen()); await screen.findByRole('heading', { name: 'Task information' });
  await act(async () => { useAppStore.setState(state => replacement === 'organization' ? { activeTenantId: 'another-org' } : { user: { ...state.user!, id: 'another-user' } }); });
  expect(screen.queryByRole('dialog')).toBeNull();
  const oldIdentity = replacement === 'organization' ? 'org' : 'user';
  expect(cache.getQueryCache().getAll().every(q => !q.queryKey.includes(oldIdentity))).toBe(true);
});
it.each([401, 403, 404, 409])('HTTP %s has an actionable safe message', code => { expect(taskError(failure(code))).not.toBe('QA validation failed'); });
it('empty creation draft has no invented assignee or deadline', () => { expect(blankDraft.assignedMembershipId).toBe(''); expect(blankDraft.localDue).toBe(''); });
it('work shortcuts use canonical server filters and retain unrelated criteria', async () => {
  setup(); await directoryOpen();
  fireEvent.change(screen.getByLabelText('Search task titles'), { target: { value: 'Needle' } });
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  fireEvent.change(screen.getByLabelText('Priority', { exact: true }), { target: { value: 'high' } });
  const nav = within(screen.getByRole('navigation', { name: 'Task work views' }));
  for (const [label, attention, status] of [['Due today', 'today', undefined], ['Overdue', 'overdue', undefined], ['Upcoming', 'upcoming', undefined], ['Completed', undefined, 'completed'], ['All', undefined, undefined]] as const) {
    fireEvent.click(nav.getByRole('button', { name: label }));
    expect(nav.getByRole('button', { name: label }).getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => expect(requestParams(vi.mocked(client.get).mock.calls.at(-1)?.[1])).toMatchObject({ search: 'Needle', priority: 'high', attention, status, page: 1, limit: 20 }));
  }
  fireEvent.click(screen.getByRole('button', { name: 'Remove Priority: High filter' }));
  await waitFor(() => expect(requestParams(vi.mocked(client.get).mock.calls.at(-1)?.[1])).toMatchObject({ search: 'Needle', priority: undefined }));
  expect(screen.getByRole('button', { name: 'Remove Task search filter' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  expect(screen.getByRole('button', { name: 'Remove Task search filter' })).toBeTruthy();
});
it('detail actions precede long descriptions and never invent creator identities', async () => {
  setup(); fireEvent.click(await directoryOpen());
  const actions = await screen.findByRole('group', { name: 'Available task actions' });
  const description = within(screen.getByRole('dialog')).getByText('Retained description');
  expect(actions.compareDocumentPosition(description) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(actions).getByRole('button', { name: 'Mark completed' })).toBeTruthy();
  expect(screen.queryByText('Created by QA Staff')).toBeNull();
});
it('cached detail actions wait for the fresh version before another command', async () => {
  const cache = setup(); fireEvent.click(await directoryOpen()); await screen.findByRole('heading', { name: 'Task created · Version 1' });
  const pending: { resolve?: (value: unknown) => void } = {};
  vi.mocked(client.get).mockReturnValueOnce(new Promise(resolve => { pending.resolve = resolve; }) as never);
  await act(async () => { void cache.invalidateQueries({ predicate: query => query.queryKey.includes('detail') }); });
  await waitFor(() => { for (const label of ['Mark in progress', 'Mark completed', 'Edit or reassign', 'Cancel task']) expect((screen.getByRole('button', { name: label }) as HTMLButtonElement).disabled).toBe(true); });
  expect(screen.getByText(/Refreshing current Task version/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel task' })); expect(screen.queryByLabelText('Reason (required)')).toBeNull();
  await act(async () => { pending.resolve?.({ data: { data: { ...task, version: 4 } } }); });
  await waitFor(() => expect((screen.getByRole('button', { name: 'Cancel task' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel task' })); expect(screen.getByText(/Current record version 4/)).toBeTruthy();
});
it('review uses readable assignment/priority/deadline facts while preserving partial edit payloads', async () => {
  form('edit'); fireEvent.change(screen.getByLabelText('Task title'), { target: { value: 'QA refined title' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review task' }));
  const summary = within(screen.getByRole('region', { name: 'Review task command' }));
  expect(summary.getByText('QA Staff')).toBeTruthy(); expect(summary.getByText('High')).toBeTruthy();
  expect(summary.getByText('2026-10-20 10:30:00')).toBeTruthy(); expect(summary.getByText('Title')).toBeTruthy();
  expect(client.patch).not.toHaveBeenCalled();
});
it('equivalent permission ordering preserves workspace drafts; actual revocation still remounts', async () => {
  setup(<AdminLayout><input aria-label="Probe draft" defaultValue="Initial" /></AdminLayout>);
  await waitFor(() => expect(vi.mocked(client.get).mock.calls.some(([path]) => path === '/organization/context')).toBe(true));
  const input = screen.getByLabelText('Probe draft'); fireEvent.change(input, { target: { value: 'Keep my draft' } });
  await act(async () => { useAppStore.setState(state => ({ user: { ...state.user!, permissions: [...manager].reverse() } })); });
  expect(screen.getByLabelText('Probe draft')).toBe(input); expect((input as HTMLInputElement).value).toBe('Keep my draft');
  await act(async () => { useAppStore.setState(state => ({ user: { ...state.user!, permissions: ['tasks.read_own'] } })); });
  expect(screen.getByLabelText('Probe draft')).not.toBe(input);
});
