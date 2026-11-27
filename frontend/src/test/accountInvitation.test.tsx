import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import AccountActionPage from '../pages/Identity/AccountActionPage';

const api = vi.hoisted(() => ({ inspectAndAccept: vi.fn(), acceptExisting: vi.fn(), signedIn: false, clearSession: vi.fn() }));
vi.mock('../api/client', () => ({ publicClient: { post: api.inspectAndAccept }, client: { post: api.acceptExisting } }));
vi.mock('../store/useAppStore', () => ({ useAppStore: Object.assign(
  (selector: (state: { isAuthenticated: boolean }) => unknown) => selector({ isAuthenticated: api.signedIn }),
  { getState: () => ({ clearSession: api.clearSession }) },
) }));

// Synthetic placeholders only. Real invitation tokens are never fixtures.
const token = 'a'.repeat(43);
const replacementToken = 'b'.repeat(43);
const inspectUrl = '/auth/inspect-action';
const acceptUrl = '/auth/accept-invitation';
const existingUrl = '/auth/accept-existing-invitation';
const organization = 'Synthetic QA Organization';
const invitedName = 'Synthetic QA Invitee';
const valid = (existingAccount = false, name = invitedName) =>
  ({ data: { data: { valid: true, organizationName: organization, name, existingAccount } } });
const responseError = (message: string) => ({ isAxiosError: true, response: { data: { message } } });
const accept = () => screen.getByRole('button', { name: /^Accept invitation$/ });
const inspectOnly = () => expect(api.inspectAndAccept.mock.calls.every(([path]) => path === inspectUrl)).toBe(true);
const password = () => screen.getByLabelText('New password');
const confirmation = () => screen.getByLabelText('Confirm password');

function renderAction(raw: string | null = token, action: 'invite' | 'forgot' | 'reset' | 'verify' = 'invite') {
  window.history.replaceState(null, '', '/accept-invitation' + (raw ? '#token=' + raw : ''));
  const query = new QueryClient();
  render(<StrictMode><QueryClientProvider client={query}><MemoryRouter><AccountActionPage action={action} /></MemoryRouter></QueryClientProvider></StrictMode>);
  return query;
}

beforeEach(() => {
  vi.resetAllMocks();
  api.signedIn = false;
  localStorage.clear();
  sessionStorage.clear();
});

it('waits for a valid inspection, strips its fragment under StrictMode and keeps it out of durable state', async () => {
  let finish!: (data: ReturnType<typeof valid>) => void;
  api.inspectAndAccept.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const query = renderAction();
  expect(window.location.hash).toBe('');
  expect(screen.getByRole('status').textContent).toBe('Checking your invitation…');
  expect(screen.queryByRole('button', { name: 'Accept invitation' })).toBeNull();
  expect(screen.queryByText(organization)).toBeNull();
  expect(api.inspectAndAccept).toHaveBeenCalledWith(inspectUrl, { token, purpose: 'staff_invitation' });
  expect(query.getQueryCache().getAll().map(entry => entry.queryKey)).toEqual([['account-action', 'invite', 0]]);
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  finish(valid());
  await screen.findByText(organization);
  screen.getByText(invitedName);
  expect(accept().hasAttribute('disabled')).toBe(true);
  inspectOnly();
});

it('enforces minimum length, UTF-8 byte limit and matching confirmation, then accepts explicitly', async () => {
  api.inspectAndAccept.mockResolvedValueOnce(valid()).mockResolvedValueOnce({ data: { data: { message: 'Account ready. Sign in.' } } });
  renderAction();
  await screen.findByRole('heading', { name: 'Set up your account' });
  const field = password();
  const confirm = confirmation();
  expect(field.getAttribute('aria-describedby')).toBeTruthy();
  expect(confirm.getAttribute('aria-describedby')).toBeTruthy();
  const fill = (value: string, repeat = value) => {
    fireEvent.change(field, { target: { value } });
    fireEvent.change(confirm, { target: { value: repeat } });
  };
  fill('short');
  expect(accept().hasAttribute('disabled')).toBe(true);
  fill('é'.repeat(37));
  expect(accept().hasAttribute('disabled')).toBe(true);
  const chosen = 'é'.repeat(36);
  fill(chosen, 'different password');
  expect(screen.getByRole('alert').textContent).toBe('Passwords do not match');
  expect(confirm.getAttribute('aria-invalid')).toBe('true');
  expect(accept().hasAttribute('disabled')).toBe(true);
  inspectOnly();
  fill(chosen);
  fireEvent.click(accept());
  await screen.findByText('Account ready. Sign in.');
  expect(api.inspectAndAccept.mock.calls.filter(([p]) => p === acceptUrl)).toEqual([[acceptUrl, { token, password: chosen }]]);
  expect(api.acceptExisting).not.toHaveBeenCalled();
  expect(api.clearSession).not.toHaveBeenCalled();
  expect(screen.getByRole('link', { name: 'Back to sign in' }).getAttribute('href')).toBe('/login');
  expect(screen.queryByLabelText('New password')).toBeNull();
});

