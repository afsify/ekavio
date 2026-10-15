import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ThemeModeChoice, ThemeSwitch } from '../components/ui/ThemeControl';
import { ThemeProvider } from '../components/ThemeProvider';
import { useAppStore } from '../store/useAppStore';
import { client } from '../api/client';
vi.mock('../api/client', () => ({ client: { put: vi.fn() } }));
beforeEach(() => { useAppStore.setState({ user: null, theme: { mode: 'light', primaryColor: '#087443' } }); localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });

it('direct switch selects explicit Light/Dark and retains the accent and local persistence', () => {
  render(<ThemeSwitch/>); const control = screen.getByRole('switch', { name: 'Dark appearance' });
  expect(control.getAttribute('aria-checked')).toBe('false'); fireEvent.click(control);
  expect(control.getAttribute('aria-checked')).toBe('true'); expect(useAppStore.getState().theme).toEqual({ mode: 'dark', primaryColor: '#087443' });
  expect(JSON.parse(localStorage.getItem('ekavio-ui-preferences')!)).toEqual({ mode: 'dark', primaryColor: '#087443' });
  fireEvent.click(control); expect(useAppStore.getState().theme.mode).toBe('light');
});
it('System follows live OS changes, announces System and does not save an explicit preference on OS change', () => {
  const listeners = new Set<() => void>();
  const media = { matches: false, addEventListener: (_event: string, listener: () => void) => listeners.add(listener), removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener) };
  vi.spyOn(window, 'matchMedia').mockReturnValue(media as unknown as MediaQueryList);
  useAppStore.setState({ theme: { mode: 'system', primaryColor: '#087443' } });
  render(<ThemeProvider><ThemeSwitch/></ThemeProvider>); const control = screen.getByRole('switch', { name: 'Dark appearance' });
  expect(screen.getByText('System')).toBeTruthy(); expect(document.getElementById(control.getAttribute('aria-describedby')!)?.textContent).toContain('System is active');
  act(() => { media.matches = true; listeners.forEach(listener => listener()); });
  expect(document.documentElement.dataset.theme).toBe('dark'); expect(control.getAttribute('aria-checked')).toBe('true'); expect(useAppStore.getState().theme.mode).toBe('system'); expect(client.put).not.toHaveBeenCalled();
  act(() => { media.matches = false; listeners.forEach(listener => listener()); });
  expect(control.getAttribute('aria-checked')).toBe('false'); fireEvent.click(control); expect(useAppStore.getState().theme.mode).toBe('dark');
  cleanup(); expect(listeners.size).toBe(0);
});
it('three native radio modes retain accessible selected state in both Settings and account presentation', () => {
  render(<><ThemeModeChoice/><ThemeModeChoice legend="Appearance"/></>);
  const systems = screen.getAllByRole('radio', { name: 'System' }); fireEvent.click(systems[0]);
  expect(systems.every(input => (input as HTMLInputElement).checked)).toBe(true);
  expect(screen.getAllByRole('radio', { name: 'Light' }).every(input => !(input as HTMLInputElement).checked)).toBe(true);
});
it('signed-in theme choice delegates account persistence to the existing serialized store', async () => {
  vi.mocked(client.put).mockResolvedValue({ data: {} }); useAppStore.setState({ user: { id: 'qa-theme', tenantId: 'qa-org', role: 'staff' } });
  render(<ThemeModeChoice/>); fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
  await waitFor(() => expect(client.put).toHaveBeenCalledWith('/auth/preferences', { mode: 'dark', primaryColor: '#087443' }));
  expect(useAppStore.getState().theme.primaryColor).toBe('#087443');
});
it('selecting the current mode retries account synchronization without duplicating changed-mode saves', async () => {
  vi.mocked(client.put).mockResolvedValue({ data: {} }); useAppStore.setState({ user: { id: 'qa-theme', tenantId: 'qa-org', role: 'staff' } });
  render(<ThemeModeChoice/>); fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
  await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('radio', { name: 'Dark' }));
  await waitFor(() => expect(client.put).toHaveBeenCalledTimes(2));
});
