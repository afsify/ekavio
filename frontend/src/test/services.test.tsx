import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { MemoryRouter, Link } from 'react-router-dom';
import ServicesPage from '../pages/Services/ServicesPage';
import { client } from '../api/client';
import { useAppStore } from '../store/useAppStore';
vi.mock('../api/client', () => ({ client: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn() } }));
const service = { id: 'qa-service', name: 'QA existing', description: null, durationMinutes: 30, active: true };
beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ user: { id: crypto.randomUUID(), permissions: ['services.read', 'services.manage'] } as never, activeTenantId: 'qa-org', activeBranchId: 'qa-branch', entitlements: null, isPlatformOperator: false });
  vi.mocked(client.get).mockImplementation(async url => ({ data: url.includes('/schema') ? { data: { entity: 'service', version: 0, builtins: [{ key: 'name', required: true }, { key: 'durationMinutes', required: true }, { key: 'description' }, { key: 'active' }], definitions: [], sections: [] } } : url.includes('/values/') ? { data: {} } : { data: [service], pagination: { totalPages: 1 } } }) as never);
  vi.mocked(client.post).mockResolvedValue({ data: service }); vi.mocked(client.patch).mockResolvedValue({ data: service });
});
function mount() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter><Link to="/dashboard">Leave Services</Link><ServicesPage /></MemoryRouter></QueryClientProvider>); }
async function create() { mount(); fireEvent.click(screen.getByRole('button', { name: 'Create service' })); await screen.findByLabelText('Service name'); fireEvent.change(screen.getByLabelText('Service name'), { target: { value: 'QA new service' } }); }
function review() { fireEvent.click(screen.getByRole('button', { name: 'Review service' })); }
function confirm() { review(); fireEvent.click(screen.getByRole('button', { name: 'Save service' })); }
it('requires review before a canonical Service write and refreshes before closing', async () => {
  await create(); expect(screen.queryByRole('button', { name: 'Save service' })).toBeNull(); review();
  expect(screen.getByRole('dialog').textContent).toContain('QA new service'); expect(client.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save service' })); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(client.post).toHaveBeenCalledWith('/services', { customFields: {}, name: 'QA new service', description: null, durationMinutes: 30 }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
});
it('protects dirty drafts and explicitly discards without writing', async () => {
  await create(); fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); expect(screen.getByRole('dialog').textContent).toContain('Discard unsaved changes');
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' })); expect((screen.getByLabelText('Service name') as HTMLInputElement).value).toBe('QA new service');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); fireEvent.click(screen.getByRole('button', { name: 'Discard changes' })); expect(client.post).not.toHaveBeenCalled();
});
it('locks duplicate confirmation and Escape while the request is pending', async () => {
  vi.mocked(client.post).mockReturnValue(new Promise(() => undefined)); await create(); review();
  const save = screen.getByRole('button', { name: 'Save service' }); fireEvent.click(save); fireEvent.click(save); fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1)); expect(screen.queryByText('Discard unsaved changes?')).toBeNull(); expect(screen.getByRole('dialog').textContent).toContain('Review');
});
it('keeps a rejected draft editable without retrying until it is reviewed again', async () => {
  vi.mocked(client.post).mockRejectedValue(new AxiosError('Validation rejected', 'ERR_BAD_REQUEST', undefined, undefined, { status: 400, data: { message: 'Validation rejected' }, statusText: '', headers: {}, config: {} as never }));
  await create(); confirm(); await screen.findByRole('button', { name: 'Return to service editor' }); fireEvent.click(screen.getByRole('button', { name: 'Return to service editor' }));
  expect((screen.getByLabelText('Service name') as HTMLInputElement).value).toBe('QA new service'); expect(client.post).toHaveBeenCalledTimes(1);
});
it('prevents blind replay and reopening after an uncertain create', async () => {
  vi.mocked(client.post).mockRejectedValue(new Error('Response lost')); await create(); confirm(); await waitFor(() => expect(screen.getByRole('button', { name: 'Save service' }).hasAttribute('disabled')).toBe(true));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
  expect(screen.getByRole('button', { name: 'Create service' }).hasAttribute('disabled')).toBe(true); expect(screen.getByRole('alert').textContent).toContain('uncertain'); expect(client.post).toHaveBeenCalledTimes(1);
});
it('isolates a draft and aborts an old pending response when branch authority changes', async () => {
  vi.mocked(client.post).mockReturnValue(new Promise(() => undefined)); await create(); confirm(); await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));
  const signal = vi.mocked(client.post).mock.calls[0][2]?.signal;
  useAppStore.setState({ activeBranchId: 'qa-other-branch' }); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); expect(signal?.aborted).toBe(true);
});
it('does not expose the Service editor without services.manage', () => {
  useAppStore.setState({ user: { id: 'qa-user', permissions: ['services.read'] } as never }); mount(); expect(screen.queryByRole('button', { name: 'Create service' })).toBeNull();
});
it('captures edit identity and does not turn metadata updates into provider assignment', async () => {
  mount(); fireEvent.click(await screen.findByRole('button', { name: 'Edit QA existing' })); await screen.findByLabelText('Service name');
  fireEvent.change(screen.getByLabelText('Service name'), { target: { value: 'QA edited' } }); confirm(); await waitFor(() => expect(client.patch).toHaveBeenCalledTimes(1));
  expect(client.patch).toHaveBeenCalledWith('/services/qa-service', expect.objectContaining({ name: 'QA edited', active: true }), expect.any(Object)); expect(client.put).not.toHaveBeenCalled();
});
it('guards route navigation without losing the canonical draft on cancellation', async () => {
  await create(); fireEvent.click(screen.getByRole('link', { name: 'Leave Services' })); expect(screen.getByRole('dialog').textContent).toContain('Discard unsaved Service changes');
  fireEvent.click(screen.getByRole('button', { name: 'Keep service draft' })); expect((screen.getByLabelText('Service name') as HTMLInputElement).value).toBe('QA new service'); expect(client.post).not.toHaveBeenCalled();
});
it('treats post-commit refresh failure as uncertain even if the read was rejected with 400', async () => {
  const get = vi.mocked(client.get).getMockImplementation()!;
  vi.mocked(client.post).mockImplementation(async () => { vi.mocked(client.get).mockRejectedValue(new AxiosError('Read rejected', undefined, undefined, undefined, { status: 400, data: {}, statusText: '', headers: {}, config: {} as never })); return { data: service }; });
  await create(); confirm(); await waitFor(() => expect(screen.getByRole('button', { name: 'Save service' }).hasAttribute('disabled')).toBe(true));
  expect(screen.queryByRole('button', { name: 'Return to service editor' })).toBeNull(); expect(client.post).toHaveBeenCalledTimes(1); vi.mocked(client.get).mockImplementation(get);
});
