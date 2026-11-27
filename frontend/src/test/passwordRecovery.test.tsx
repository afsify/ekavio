import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountActionPage from '../pages/Identity/AccountActionPage';

const mocks = vi.hoisted(() => ({ post: vi.fn(), clearSession: vi.fn() }));
vi.mock('../api/client', () => ({ publicClient: { post: mocks.post }, client: { post: vi.fn() } }));
vi.mock('../store/useAppStore', () => ({ useAppStore: Object.assign(
  (selector: (state: { isAuthenticated: boolean }) => unknown) => selector({ isAuthenticated: false }),
  { getState: () => ({ clearSession: mocks.clearSession }) },
) }));

const generic = 'If this account has a verified email, a password reset message may be sent. Check your inbox.';
const verifiedIdentifier = 'qa@example.invalid';
const phone = '+12025550101';
const token = 'c'.repeat(43);
const replacement = 'd'.repeat(43);
const valid = { data: { data: { valid: true } } };
const inspect = '/auth/inspect-action';
const forgot = '/auth/forgot-password';
const reset = '/auth/reset-password';
const password = () => screen.getByLabelText('New password');
const confirmation = () => screen.getByLabelText('Confirm password');
const response = (message: string) => ({ data: { data: { message } } });
const apiError = (message: string) => ({ isAxiosError: true, response: { data: { message } } });
const send = () => screen.getByRole('button', { name: /^Send reset link$/ });
const submitReset = () => screen.getByRole('button', { name: /^Reset password$/ });

function renderRecovery(action: 'forgot' | 'reset', raw?: string) {
  window.history.replaceState(null, '', (action === 'forgot' ? '/forgot-password' : '/reset-password') + (raw ? '#token=' + raw : ''));
  const query = new QueryClient();
  render(<StrictMode><QueryClientProvider client={query}><MemoryRouter><AccountActionPage action={action} /></MemoryRouter></QueryClientProvider></StrictMode>);
  return query;
}

function fillPasswords(value: string, confirm = value) {
  fireEvent.change(password(), { target: { value } });
  fireEvent.change(confirmation(), { target: { value: confirm } });
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('forgot password', () => {
  it.each([phone, verifiedIdentifier])('accepts a phone or email identifier and renders the same server confirmation', async identifier => {
    mocks.post.mockResolvedValue(response(generic));
    renderRecovery('forgot');
    const field = screen.getByRole('textbox', { name: 'Phone or email', description: 'Use the phone number or verified email on your account.' });
    expect(field.getAttribute('type')).toBe('text');
    expect(field.getAttribute('autocomplete')).toBe('username');
    expect(field.getAttribute('maxlength')).toBe('254');
    fireEvent.change(field, { target: { value: '  ' } });
    expect(send().hasAttribute('disabled')).toBe(true);
    fireEvent.submit(send().closest('form')!);
    expect(mocks.post).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: identifier } });
    expect(mocks.post).not.toHaveBeenCalled();
    fireEvent.click(send());
    expect((await screen.findByRole('status')).textContent).toBe(generic);
    screen.getByText(/spam folder.*one minute.*workspace administrator/);
    expect(mocks.post.mock.calls).toEqual([[forgot, { identifier }]]);
    expect(mocks.clearSession).not.toHaveBeenCalled();
  });

  it('blocks same-tick and pending duplicate requests', async () => {
    let finish!: (value: ReturnType<typeof response>) => void;
    mocks.post.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    renderRecovery('forgot');
    fireEvent.change(screen.getByLabelText('Phone or email'), { target: { value: phone } });
    const form = send().closest('form')!;
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    const waiting = await screen.findByRole('button', { name: 'Please wait…' });
    expect(waiting.getAttribute('aria-busy')).toBe('true');
    expect(waiting.hasAttribute('disabled')).toBe(true);
    fireEvent.submit(form);
    finish(response(generic));
    await screen.findByText(generic);
    expect(mocks.post).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Email actions are currently unavailable. Contact your workspace administrator.', apiError('Email actions are currently unavailable. Contact your workspace administrator.')],
    ['Network Error', new Error('Network Error')],
  ])('preserves %s and offers safe retry guidance', async (message, error) => {
    mocks.post.mockRejectedValueOnce(error).mockResolvedValueOnce(response(generic));
    renderRecovery('forgot');
    fireEvent.change(screen.getByLabelText('Phone or email'), { target: { value: phone } });
    fireEvent.click(send());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(message);
    expect(alert.textContent).toMatch(/Wait at least one minute/);
    expect(screen.queryByRole('status')).toBeNull();
    expect(send().hasAttribute('disabled')).toBe(false);
    fireEvent.click(send());
    await screen.findByText(generic);
  });
});

