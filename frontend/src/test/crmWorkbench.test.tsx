import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { client } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { LeadPipelineBoard } from '../pages/CRM/LeadPipelineBoard';
import CrmPage from '../pages/CRM/CrmPage';
import type { Lead, Stage } from '../pages/CRM/contracts';

vi.mock('../api/client', () => ({ client: { get: vi.fn(), post: vi.fn(), patch: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const stages: Stage[] = ['New', 'Qualified', 'Proposal', 'Decision'].map((name, index) => ({ id: `stage-${index}`, name, description: '', position: index, status: 'active', version: 1 }));
const lead = { id: 'lead-1', name: 'Synthetic enquiry', company: null, status: 'active', stage_name: 'New', pipeline_stage_id: stages[0].id, assignee_name: null } as Lead;
function setup(filters: Record<string, string> = {}, workspace = false) {
  useAppStore.setState({ user: { id: 'qa', role: 'admin', membershipId: 'member', permissions: ['crm.read'] } as never, activeTenantId: 'org', activeBranchId: 'branch', entitlements: { modules: [{ key: 'crm', enabled: true }] } as never });
  vi.mocked(client.get).mockImplementation(async (path, config) => {
    const params = config?.params as { page?: number; limit?: number } | undefined;
    return ({ data: { data:
    path === '/crm/stages' ? stages : path === '/crm/overview' ? { active: 17, today: 0, overdue: 0, unassigned: 17, timezone: 'Asia/Kolkata', businessDate: '2026-10-24', stages: stages.map(stage => ({ ...stage, leads: 17 })) } :
    path === '/crm/leads' ? { data: [{ ...lead, name: `Synthetic page ${params?.page ?? 1}` }], total: 17, page: params?.page ?? 1, limit: params?.limit ?? 20, timezone: 'Asia/Kolkata' } : path === '/forms/lead/schema' ? { entity: 'lead', version: 0, definitions: [], sections: [], builtins: [] } : []
  } }) as never; });
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  const open = vi.fn();
  render(<QueryClientProvider client={cache}><MemoryRouter>{workspace ? <CrmPage /> : <LeadPipelineBoard stages={stages} filters={filters} open={open} />}</MemoryRouter></QueryClientProvider>);
  return { open, cache };
}
describe('Server-backed CRM stage workbench', () => {
  it('loads at most three stage pages with canonical filters, totals and cancellation', async () => {
    setup({ search: 'synthetic', assignee: 'unassigned', attention: 'overdue', sort: 'oldest', field: 'region', value: 'South', operator: 'eq' });
    await screen.findAllByText('17 matching leads');
    expect(client.get).toHaveBeenCalledTimes(3);
    for (const stage of stages.slice(0, 3)) expect(client.get).toHaveBeenCalledWith('/crm/leads', expect.objectContaining({ params: { stageId: stage.id, page: 1, limit: 5, search: 'synthetic', assignee: 'unassigned', attention: 'overdue', sort: 'oldest', field: 'region', value: 'South', operator: 'eq' }, signal: expect.any(AbortSignal) }));
    expect(screen.queryByRole('region', { name: 'Decision stage' })).toBeNull();
    expect(screen.getAllByText('Page 1 of 4')).toHaveLength(3);
  });
  it('paginates stages independently and opens the actual returned record', async () => {
    const { open } = setup();
    const first = screen.getByRole('region', { name: 'New stage' });
    await within(first).findByText('Page 1 of 4');
    fireEvent.click(within(first).getByRole('button', { name: 'Next' }));
    await within(first).findByText('Page 2 of 4');
    expect(within(screen.getByRole('region', { name: 'Qualified stage' })).getByText('Page 1 of 4')).toBeTruthy();
    fireEvent.click(within(first).getByRole('button', { name: 'Open Lead Synthetic page 2' }));
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ id: lead.id, name: 'Synthetic page 2' }));
  });
  it('stage windows retain independent pages without loading the entire pipeline', async () => {
    setup(); await screen.findAllByText('Page 1 of 4');
    fireEvent.click(within(screen.getByRole('region', { name: 'New stage' })).getByRole('button', { name: 'Next' }));
    await screen.findByText('Page 2 of 4');
    fireEvent.click(screen.getByRole('button', { name: 'Next stages' }));
    await within(screen.getByRole('region', { name: 'Decision stage' })).findByText('17 matching leads');
    expect(screen.queryByRole('region', { name: 'New stage' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Previous stages' }));
    expect(await within(screen.getByRole('region', { name: 'New stage' })).findByText('Page 2 of 4')).toBeTruthy();
  });
  it('a selected stage filter cannot fan out into unrelated stages', async () => {
    setup({ stageId: stages[2].id, status: 'active' });
    await screen.findByText('17 matching leads');
    expect(client.get).toHaveBeenCalledTimes(1);
    expect(client.get).toHaveBeenCalledWith('/crm/leads', expect.objectContaining({ params: { stageId: stages[2].id, status: 'active', page: 1, limit: 5 } }));
  });
  it('errors stay errors and a scoped retry recovers without a write', async () => {
    const { cache } = setup({ stageId: stages[0].id });
    await screen.findByText('17 matching leads');
    vi.mocked(client.get).mockRejectedValueOnce(new Error('Synthetic outage'));
    await act(async () => { await cache.invalidateQueries({ queryKey: ['crm'] }); });
    expect(await screen.findByRole('heading', { name: 'Stage could not be loaded' })).toBeTruthy();
    expect(screen.queryByText('17 matching leads')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    await screen.findByText('17 matching leads');
    expect(client.post).not.toHaveBeenCalled(); expect(client.patch).not.toHaveBeenCalled();
  });
  it('filter changes restart board paging and never put search terms in the URL', async () => {
    setup({}, true); await screen.findByRole('heading', { name: 'Lead directory' });
    fireEvent.click(screen.getByRole('button', { name: 'pipeline' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kanban board' }));
    await screen.findAllByText('Page 1 of 4');
    fireEvent.click(within(screen.getByRole('region', { name: 'New stage' })).getByRole('button', { name: 'Next' }));
    await screen.findByText('Page 2 of 4');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search leads' }), { target: { value: 'private search' } });
    await waitFor(() => expect(client.get).toHaveBeenCalledWith('/crm/leads', expect.objectContaining({ params: expect.objectContaining({ search: 'private search', page: 1, limit: 5 }) })));
    expect(screen.queryByText('Page 2 of 4')).toBeNull();
    expect(window.location.search).not.toContain('private');
  });
  it.each(['activeBranchId', 'activeTenantId'] as const)('scope change %s removes old board and private filters', async key => {
    setup({}, true); await screen.findByRole('heading', { name: 'Lead directory' });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search leads' }), { target: { value: 'private search' } });
    fireEvent.click(screen.getByRole('button', { name: 'pipeline' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kanban board' }));
    await screen.findAllByText('17 matching leads');
    act(() => useAppStore.setState({ [key]: 'new-scope' }));
    expect(screen.queryByRole('region', { name: 'Lead pipeline board' })).toBeNull();
    expect((screen.getByRole('searchbox', { name: 'Search leads' }) as HTMLInputElement).value).toBe('');
  });
  it('membership/role changes also remove the previous workbench state', async () => {
    setup({}, true); await screen.findByRole('heading', { name: 'Lead directory' });
    fireEvent.click(screen.getByRole('button', { name: 'pipeline' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kanban board' }));
    await screen.findAllByText('17 matching leads');
    act(() => useAppStore.setState(state => ({ user: { ...state.user!, role: 'staff', membershipId: 'new-member' } })));
    expect(screen.queryByRole('region', { name: 'Lead pipeline board' })).toBeNull();
  });
  it.each(['permissions', 'entitlements'])('%s replacement discards incompatible view state', async kind => {
    setup({}, true); await screen.findByRole('heading', { name: 'Lead directory' });
    fireEvent.click(screen.getByRole('button', { name: 'pipeline' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kanban board' }));
    await screen.findAllByText('17 matching leads');
    act(() => {
      if (kind === 'permissions') useAppStore.setState(state => ({ user: { ...state.user!, permissions: [] } }));
      else useAppStore.setState({ entitlements: { modules: [] } as never });
    });
    expect(screen.queryByRole('region', { name: 'Lead pipeline board' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create lead' })).toBeNull();
  });
  it('switching branch cancels a pending board page and suppresses its late response', async () => {
    setup({}, true); await screen.findByRole('heading', { name: 'Lead directory' });
    fireEvent.click(screen.getByRole('button', { name: 'pipeline' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kanban board' }));
    await screen.findAllByText('17 matching leads');
    const original = vi.mocked(client.get).getMockImplementation()!;
    let release!: (value: unknown) => void;
    let signal: AbortSignal | undefined;
    const pending = new Promise(resolve => { release = resolve; });
    vi.mocked(client.get).mockImplementation(async (path, config) => {
      const params = config?.params as { page?: number } | undefined;
      if (path === '/crm/leads' && params?.page === 2) { signal = config?.signal as AbortSignal; return pending as never; }
      return original(path, config);
    });
    fireEvent.click(within(screen.getByRole('region', { name: 'New stage' })).getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(signal).toBeDefined());
    act(() => useAppStore.setState({ activeBranchId: 'replacement-branch' }));
    expect(signal?.aborted).toBe(true);
    await act(async () => release({ data: { data: { data: [{ ...lead, name: 'Late private Lead' }], total: 1, page: 2, limit: 5, timezone: 'Asia/Kolkata' } } }));
    expect(screen.queryByText('Late private Lead')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Lead pipeline board' })).toBeNull();
  });
});
