import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { rupeesToPaise, paiseToRupees } from '../utils/money';
import { normalizePhone } from '../utils/phone';
import { migrateAndClearLegacyAuthStorage, saveThemePreference } from '../store/sessionPersistence';
import { visibleDestinations } from '../components/layout/navigation';
import { EmptyState } from '../components/ui/EmptyState';
import { PhoneInput } from '../components/ui/PhoneInput';
import { ThemeProvider } from '../components/ThemeProvider';
import SettingsPage from '../pages/Settings/SettingsPage';
import { useAppStore } from '../store/useAppStore';
import { client } from '../api/client';

describe('exact presentation money', () => {
  it.each([['0','0'],['1','100'],['12.05','1205'],['99999999999.99','9999999999999']])('converts %s exactly', (rupees, paise) => { expect(rupeesToPaise(rupees)).toBe(paise); expect(paiseToRupees(paise)).toBe(`${rupees.split('.')[0]}.${(rupees.split('.')[1] ?? '').padEnd(2,'0')}`); });
  it.each(['-1','1.001','1e2','1,000','NaN','01','100000000000',''])('rejects invalid %s', (value) => expect(rupeesToPaise(value)).toBeNull());
});
it('normalizes international and Indian phones, rejecting incomplete values', () => { expect(normalizePhone('9876543210')).toBe('+919876543210'); expect(normalizePhone('+442079460018')).toBe('+442079460018'); expect(normalizePhone('12')).toBeUndefined(); });
it('phone wrapper has a country selector, read-only calling code, and normalized output', () => { const change = vi.fn(); render(<PhoneInput label="Contact phone" value="" onChange={change} />); expect(screen.getByLabelText('Contact phone country')).toBeTruthy(); expect(screen.getByLabelText('Calling code').textContent).toBe('+91'); fireEvent.change(screen.getByLabelText('Contact phone', { exact: true }), { target: { value: '9876543210' } }); expect(change).toHaveBeenCalledWith('+919876543210'); });
it('navigation separately filters permissions, entitlements, and platform status', () => {
  expect(visibleDestinations([], null, false).map((item) => item.path)).toEqual(['/dashboard','/settings','/help']);
  expect(visibleDestinations(['queue.read'], null, false).some((item) => item.path === '/queue')).toBe(false);
  expect(visibleDestinations([], null, true).some((item) => item.path === '/commercial/requests')).toBe(true);
  expect(visibleDestinations(['corporate.manage'], null, false).some((item) => item.path === '/corporate')).toBe(false);
});
it('storage keeps only valid preferences and safely handles denied storage', () => { localStorage.clear(); localStorage.setItem('token', 'obsolete'); localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode: 'system', primaryColor: '#4F46E5' })); expect(migrateAndClearLegacyAuthStorage(localStorage)?.mode).toBe('system'); expect(localStorage.getItem('token')).toBeNull(); const denied = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } }; expect(migrateAndClearLegacyAuthStorage(denied)).toBeUndefined(); expect(() => saveThemePreference(denied, { mode: 'light', primaryColor: '#4F46E5' })).not.toThrow(); });
it('System theme reacts live and removes its listener', () => {
  let listener = () => {};
  const media = { matches: false, addEventListener: vi.fn((_event, callback) => { listener = callback; }), removeEventListener: vi.fn() };
  vi.mocked(window.matchMedia).mockReturnValue(media as unknown as MediaQueryList);
  useAppStore.setState({ theme: { mode: 'system', primaryColor: '#4F46E5' } });
  const view = render(<ThemeProvider><p>Content</p></ThemeProvider>);
  expect(document.documentElement.dataset.theme).toBe('light');
  act(() => { media.matches = true; listener(); }); expect(document.documentElement.dataset.theme).toBe('dark');
  view.unmount(); expect(media.removeEventListener).toHaveBeenCalled();
});
it('preference migration strips unknown fields instead of retaining credentials', () => {
  localStorage.clear();
  localStorage.setItem('ekavio-ui-preferences', JSON.stringify({ mode: 'light', primaryColor: '#4F46E5', accessToken: crypto.randomUUID(), organizationId: crypto.randomUUID() }));
  expect(migrateAndClearLegacyAuthStorage(localStorage)).toEqual({ mode: 'light', primaryColor: '#4F46E5' });
  expect(Object.keys(JSON.parse(localStorage.getItem('ekavio-ui-preferences')!))).toEqual(['mode', 'primaryColor']);
});
it('empty state provides a navigable next action', () => { render(<MemoryRouter><EmptyState title="No customers yet" description="Create a customer." action="Create Customer" to="/customers" /></MemoryRouter>); expect(screen.getByRole('link', { name: 'Create Customer' }).getAttribute('href')).toBe('/customers'); });
it('Settings exposes personal sections without organization-admin permission', () => { vi.spyOn(client, 'get').mockResolvedValue({ data: { data: { verified: null, pending: null, available: false } } }); useAppStore.setState({ user: { id: 'test-user', tenantId: 'test-workspace', role: 'staff', name: 'Test Member', permissions: [] } }); render(<QueryClientProvider client={new QueryClient()}><MemoryRouter><SettingsPage /></MemoryRouter></QueryClientProvider>); expect(screen.getByRole('button', { name: 'My Profile' })).toBeTruthy(); fireEvent.click(screen.getByRole('button', { name: 'Appearance' })); expect(screen.getByRole('radio', { name: 'System' })).toBeTruthy(); fireEvent.click(screen.getByRole('button', { name: 'Organization' })); expect(screen.queryByRole('link', { name: 'Manage Staff' })).toBeNull(); });
