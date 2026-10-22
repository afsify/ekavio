import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CrmPage from '../pages/CRM/CrmPage';
import CustomFieldsPage from '../pages/Settings/CustomFieldsPage';
import OrganizationPage from '../pages/Settings/OrganizationPage';
import { client } from '../api/client';
import { AxiosError } from 'axios';
import { useAppStore } from '../store/useAppStore';

vi.mock('../api/client', () => ({ client: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn() } }));
const catalogue = [
  { key: 'customers.read', label: 'View customers', category: 'Customers', description: 'Read customer records' },
  { key: 'customers.manage', label: 'Manage customers', category: 'Customers', description: 'Change customer records' },
  { key: 'crm.read', label: 'View CRM', category: 'CRM', description: 'Read leads' },
];
const role = { id: 'role', name: 'QA reviewer', description: 'QA role', permissions: ['customers.read'], status: 'active', version: 3 };
const stage = { id: 'stage', name: 'QA enquiry', description: 'QA stage', position: 0, status: 'active', version: 4 };
beforeEach(() => {
  vi.resetAllMocks();
  useAppStore.setState({ user: { id: 'qa', permissions: ['crm.read', 'crm.manage', 'fields.read', 'fields.manage', 'roles.read', 'roles.manage', 'customers.read', 'customers.manage'] } as never, activeTenantId: 'org', activeBranchId: 'branch', entitlements: { modules: [{ key: 'crm', enabled: true }] } as never, isPlatformOperator: false });
  vi.mocked(client.get).mockImplementation(async path => ({ data: { data:
    path === '/roles' ? { catalogue, system: [{ name: 'staff', permissions: ['customers.read'] }], custom: [structuredClone(role)] } :
    path === '/crm/stages' ? [stage] : path === '/crm/overview' ? { timezone: 'Asia/Kolkata', stages: [stage] } :
    path === '/crm/leads' ? { data: [], total: 0, page: 1, limit: 20, timezone: 'Asia/Kolkata' } :
    path.startsWith('/forms/') ? { entity: path.split('/')[2], version: 0, definitions: [], sections: [], builtins: [{ key: 'name', label: 'Name', required: true }] } : []
  } }) as never);
});
afterEach(cleanup);
function HistoryControls() { const navigate = useNavigate(); return <><button onClick={() => navigate(-1)}>History back</button><button onClick={() => navigate(1)}>History forward</button></>; }
function mount(path = '/crm') {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={cache}><MemoryRouter initialEntries={[path]}><HistoryControls /><Routes><Route path="/crm" element={<CrmPage />} /><Route path="/custom-fields" element={<CustomFieldsPage />} /><Route path="/roles" element={<OrganizationPage section="roles" />} /></Routes></MemoryRouter></QueryClientProvider>);
  return cache;
}
it('CRM Lead Data & Forms opens Lead, with URL-backed entity history', async () => {
  mount(); await screen.findByRole('heading', { name: 'No leads yet' });
  fireEvent.click(screen.getByText('How CRM works'));
  fireEvent.click(screen.getByRole('link', { name: 'Lead Data & Forms' }));
  expect((await screen.findByRole('combobox', { name: 'Record type' })) as HTMLSelectElement).toHaveProperty('value', 'lead');
  await waitFor(() => expect(client.get).toHaveBeenCalledWith('/forms/lead/schema', expect.any(Object)));
  fireEvent.change(screen.getByRole('combobox', { name: 'Record type' }), { target: { value: 'service' } });
  expect(screen.getByRole('combobox', { name: 'Record type' })).toHaveProperty('value', 'service');
  fireEvent.click(screen.getByRole('button', { name: 'History back' }));
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Record type' })).toHaveProperty('value', 'lead'));
  fireEvent.click(screen.getByRole('button', { name: 'History forward' }));
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Record type' })).toHaveProperty('value', 'service'));
});
for (const query of ['', '?entity=unknown', '?entity=customer']) it(`standalone Studio uses Customer for ${query || 'no query'}`, async () => {
  mount('/custom-fields' + query); expect(await screen.findByRole('combobox', { name: 'Record type' })).toHaveProperty('value', 'customer');
});
it('dirty layout still guards URL-backed entity selection', async () => {
  mount('/custom-fields?entity=lead');
  fireEvent.change(await screen.findByLabelText('Section 1 title'), { target: { value: 'QA draft' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Record type' }), { target: { value: 'service' } });
  expect(screen.getByRole('dialog').textContent).toContain('Discard unsaved layout');
  fireEvent.click(screen.getByRole('button', { name: 'Keep layout draft' }));
  expect(screen.getByLabelText('Section 1 title')).toHaveProperty('value', 'QA draft');
  expect(screen.getByRole('combobox', { name: 'Record type' })).toHaveProperty('value', 'lead');
});
for (const change of ['account', 'organization', 'branch', 'permission', 'permission-addition', 'entitlement', 'operator'] as const) it(`closes stale CRM editor on ${change} replacement`, async () => {
  mount(); await screen.findByRole('heading', { name: 'No leads yet' });
  fireEvent.click(screen.getByRole('button', { name: 'Create lead' }));
  await screen.findByRole('dialog');
  act(() => { const state = useAppStore.getState(); useAppStore.setState(
    change === 'account' ? { user: { ...state.user!, id: 'other' } } :
    change === 'organization' ? { activeTenantId: 'other' } :
    change === 'branch' ? { activeBranchId: 'other' } :
    change === 'permission' ? { user: { ...state.user!, permissions: ['crm.read'] } } :
    change === 'permission-addition' ? { user: { ...state.user!, permissions: [...state.user!.permissions!, 'audit.read'] } } :
    change === 'entitlement' ? { entitlements: null } : { isPlatformOperator: true }); });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(client.post).not.toHaveBeenCalled(); expect(client.patch).not.toHaveBeenCalled();
});
it('same-scope CRM draft still requires explicit discard', async () => {
  mount(); await screen.findByRole('heading', { name: 'No leads yet' });
  fireEvent.click(screen.getByRole('button', { name: 'Create lead' }));
  fireEvent.change(await screen.findByLabelText('Lead name'), { target: { value: 'QA unsaved' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('dialog').textContent).toContain('Discard unsaved changes?');
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' })); expect(screen.getByLabelText('Lead name')).toHaveProperty('value', 'QA unsaved');
});
it('permission ordering alone preserves an unsaved CRM draft', async () => {
  mount(); await screen.findByRole('heading', { name: 'No leads yet' });
  fireEvent.click(screen.getByRole('button', { name: 'Create lead' }));
  fireEvent.change(await screen.findByLabelText('Lead name'), { target: { value: 'QA retained ordering draft' } });
  const expectedOrder = [...useAppStore.getState().user!.permissions!].reverse();
  act(() => { const user = useAppStore.getState().user!; useAppStore.setState({ user: { ...user, permissions: [...expectedOrder] } }); });
  expect(useAppStore.getState().user!.permissions).toEqual(expectedOrder);
  expect(screen.getByLabelText('Lead name')).toHaveProperty('value', 'QA retained ordering draft');
  expect(client.post).not.toHaveBeenCalled(); expect(client.patch).not.toHaveBeenCalled();
});
it('permission ordering alone preserves an unsaved Lead layout draft', async () => {
  const pending: { resolve?: (value: unknown) => void } = {};
  vi.mocked(client.put).mockReturnValue(new Promise(resolve => { pending.resolve = resolve; }) as never);
  mount('/custom-fields?entity=lead');
  fireEvent.change(await screen.findByLabelText('Section 1 title'), { target: { value: 'QA retained layout ordering draft' } });
  act(() => { const user = useAppStore.getState().user!; useAppStore.setState({ user: { ...user, permissions: [...user.permissions!].reverse() } }); });
  expect(await screen.findByLabelText('Section 1 title')).toHaveProperty('value', 'QA retained layout ordering draft');
  expect(screen.getByRole('button', { name: /^Save layout$/ })).toHaveProperty('disabled', false);
  fireEvent.click(screen.getByRole('button', { name: /^Save layout$/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm layout save' }));
  await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
  expect(client.put).toHaveBeenCalledWith('/forms/lead/layout', expect.objectContaining({ version: 0 }), expect.any(Object));
  const signal = vi.mocked(client.put).mock.calls[0][2]?.signal;
  act(() => { const user = useAppStore.getState().user!; useAppStore.setState({ user: { ...user, permissions: user.permissions!.filter(key => key !== 'fields.manage') } }); });
  expect(signal?.aborted).toBe(true);
  await act(async () => { pending.resolve?.({}); });
  expect(await screen.findByLabelText('Section 1 title')).toHaveProperty('value', 'General');
  expect(screen.queryByRole('button', { name: /^Save layout$/ })).toBeNull();
  expect(client.post).not.toHaveBeenCalled(); expect(client.patch).not.toHaveBeenCalled();
});
it('shows human stage order while retaining zero-based position and original version', async () => {
  vi.mocked(client.patch).mockResolvedValue({}); mount(); await screen.findByRole('heading', { name: 'No leads yet' });
  fireEvent.click(screen.getByRole('button', { name: 'Pipeline settings' }));
  fireEvent.click(screen.getByRole('button', { name: 'Edit stage QA enquiry' }));
  expect(screen.getByLabelText('Stage order (1–50)')).toHaveProperty('value', '1');
  fireEvent.change(screen.getByLabelText('Stage description'), { target: { value: 'Updated only' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review' })); fireEvent.click(screen.getByRole('button', { name: 'Save stage' }));
  await waitFor(() => expect(client.patch).toHaveBeenCalledWith('/crm/stages/stage', expect.objectContaining({ position: 0, expectedVersion: 4, description: 'Updated only' })));
});
it('maps the last human stage order to API 49 and rejects blank/zero', async () => {
  mount(); await screen.findByRole('heading', { name: 'No leads yet' }); fireEvent.click(screen.getByRole('button', { name: 'Pipeline settings' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add stage' }));
  fireEvent.change(screen.getByLabelText('Stage name'), { target: { value: 'QA final' } });
  for (const value of ['', '0']) { fireEvent.change(screen.getByLabelText('Stage order (1–50)'), { target: { value } }); expect(screen.getByRole('button', { name: 'Review' }).hasAttribute('disabled')).toBe(true); }
  fireEvent.change(screen.getByLabelText('Stage order (1–50)'), { target: { value: '50' } });
  fireEvent.click(screen.getByRole('button', { name: 'Review' })); fireEvent.click(screen.getByRole('button', { name: 'Save stage' }));
  await waitFor(() => expect(client.post).toHaveBeenCalledWith('/crm/stages', expect.objectContaining({ position: 49 })));
});
it('role search preserves hidden selections and reviews exact additions/removals before replacement', async () => {
  vi.mocked(client.patch).mockResolvedValue({}); mount('/roles');
  fireEvent.click(within(await screen.findByRole('table')).getByRole('button', { name: 'Edit QA reviewer' }));
  expect(screen.getByRole('button', { name: 'Review' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: /View customers/ }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search permissions' }), { target: { value: 'manage' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Manage customers/ }));
  expect(screen.queryByRole('checkbox', { name: /View CRM/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Review' }));
  expect(within(screen.getByRole('region', { name: 'Added permissions' })).getByText('Manage customers')).toBeTruthy();
  expect(within(screen.getByRole('region', { name: 'Removed permissions' })).getByText('View customers')).toBeTruthy();
  expect(client.patch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(client.patch).toHaveBeenCalledWith('/roles/role', expect.objectContaining({ permissions: ['customers.manage'], version: 3 })));
});
it('read-only role viewers cannot mutate system or custom roles', async () => {
  useAppStore.setState({ user: { ...useAppStore.getState().user!, permissions: ['roles.read'] } }); mount('/roles');
  await screen.findAllByRole('heading', { name: 'QA reviewer' }); expect(screen.queryByRole('button', { name: 'Edit QA reviewer' })).toBeNull(); expect(screen.queryByRole('button', { name: 'Create role' })).toBeNull();
});
it('retains the reviewed role selection and captured version after a stale-version rejection', async () => {
  vi.mocked(client.patch).mockRejectedValue(new AxiosError('Conflict', 'ERR_BAD_REQUEST', undefined, undefined, { status: 409, data: { message: 'Role changed; reload before saving' }, headers: {}, config: {} as never, statusText: 'Conflict' }));
  const cache = mount('/roles'); fireEvent.click(within(await screen.findByRole('table')).getByRole('button', { name: 'Edit QA reviewer' }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Manage customers/ }));
  cache.setQueryData(cache.getQueryCache().getAll().find(query => query.queryKey.includes('/roles'))!.queryKey, { catalogue, system: [], custom: [{ ...role, version: 4, permissions: [] }] });
  fireEvent.click(screen.getByRole('button', { name: 'Review' })); fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await screen.findByRole('alert');
  expect(client.patch).toHaveBeenCalledTimes(1); expect(client.patch).toHaveBeenCalledWith('/roles/role', expect.objectContaining({ version: 3, permissions: ['customers.read', 'customers.manage'] }));
  expect(within(screen.getByRole('region', { name: 'Current permissions' })).getByText('View customers')).toBeTruthy();
  expect(within(screen.getByRole('region', { name: 'Added permissions' })).getByText('Manage customers')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Back' }).hasAttribute('disabled')).toBe(true);
});
it('allows explicit revocation but never regrant of authority the manager does not hold', async () => {
  useAppStore.setState({ user: { ...useAppStore.getState().user!, permissions: ['roles.read', 'roles.manage'] } }); mount('/roles');
  fireEvent.click(within(await screen.findByRole('table')).getByRole('button', { name: 'Edit QA reviewer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remove View customers' }));
  expect(screen.getByRole('checkbox', { name: /View customers/ }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('checkbox', { name: /Manage customers/ }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Review' })); fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(client.patch).toHaveBeenCalledWith('/roles/role', expect.objectContaining({ permissions: [], version: 3 })));
});