it('requires sign-in for an existing invite and never shows password creation fields', async () => {
  api.inspectAndAccept.mockResolvedValue(valid(true));
  renderAction();
  await screen.findByRole('heading', { name: 'Join with your existing account' });
  screen.getByText(/reopen this link/);
  expect(screen.getByRole('link', { name: /^Sign in$/ }).getAttribute('href')).toBe('/login');
  expect(screen.queryByLabelText('New password')).toBeNull();
  expect(accept().hasAttribute('disabled')).toBe(true);
  fireEvent.submit(accept().closest('form')!);
  expect(api.acceptExisting).not.toHaveBeenCalled();
  inspectOnly();
});

it('uses only the authenticated endpoint, preserves wrong-account errors and waits for confirmed success', async () => {
  api.signedIn = true;
  api.inspectAndAccept.mockResolvedValue(valid(true));
  api.acceptExisting.mockRejectedValueOnce(responseError('Invitation belongs to a different account'))
    .mockResolvedValueOnce({ data: { data: { message: 'Organization joined. Refresh your workspace context.' } } });
  renderAction();
  await screen.findByRole('heading', { name: 'Join with your existing account' });
  expect(api.acceptExisting).not.toHaveBeenCalled();
  fireEvent.click(accept());
  expect((await screen.findByRole('alert')).textContent).toMatch(/Invitation belongs to a different account.*reopen this link/);
  expect(screen.queryByText(/Organization joined/)).toBeNull();
  expect(api.clearSession).not.toHaveBeenCalled();
  fireEvent.click(accept());
  await screen.findByText(/Organization joined/);
  expect(api.acceptExisting.mock.calls).toEqual([[existingUrl, { token }], [existingUrl, { token }]]);
  expect(api.clearSession).not.toHaveBeenCalled();
  inspectOnly();
});

it('shows safe guidance when the token is missing without calling the server', () => {
  renderAction(null);
  expect(screen.getByRole('alert').textContent).toMatch(/missing.*workspace administrator/);
  expect(screen.queryByRole('button', { name: 'Accept invitation' })).toBeNull();
  expect(api.inspectAndAccept).not.toHaveBeenCalled();
});

it.each([
  { data: { data: { ...valid().data.data, valid: false } } },
  responseError('This link is invalid, expired, already used or revoked'),
  new Error('Network Error'),
])('shows no invitation details or form after an invalid inspection (%#)', async (reply) => {
  if ('data' in reply) api.inspectAndAccept.mockResolvedValue(reply);
  else api.inspectAndAccept.mockRejectedValue(reply);
  expect((await renderAndFindAlert()).textContent).toContain('Ask your workspace administrator for a new invitation link.');
  expect(screen.queryByText(organization)).toBeNull();
  expect(screen.queryByText(invitedName)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Accept invitation' })).toBeNull();
  inspectOnly();
});

async function renderAndFindAlert() {
  renderAction();
  return screen.findByRole('alert');
}

it('preserves an acceptance error and refuses duplicate submissions while pending', async () => {
  let reject!: (reason: unknown) => void;
  api.inspectAndAccept.mockResolvedValueOnce(valid()).mockReturnValueOnce(new Promise((_, fail) => { reject = fail; }));
  renderAction();
  await screen.findByRole('heading', { name: 'Set up your account' });
  fireEvent.change(password(), { target: { value: 'a long synthetic passphrase' } });
  fireEvent.change(confirmation(), { target: { value: 'a long synthetic passphrase' } });
  fireEvent.click(accept());
  const busy = await screen.findByRole('button', { name: 'Please wait…' });
  expect(busy.getAttribute('aria-busy')).toBe('true');
  fireEvent.submit(busy.closest('form')!);
  reject(responseError('This link is invalid, expired, already used or revoked'));
  expect((await screen.findByRole('alert')).textContent).toMatch(/already used or revoked.*workspace administrator/);
  expect(api.inspectAndAccept.mock.calls.filter(([p]) => p === acceptUrl)).toHaveLength(1);
});

it('replaces the fragment and clears the previous invitation form without automatic acceptance', async () => {
  api.inspectAndAccept.mockResolvedValueOnce(valid()).mockResolvedValueOnce(valid(false, 'New synthetic invitee'));
  const query = renderAction();
  await screen.findByText(invitedName);
  fireEvent.change(password(), { target: { value: 'a long synthetic passphrase' } });
  await act(async () => {
    window.history.replaceState(null, '', '/accept-invitation#token=' + replacementToken);
    window.dispatchEvent(new Event('hashchange'));
  });
  await screen.findByText('New synthetic invitee');
  expect(screen.queryByText(invitedName)).toBeNull();
  expect((password() as HTMLInputElement).value).toBe('');
  expect(window.location.hash).toBe('');
  await waitFor(() => expect(query.getQueryCache().getAll().map(x => x.queryKey)).toEqual([['account-action', 'invite', 1]]));
  expect(api.inspectAndAccept).toHaveBeenLastCalledWith(inspectUrl, { token: replacementToken, purpose: 'staff_invitation' });
  inspectOnly();
});
