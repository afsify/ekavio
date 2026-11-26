import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailSettings } from '../pages/Identity/EmailSettings';

const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock('../api/client', () => ({ client: api }));

const verified = 'verified@example.invalid';
const pending = 'pending@example.invalid';
const helper = 'Follow the link we send to verify this address before using it to sign in.';
const emailState = (data: Partial<{ verified: string | null; pending: string | null; available: boolean }> = {}) =>
  ({ data: { data: { verified: null, pending: null, available: true, ...data } } });
const send = () => screen.getByRole('button', { name: 'Send verification' });
const resend = () => screen.getByRole('button', { name: 'Resend verification' });

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><EmailSettings /></QueryClientProvider>);
}

beforeEach(() => { vi.resetAllMocks(); });

describe('email identity guidance', () => {
  it('explains the first-email setup and provides an accessible field description', async () => {
    api.get.mockResolvedValue(emailState());
    renderSettings();
    await screen.findByText('No verified email.');
    screen.getByText(/still sign in with your phone number/);
    expect(screen.getByRole('textbox', { name: 'New email', description: helper }).getAttribute('type')).toBe('email');
    expect(screen.queryByRole('button', { name: 'Resend verification' })).toBeNull();
    expect(send().hasAttribute('disabled')).toBe(false);
  });

  it('explains first pending verification without implying a previous verified address', async () => {
    api.get.mockResolvedValue(emailState({ pending }));
    renderSettings();
    await screen.findByText('Pending verification: ' + pending);
    screen.getByText('You can sign in with this email after you verify it.');
    expect(screen.queryByText(/current verified email remains usable/)).toBeNull();
    expect(resend().hasAttribute('disabled')).toBe(false);
  });

  it('shows verified sign-in and recovery when delivery is available', async () => {
    api.get.mockResolvedValue(emailState({ verified }));
    renderSettings();
    await screen.findByText('Verified: ' + verified);
    screen.getByText('You can use this address to sign in.');
    screen.getByText(/Password reset emails go to your verified address/);
    expect(screen.queryByRole('button', { name: 'Resend verification' })).toBeNull();
  });

  it('keeps the existing verified address usable while a replacement is pending', async () => {
    api.get.mockResolvedValue(emailState({ verified, pending }));
    renderSettings();
    await screen.findByText('Verified: ' + verified);
    screen.getByText('Pending verification: ' + pending);
    screen.getByText(/current verified email remains usable for sign-in/);
    expect(resend().hasAttribute('disabled')).toBe(false);
  });

  it.each([
    { verified: null, pending: null },
    { verified: null, pending },
    { verified, pending },
  ])('keeps send and applicable resend disabled when delivery is off (%j)', async (addresses) => {
    api.get.mockResolvedValue(emailState({ ...addresses, available: false }));
    renderSettings();
    await screen.findByText(/Verification and password reset emails cannot be sent/);
    if (addresses.verified) screen.getByText(/current verified email remains usable for sign-in/);
    expect(send().hasAttribute('disabled')).toBe(true);
    if (addresses.pending) expect(resend().hasAttribute('disabled')).toBe(true);
    else expect(screen.queryByRole('button', { name: 'Resend verification' })).toBeNull();
    fireEvent.submit(send().closest('form')!);
    expect(api.put).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });
});

it('announces status loading and errors and allows retry', async () => {
  api.get.mockRejectedValueOnce(new Error()).mockResolvedValueOnce(emailState());
  renderSettings();
  expect(screen.getByRole('status').textContent).toBe('Loading email status…');
  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('Email status unavailable.');
  expect(screen.queryByRole('button', { name: 'Send verification' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  await screen.findByText('No verified email.');
  expect(api.get).toHaveBeenCalledTimes(2);
});

it('submits an update, announces timing guidance, and refreshes into a resendable pending state', async () => {
  api.get.mockResolvedValueOnce(emailState()).mockResolvedValue(emailState({ pending }));
  api.put.mockResolvedValue({});
  api.post.mockResolvedValue({});
  renderSettings();
  await screen.findByText('No verified email.');
  const field = screen.getByRole('textbox', { name: 'New email' }) as HTMLInputElement;
  fireEvent.change(field, { target: { value: pending } });
  fireEvent.click(send());
  expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Check your email to verify your address. Each link expires after 24 hours. Wait one minute before resending.');
  expect(api.put).toHaveBeenCalledWith('/auth/email', { email: pending });
  await screen.findByText('Pending verification: ' + pending);
  expect(field.value).toBe('');
  fireEvent.click(resend());
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/auth/email/resend', {}));
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(3));
});

it('disables both actions during resend and announces the existing mutation error', async () => {
  api.get.mockResolvedValue(emailState({ pending }));
  let reject!: (error: unknown) => void;
  api.post.mockReturnValue(new Promise((_resolve, rejectRequest) => { reject = rejectRequest; }));
  renderSettings();
  await screen.findByText('Pending verification: ' + pending);
  fireEvent.click(resend());
  await waitFor(() => expect(resend().hasAttribute('disabled')).toBe(true));
  expect(send().hasAttribute('disabled')).toBe(true);
  reject({ isAxiosError: true, response: { data: { message: 'Email delivery unavailable; try again later' } } });
  expect((await screen.findByRole('alert')).textContent).toBe('Email delivery unavailable; try again later');
  expect(resend().hasAttribute('disabled')).toBe(false);
});