describe('reset password', () => {
  it('gives a token-free replacement link when the token is missing', () => {
    renderRecovery('reset');
    expect(screen.getByRole('alert').textContent).toContain('link is missing');
    expect(screen.getByRole('link', { name: /Request a new reset link/ }).getAttribute('href')).toBe('/forgot-password');
    expect(screen.queryByLabelText('New password')).toBeNull();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('waits for inspection and removes the fragment under StrictMode', async () => {
    let finish!: (reply: typeof valid) => void;
    mocks.post.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const query = renderRecovery('reset', token);
    expect(window.location.hash).toBe('');
    expect(screen.getByRole('status').textContent).toBe('Checking your password reset link…');
    expect(screen.queryByLabelText('New password')).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(query.getQueryCache().getAll().map(x => x.queryKey)).toEqual([['account-action', 'reset', 0]]);
    expect(mocks.post).toHaveBeenCalledWith(inspect, { token, purpose: 'password_reset' });
    finish(valid);
    await screen.findByLabelText('New password');
    expect(mocks.post.mock.calls.every(([path]) => path === inspect)).toBe(true);
  });

  it.each([
    { data: { data: { valid: false } } },
    apiError('This link is invalid, expired, already used or revoked'),
    new Error('Network Error'),
  ])('withholds the form and offers a fresh reset link after failed inspection (%#)', async outcome => {
    if ('data' in outcome) mocks.post.mockResolvedValue(outcome);
    else mocks.post.mockRejectedValue(outcome);
    renderRecovery('reset', token);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/request a new reset link/i);
    if ('response' in outcome) expect(alert.textContent).toContain(outcome.response.data.message);
    expect(screen.queryByLabelText('New password')).toBeNull();
    expect(screen.getByRole('link', { name: /Request a new reset link/ }).getAttribute('href')).toBe('/forgot-password');
    expect(mocks.post.mock.calls.every(([path]) => path === inspect)).toBe(true);
  });

  it('guards length, byte count and confirmation, then submits once and clears the session only after success', async () => {
    let finish!: (value: ReturnType<typeof response>) => void;
    mocks.post.mockResolvedValueOnce(valid).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    renderRecovery('reset', token);
    await screen.findByLabelText('New password');
    const form = submitReset().closest('form')!;
    expect(password().getAttribute('maxlength')).toBe('72');
    expect(password().getAttribute('aria-describedby')).toBeTruthy();
    expect(confirmation().getAttribute('aria-describedby')).toBeTruthy();
    fillPasswords('short');
    expect(submitReset().hasAttribute('disabled')).toBe(true);
    fireEvent.submit(form);
    fillPasswords('é'.repeat(37));
    expect(submitReset().hasAttribute('disabled')).toBe(true);
    fireEvent.submit(form);
    const chosen = 'é'.repeat(36);
    fillPasswords(chosen, 'different password');
    expect(screen.getByRole('alert').textContent).toBe('Passwords do not match');
    expect(confirmation().getAttribute('aria-invalid')).toBe('true');
    fireEvent.submit(form);
    expect(mocks.post.mock.calls.every(([path]) => path === inspect)).toBe(true);
    fillPasswords(chosen);
    act(() => { fireEvent.submit(form); fireEvent.submit(form); });
    await screen.findByRole('button', { name: 'Please wait…' });
    fireEvent.submit(form);
    expect(mocks.clearSession).not.toHaveBeenCalled();
    expect(screen.queryByText('Password reset. Sign in again.')).toBeNull();
    finish(response('Password reset. Sign in again.'));
    expect((await screen.findByRole('status')).textContent).toBe('Password reset. Sign in again.');
    expect(mocks.post.mock.calls.filter(([path]) => path === reset)).toEqual([[reset, { token, password: chosen }]]);
    expect(mocks.clearSession).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: 'Back to sign in' }).getAttribute('href')).toBe('/login');
    expect(screen.queryByLabelText('New password')).toBeNull();
  });

  it('preserves the server error if a reset is rejected after valid inspection', async () => {
    mocks.post.mockResolvedValueOnce(valid).mockRejectedValueOnce(apiError('This link is invalid, expired, already used or revoked'));
    renderRecovery('reset', token);
    await screen.findByLabelText('New password');
    fillPasswords('a synthetic passphrase');
    fireEvent.click(submitReset());
    expect((await screen.findByRole('alert')).textContent).toMatch(/invalid, expired, already used or revoked.*request a new reset link/);
    expect(mocks.clearSession).not.toHaveBeenCalled();
    expect(screen.queryByText('Password reset. Sign in again.')).toBeNull();
  });

  it('removes replacement fragments, clears the previous password and does not reset automatically', async () => {
    mocks.post.mockResolvedValue(valid);
    const query = renderRecovery('reset', token);
    await screen.findByLabelText('New password');
    fillPasswords('a synthetic passphrase');
    await act(async () => {
      window.history.replaceState(null, '', '/reset-password#token=' + replacement);
      window.dispatchEvent(new Event('hashchange'));
    });
    await screen.findByLabelText('New password');
    expect((password() as HTMLInputElement).value).toBe('');
    expect((confirmation() as HTMLInputElement).value).toBe('');
    expect(window.location.hash).toBe('');
    await waitFor(() => expect(query.getQueryCache().getAll().map(x => x.queryKey)).toEqual([['account-action', 'reset', 1]]));
    expect(mocks.post).toHaveBeenLastCalledWith(inspect, { token: replacement, purpose: 'password_reset' });
    expect(mocks.post.mock.calls.every(([path]) => path === inspect)).toBe(true);
  });
});
