import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../pages/Dashboard';
import type { DashboardData } from '../components/analytics/contracts';
import { StatCard } from '../components/ui/WorkspacePrimitives';
import Button from '../components/ui/Button';
import { client } from '../api/client';
import { useAppStore } from '../store/useAppStore';

vi.mock('../api/client', () => ({ client: { get: vi.fn(), put: vi.fn() } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const widgets = [
  { key: 'services', label: 'Available services', value: '0', description: 'Selected branch services', path: '/services' },
  { key: 'inventory', label: 'Low-stock items', value: '5', description: 'Selected branch stock', path: '/inventory' },
];
const summary: DashboardData = { widgets, layout: { order: [], hidden: [], version: 3 }, timezone: 'Asia/Kolkata', businessDate: '2026-10-13' };
function mount(data = summary, permissions = ['services.read'], fail = false) {
  useAppStore.setState({ user: { id: 'qa-premium', name: 'QA member', permissions } as never, activeTenantId: 'qa', activeBranchId: 'main', entitlements: null, isPlatformOperator: false });
  if (fail) vi.mocked(client.get).mockRejectedValue(new Error('Disposable outage'));
  else vi.mocked(client.get).mockResolvedValue({ data: { data } });
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><Dashboard /></MemoryRouter></QueryClientProvider>);
}
it('keeps zero metrics and server descriptions, excluding a widget without entitlement', async () => {
  mount(); await screen.findByRole('heading', { name: 'Available services' });
  expect(screen.getByText('0')).toBeTruthy(); expect(screen.getByText('Selected branch services')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Low-stock items' })).toBeNull();
  expect(screen.queryByRole('region', { name: 'Attention needed' })).toBeNull();
});
it('shows restricted and all-hidden states without inventing zero values', async () => {
  const view = mount(summary, []); await screen.findByText(/No metrics are available/); expect(screen.queryByText('0')).toBeNull();
  view.unmount(); mount({ ...summary, layout: { order: ['services'], hidden: ['services'], version: 3 } });
  await screen.findByText('All your widgets are hidden.'); fireEvent.click(screen.getByRole('button', { name: 'Choose visible widgets' }));
  expect(screen.getByRole('region', { name: 'Dashboard customization' })).toBeTruthy();
});
it('customization toggle controls a named region and preserves versioned order payload', async () => {
  mount(); await screen.findByRole('heading', { name: 'Available services' });
  const toggle = screen.getByRole('button', { name: 'Customize dashboard' });
  expect(toggle.getAttribute('aria-controls')).toBe('dashboard-customization');
  expect(screen.queryByRole('region', { name: 'Dashboard customization' })).toBeNull();
  fireEvent.click(toggle); expect(toggle.getAttribute('aria-expanded')).toBe('true');
  expect((screen.getByRole('button', { name: 'Move Available services up' }) as HTMLButtonElement).disabled).toBe(true);
  vi.mocked(client.put).mockResolvedValue({ data: {} });
  fireEvent.click(screen.getByRole('button', { name: 'Reset layout' }));
  await waitFor(() => expect(client.put).toHaveBeenCalledWith('/analytics/dashboard/layout', { order: [], hidden: [], version: 3 }));
});
it('failure retains permitted links without manufacturing metrics', async () => {
  mount(summary, ['services.read'], true);
  await screen.findByRole('button', { name: 'Retry activity' });
  expect(screen.getByRole('region', { name: 'Quick actions' })).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Workspace metrics' })).toBeNull();
});
it('stat icon is decorative and exact values and destinations remain unchanged', () => {
  render(<MemoryRouter><StatCard label="Exact balance" value="₹9007199254740993.99" description="Existing server scope" to="/ledger" icon={<svg data-testid="stat-icon" />} /></MemoryRouter>);
  expect(screen.getByRole('heading', { name: 'Exact balance' })).toBeTruthy();
  expect(screen.getByText('₹9007199254740993.99')).toBeTruthy();
  expect(screen.getByRole('link').getAttribute('href')).toBe('/ledger');
  expect(screen.getByTestId('stat-icon').parentElement?.getAttribute('aria-hidden')).toBe('true');
});
it('ghost and busy button preserve labels, disabled behavior and decorative spinner', () => {
  const click = vi.fn(); const view = render(<Button variant="ghost" onClick={click}>Open details</Button>);
  const button = screen.getByRole('button', { name: 'Open details' }); expect(button.className).toContain('workspace-ghost-button');
  fireEvent.click(button); expect(click).toHaveBeenCalledOnce();
  view.rerender(<Button isLoading onClick={click}>Open details</Button>);
  expect((screen.getByRole('button', { name: 'Processing...' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('button').querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
});
