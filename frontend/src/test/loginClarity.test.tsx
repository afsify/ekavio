import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import Login from '../pages/Login';

const login = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
vi.mock('../hooks/useAuth', () => ({ useLogin: () => login }));

const guidance = 'Use your phone number or verified email address to sign in.';
const renderLogin = () => render(<MemoryRouter><Login /></MemoryRouter>);

beforeEach(() => {
  login.mutate.mockReset();
  login.isPending = false;
});

it('keeps guidance associated with the identifier alongside an empty-field error', async () => {
  renderLogin();
  const identifier = screen.getByRole('textbox', { name: 'Phone or email', description: guidance });
  expect(identifier.getAttribute('type')).toBe('text');
  expect(identifier.getAttribute('autocomplete')).toBe('username');
  fireEvent.change(identifier, { target: { value: '  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In to Ekavio' }));
  await screen.findByText('Phone or email is required');
  expect(screen.getByRole('textbox', { description: 'Phone or email is required ' + guidance })).toBe(identifier);
  expect(login.mutate).not.toHaveBeenCalled();
});

it('preserves identifier trimming, password masking and recovery navigation', async () => {
  renderLogin();
  const identifier = screen.getByLabelText('Phone or email');
  const password = screen.getByLabelText('Password');
  expect(password.getAttribute('type')).toBe('password');
  expect(password.getAttribute('autocomplete')).toBe('current-password');
  expect(screen.getByRole('link', { name: 'Forgot password?' }).getAttribute('href')).toBe('/forgot-password');
  fireEvent.change(identifier, { target: { value: '  qa@example.invalid  ' } });
  fireEvent.change(password, { target: { value: 'synthetic test input' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign In to Ekavio' }));
  await waitFor(() => expect(login.mutate).toHaveBeenCalledWith(
    { identifier: 'qa@example.invalid', password: 'synthetic test input' }, expect.any(Object),
  ));
});

it('keeps the guidance visible and disables both inputs and submit while signing in', () => {
  login.isPending = true;
  renderLogin();
  expect(screen.getByRole('textbox', { description: guidance }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByLabelText('Password').hasAttribute('disabled')).toBe(true);
  const submit = screen.getByRole('button', { name: 'Processing...' });
  expect(submit.hasAttribute('disabled')).toBe(true);
  expect(submit.getAttribute('aria-busy')).toBe('true');
});
