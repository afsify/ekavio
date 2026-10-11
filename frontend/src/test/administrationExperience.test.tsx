import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BoundedDirectory } from '../components/ui/BoundedDirectory';
import { CommercialReview } from '../components/commercial/CommercialReview';
import { ScheduleForm } from '../pages/HR/forms';
import NotificationPreferences from '../pages/Notifications/NotificationPreferences';
import NotificationsPage from '../pages/Notifications/NotificationsPage';
import { MemoryRouter } from 'react-router-dom';
import { client } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import type { Context, Shift } from '../pages/HR/contracts';
import type { EffectiveEntitlements } from '../commercial/catalogue';

const provider = (children: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{children}</QueryClientProvider>);
const rows = [{ id: 'z', name: 'Zulu' }, { id: 'a', name: 'Alpha' }];
it('personal bulk-read review uses unfiltered unread facts when the selected category is empty', async () => {
  authority();
  vi.spyOn(client, 'get').mockImplementation(async (_url, config) => ({ data: { data: {
    rows: [], unread: (config?.params as Record<string, string> | undefined)?.category ? 0 : 3, total: 0, page: 1, limit: 25,
  } } }));
  const post = vi.spyOn(client, 'post');
  provider(<MemoryRouter><NotificationsPage /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('3 unread · Updates for your workspace access')).toBeTruthy());
  fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'crm' } });
  await screen.findByText("You're all caught up.");
  await waitFor(() => expect((screen.getByRole('button', { name: 'Mark all read' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
  expect(screen.getByText('3 unread at review time. Current filters do not limit this action.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  expect(screen.getByText(/including other pages and categories/)).toBeTruthy();
  expect(post).not.toHaveBeenCalled();
});
it('bounded directory keeps canonical order without invented totals, search, sort or pagination', () => {
  render(<BoundedDirectory title="Branches" description="Server order, bounded to 200" rows={rows} columns={[{ header: 'Name', accessor: 'name', sortable: true }]} card={r => <p>{r.name}</p>} empty="No branches" />);
  expect(screen.getAllByRole('cell').map(c => c.textContent)).toEqual(['Zulu', 'Alpha']);
  expect(screen.queryByRole('searchbox')).toBeNull(); expect(screen.queryByRole('button', { name: 'Name' })).toBeNull();
  expect(screen.queryByRole('navigation', { name: 'Record pagination' })).toBeNull(); expect(screen.queryByText('2 records')).toBeNull();
});
it('bounded directory distinguishes a server failure from an empty authoritative response', () => {
  const retry = vi.fn();
  render(<BoundedDirectory title="Branches" description="Bounded" rows={[]} columns={[]} card={() => null} error="Source unavailable" retry={retry} empty="No branches" />);
  expect(screen.queryByText('No branches')).toBeNull(); fireEvent.click(screen.getByRole('button', { name: 'Retry' })); expect(retry).toHaveBeenCalledOnce();
});
it('commercial confirmation requires review and cannot close or submit twice while pending', () => {
  const submit = vi.fn(), close = vi.fn(), command = { title: 'Finalize agreement', facts: <p>Exact reviewed terms</p>, submit };
  const view = render(<CommercialReview command={command} busy={false} error={null} close={close} />);
  expect(submit).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  fireEvent.click(screen.getByRole('button', { name: command.title })); expect(submit).toHaveBeenCalledOnce();
  view.rerender(<CommercialReview command={command} busy error={null} close={close} />);
  expect((screen.getByRole('button', { name: 'Saving…' }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.keyDown(document, { key: 'Escape' }); expect(close).not.toHaveBeenCalled();
});
it('a commercial command without idempotency cannot retry an uncertain response', () => {
  const submit = vi.fn(); render(<CommercialReview command={{ title: 'Finalize agreement', facts: null, submit }} busy={false} error={new Error('Response lost')} close={vi.fn()} />);
  expect((screen.getByRole('button', { name: 'Review' }) as HTMLButtonElement).disabled).toBe(true); expect(submit).not.toHaveBeenCalled();
});
it('a repeat-safe commercial command retains its reviewed callback after response loss', () => {
  const submit = vi.fn(); render(<CommercialReview command={{ title: 'Retry exact payment', facts: <p>Original key and exact amount</p>, submit, retryIdentical: true }} busy={false} error={new Error('Response lost')} close={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Review' })); fireEvent.click(screen.getByRole('button', { name: 'Retry exact payment' })); expect(submit).toHaveBeenCalledOnce();
});
const state: EffectiveEntitlements = { organizationId: 'qa-org', subscription: null, modules: [], limits: { staff: null, branches: null, storageMb: null, documents: null, automationRuns: null } };
function authority() { useAppStore.setState({ user: { id: 'qa-user', tenantId: 'qa-org', role: 'admin', permissions: ['billing.read'] }, activeTenantId: 'qa-org', activeBranchId: 'qa-branch', entitlements: null, isPlatformOperator: false }); }
for (const change of ['branch', 'role', 'operator'] as const) it(`late Billing response cannot restore old authority after a ${change} change`, async () => {
  authority(); let resolve!: (value: unknown) => void;
  const get = vi.spyOn(client, 'get').mockImplementation(() => new Promise(r => { resolve = r; }));
  const pending = useAppStore.getState().refreshEntitlements(); await waitFor(() => expect(get).toHaveBeenCalled());
  if (change === 'branch') useAppStore.setState({ activeBranchId: 'qa-next-branch' });
  if (change === 'role') useAppStore.setState({ user: { ...useAppStore.getState().user!, permissions: [] } });
  if (change === 'operator') useAppStore.setState({ isPlatformOperator: true });
  resolve({ data: { data: state } }); await expect(pending).rejects.toThrow('Commercial workspace changed'); expect(useAppStore.getState().entitlements).toBeNull();
});
it('aborted Billing refresh leaves commercial state unchanged', async () => {
  authority(); const signal = AbortSignal.abort(); vi.spyOn(client, 'get').mockResolvedValue({ data: { data: state } });
  await expect(useAppStore.getState().refreshEntitlements(signal)).rejects.toThrow('Commercial workspace changed'); expect(useAppStore.getState().entitlements).toBeNull();
});
it('foreign organization Billing response is rejected without updating entitlements', async () => {
  authority(); vi.spyOn(client, 'get').mockResolvedValue({ data: { data: { ...state, organizationId: 'foreign-org' } } });
  await expect(useAppStore.getState().refreshEntitlements()).rejects.toThrow('organization mismatch'); expect(useAppStore.getState().entitlements).toBeNull();
});
it('draft shift edits use the reviewed version and block replay after an uncertain response', async () => {
  const shift: Shift = { id: 'qa-shift', membership_id: 'qa-member', employee: 'QA employee', branch_name: 'Main', template_id: 'qa-template', template_name_snapshot: 'QA shift', business_date: '2026-12-14', timezone_snapshot: 'Asia/Kolkata', starts_at: '2026-12-14T03:30:00Z', ends_at: '2026-12-14T11:30:00Z', break_minutes: 30, status: 'draft', version: 3 };
  const context: Context = { types: [], templates: [{ id: 'qa-template', name: 'QA shift', start_time: '09:00', end_time: '17:00', overnight: false, break_minutes: 30, status: 'active', version: 1 }], calendar: null, days: [], timezone: 'Asia/Kolkata', businessDate: '2026-12-14', permissions: [] };
  const patch = vi.spyOn(client, 'patch').mockRejectedValue(new Error('Response lost')); provider(<ScheduleForm context={context} staff={[]} shift={shift} done={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Review' })); fireEvent.click(screen.getByRole('button', { name: 'Save draft shift' }));
  await screen.findByRole('alert'); expect(patch).toHaveBeenCalledWith('/hr/shifts/qa-shift', { templateId: 'qa-template', day: '2026-12-14', expectedVersion: 3 });
  expect((screen.getByRole('button', { name: 'Retry unchanged command' }) as HTMLButtonElement).disabled).toBe(true); expect(patch).toHaveBeenCalledOnce();
});
it('failed preference save does not keep a misleading earlier success message', async () => {
  authority(); vi.spyOn(client, 'get').mockResolvedValue({ data: { data: { organizationChanges: true, crmAssignments: true, hrUpdates: true } } });
  vi.spyOn(client, 'put').mockResolvedValueOnce({ data: {} }).mockRejectedValueOnce(new Error('Response lost'));
  provider(<NotificationPreferences />); fireEvent.click(await screen.findByRole('checkbox', { name: 'Organization changes' }));
  await screen.findByText('Preference saved by the server.'); fireEvent.click(screen.getByRole('checkbox', { name: /CRM assignments/ }));
  await screen.findByRole('alert'); expect(screen.queryByText('Preference saved by the server.')).toBeNull();
});
