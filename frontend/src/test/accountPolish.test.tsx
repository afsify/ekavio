import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SettingsPage from '../pages/Settings/SettingsPage';
import { useAppStore } from '../store/useAppStore';
import { client } from '../api/client';

vi.mock('../api/client', () => ({ client: { get: vi.fn(), put: vi.fn() } }));
beforeEach(() => {
  vi.clearAllMocks();
  useAppStore.setState({ user: { id: 'qa-original', name: 'QA Original', permissions: [] } as never });
  vi.mocked(client.get).mockResolvedValue({ data: { data: { verified: null, pending: null, available: false } } });
});
function mount() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter><SettingsPage /></MemoryRouter></QueryClientProvider>);
}
it('does not apply a late profile name to a replacement account', async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(client.put).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  mount();
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'QA edited original' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
  const signal = vi.mocked(client.put).mock.calls[0][2]?.signal;
  act(() => useAppStore.setState({ user: { id: 'qa-replacement', name: 'QA Replacement', permissions: [] } as never }));
  expect(signal?.aborted).toBe(true);
  await act(async () => { finish({ data: {} }); });
  expect(useAppStore.getState().user?.name).toBe('QA Replacement');
  expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('QA Replacement');
});
it('retains a failed profile draft and associated feedback without changing canonical identity', async () => {
  vi.mocked(client.put).mockRejectedValue(new Error('QA profile save rejected'));
  mount();
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'QA failed draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  expect((await screen.findByRole('alert')).textContent).toContain('QA profile save rejected');
  expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('QA failed draft');
  expect(useAppStore.getState().user?.name).toBe('QA Original');
});
it('cannot restore an old profile after logout, even if its request finishes', async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(client.put).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
  act(() => useAppStore.setState({ user: null }));
  await act(async () => { finish({ data: {} }); });
  expect(useAppStore.getState().user).toBeNull();
  expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('');
});
it('applies a completed profile save only to its original account', async () => {
  vi.mocked(client.put).mockResolvedValue({ data: {} });
  mount();
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'QA updated' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  await waitFor(() => expect(useAppStore.getState().user?.name).toBe('QA updated'));
});
it('does not expose a late rejected Profile A draft or error in Account B', async () => {
  let reject!: (reason: Error) => void;
  vi.mocked(client.put).mockReturnValue(new Promise((_resolve, fail) => { reject = fail; }));
  mount();
  fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'QA old private draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
  act(() => useAppStore.setState({ user: { id: 'qa-replacement', name: 'QA Replacement', permissions: [] } as never }));
  await act(async () => { reject(new Error('QA original private failure')); });
  expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('QA Replacement');
  expect(screen.queryByText('QA original private failure')).toBeNull();
  expect(useAppStore.getState().user?.name).toBe('QA Replacement');
});
it('does not clear Account B when Account A password-change success arrives late', async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(client.put).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  mount(); fireEvent.click(screen.getByRole('button', { name: /^Security$/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Change password$/ }));
  fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'QA old synthetic password' } });
  fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'QA new synthetic password' } });
  fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'QA new synthetic password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));
  await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
  act(() => useAppStore.setState({ user: { id: 'qa-replacement', name: 'QA Replacement', permissions: [] } as never }));
  expect(vi.mocked(client.put).mock.calls[0][2]?.signal?.aborted).toBe(true);
  await act(async () => { finish({ data: {} }); });
  expect(useAppStore.getState().user?.id).toBe('qa-replacement');
  expect(screen.queryByLabelText('Current Password')).toBeNull();
});
it('still clears the submitting account after an authorized password change', async () => {
  vi.mocked(client.put).mockResolvedValue({ data: {} });
  mount(); fireEvent.click(screen.getByRole('button', { name: /^Security$/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Change password$/ }));
  fireEvent.change(screen.getByLabelText('Current Password'), { target: { value: 'QA old synthetic password' } });
  fireEvent.change(screen.getByLabelText('New Password'), { target: { value: 'QA new synthetic password' } });
  fireEvent.change(screen.getByLabelText('Confirm New Password'), { target: { value: 'QA new synthetic password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Update Password' }));
  await waitFor(() => expect(useAppStore.getState().user).toBeNull());
  expect(client.put).toHaveBeenCalledWith('/profile/password', { oldPassword: 'QA old synthetic password', newPassword: 'QA new synthetic password' }, { signal: expect.any(AbortSignal) });
});
