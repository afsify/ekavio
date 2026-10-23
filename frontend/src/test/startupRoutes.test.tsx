import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { WorkspaceStartup } from '../components/layout/WorkspaceStartup';
import App from '../App';

// Route-boundary tests deliberately replace page contents, not the real guards.
vi.mock('../components/layout/AdminLayout', () => ({ AdminLayout: ({ children }: { children: React.ReactNode }) => <section aria-label="Private workspace">{children}</section> }));
vi.mock('../components/layout/PublicLayout', () => ({ PublicLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock('../pages/Landing/LandingPage', () => ({ default: () => <h1>Public landing</h1> }));
vi.mock('../pages/Landing/PrivacyPage', () => ({ default: () => <h1>Public privacy</h1> }));
vi.mock('../pages/Login', () => ({ default: () => <h1>Sign in form</h1> }));
vi.mock('../pages/Identity/AccountActionPage', () => ({ default: () => <h1>Account action</h1> }));
vi.mock('../pages/Onboarding/OnboardingPage', () => ({ default: () => <h1>Onboarding action</h1> }));
vi.mock('../pages/Dashboard', () => ({ default: () => <h1>Private dashboard</h1> }));
vi.mock('../store/useSocketStore', () => ({ useSocketStore: { getState: () => ({ disconnectSocket: vi.fn() }) } }));

beforeEach(() => {
  useAppStore.getState().clearSession();
  useAppStore.setState({ isBootstrapping: true, startupError: null });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('public and protected startup boundaries', () => {
  it.each([
    ['/', 'Public landing'], ['/privacy', 'Public privacy'], ['/login', 'Sign in form'],
    ['/forgot-password', 'Account action'], ['/reset-password', 'Account action'],
    ['/verify-email', 'Account action'], ['/accept-invitation', 'Account action'], ['/onboarding', 'Onboarding action'],
  ])('renders %s while session verification is pending', async (path, heading) => {
    window.history.replaceState(null, '', path);
    render(<App />);
    expect(await screen.findByRole('heading', { name: heading })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Private workspace' })).toBeNull();
    expect(useAppStore.getState().isAuthenticated).toBe(false);
  });
  it('does not mount the workspace until authorization completes', async () => {
    window.history.replaceState(null, '', '/dashboard'); render(<App />);
    expect(await screen.findByRole('heading', { name: 'Checking your session' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Private workspace' })).toBeNull();
    act(() => useAppStore.setState({ isBootstrapping: false, isAuthenticated: true }));
    expect(await screen.findByRole('heading', { name: 'Private dashboard' })).toBeTruthy();
  });
  it('redirects genuinely anonymous protected sessions to the existing login route', async () => {
    useAppStore.setState({ isBootstrapping: false });
    window.history.replaceState(null, '', '/dashboard'); render(<App />);
    expect(await screen.findByRole('heading', { name: 'Sign in form' })).toBeTruthy();
    expect(window.location.pathname).toBe('/login');
  });
  it('keeps the landing route public even when authenticated', async () => {
    useAppStore.setState({ isAuthenticated: true, isBootstrapping: false });
    window.history.replaceState(null, '', '/'); render(<App />);
    expect(await screen.findByRole('heading', { name: 'Public landing' })).toBeTruthy();
    expect(window.location.pathname).toBe('/');
  });
  it('announces connecting only after the measured 1.5 second threshold', () => {
    vi.useFakeTimers(); render(<MemoryRouter><WorkspaceStartup /></MemoryRouter>);
    expect(screen.getByRole('status').textContent).toContain('Checking your session');
    act(() => vi.advanceTimersByTime(1499));
    expect(screen.queryByText('Connecting to your workspace')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole('status').textContent).toContain('Connecting to your workspace');
  });
  it('shows bounded recovery without rendering private content or claiming expiry', async () => {
    useAppStore.setState({ isBootstrapping: false, startupError: 'unavailable' });
    const retry = vi.fn().mockResolvedValue(undefined);
    const original = useAppStore.getState().bootstrapSession;
    useAppStore.setState({ bootstrapSession: retry });
    try {
      window.history.replaceState(null, '', '/dashboard'); render(<App />);
      const button = await screen.findByRole('button', { name: 'Try again' });
      button.focus(); expect(document.activeElement).toBe(button);
      fireEvent.click(button); expect(retry).toHaveBeenCalledTimes(1);
      expect(screen.queryByRole('region', { name: 'Private workspace' })).toBeNull();
      expect(screen.getByRole('status').textContent).toContain('does not mean your session has expired');
    } finally { useAppStore.setState({ bootstrapSession: original }); }
  });
});
