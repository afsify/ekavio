import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SettingsHub } from '../components/settings/SettingsHub';
import SettingsPage from '../pages/Settings/SettingsPage';
import { FieldPlacementCatalogue } from '../components/forms/FieldPlacementCatalogue';
import { LayoutPreview } from '../components/forms/LayoutPreview';
import { blankDefinition } from '../components/forms/fieldDefinitionUtils';
import { fieldTypeGuidance } from '../components/forms/fieldTypeGuidance';
import { types, type FormSchema } from '../components/forms/formSchema';
import { useAppStore } from '../store/useAppStore';
import { client } from '../api/client';
vi.mock('../api/client', () => ({ client: { get: vi.fn(), put: vi.fn(), post: vi.fn() } }));
beforeEach(() => { vi.clearAllMocks(); useAppStore.setState({ user: { id: 'qa', name: 'QA member', permissions: [], memberships: [{ organizationId: 'org', orgName: 'QA workspace', branches: [] }] } as never, activeTenantId: 'org', activeBranchId: 'branch', isPlatformOperator: false, entitlements: null }); });
function mountHub() { return render(<MemoryRouter><SettingsHub /></MemoryRouter>); }
it('ordinary employees get personal destinations but no unauthorized configuration cards', () => {
  mountHub(); expect(screen.getAllByRole('link')).toHaveLength(4);
  expect(screen.getByRole('link', { name: /My Profile/ }).getAttribute('href')).toBe('/settings?section=profile');
  expect(screen.queryByRole('link', { name: /Data & Forms/ })).toBeNull(); expect(screen.queryByRole('link', { name: /Billing/ })).toBeNull();
  expect(screen.getByText(/No organization configuration destinations/)).toBeTruthy(); expect(client.get).not.toHaveBeenCalled();
});
it('owner/admin grants alone do not activate CRM or HR configuration', () => {
  useAppStore.setState({ user: { ...useAppStore.getState().user!, permissions: ['organization.read', 'organization.manage', 'crm.read', 'crm.manage', 'hr_plus.manage'] } });
  mountHub(); expect(screen.getByRole('link', { name: /Organization information/ })).toBeTruthy();
  expect(screen.queryByRole('link', { name: /CRM configuration/ })).toBeNull(); expect(screen.queryByRole('link', { name: /HR configuration/ })).toBeNull();
});
it('module configuration requires existing navigation authority and independent management grants', () => {
  useAppStore.setState({ user: { ...useAppStore.getState().user!, permissions: ['crm.read', 'crm.manage', 'hr_plus.manage', 'services.manage'] }, entitlements: { modules: [{ key: 'crm', enabled: true }, { key: 'hr_plus', enabled: true }] } as never });
  mountHub(); expect(screen.getByRole('link', { name: /CRM configuration/ }).getAttribute('href')).toBe('/crm'); expect(screen.getByRole('link', { name: /HR configuration/ })).toBeTruthy();
  expect(screen.queryByRole('link', { name: /Services configuration/ })).toBeNull();
});
it('read-only field configuration is clearly distinguished without inventing manage access', () => {
  useAppStore.setState({ user: { ...useAppStore.getState().user!, permissions: ['fields.read'] } }); mountHub();
  expect(within(screen.getByRole('link', { name: /Data & Forms/ })).getByText('View only')).toBeTruthy();
  expect(screen.queryByText('Management access')).toBeNull();
});
it('field managers retain the canonical Data & Forms route without an unmerged entity query dependency', () => {
  useAppStore.setState({ user: { ...useAppStore.getState().user!, permissions: ['fields.read', 'fields.manage'] } }); mountHub();
  expect(screen.getByRole('link', { name: /Data & Forms/ }).getAttribute('href')).toBe('/custom-fields'); expect(screen.getByText('Management access')).toBeTruthy();
});
it('searches authorized metadata locally, announces empty results and resets without an API call', () => {
  mountHub(); fireEvent.change(screen.getByRole('searchbox', { name: 'Search settings' }), { target: { value: 'billing' } });
  expect(screen.getByRole('heading', { name: 'No matching settings' })).toBeTruthy(); expect(screen.queryByRole('link')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Clear settings search' })); expect(screen.getAllByRole('link')).toHaveLength(4);
  expect(client.get).not.toHaveBeenCalled(); expect(client.put).not.toHaveBeenCalled();
});
it('revoked authority removes restricted destinations and resets the old scope search', () => {
  useAppStore.setState({ user: { ...useAppStore.getState().user!, permissions: ['fields.read'] } }); mountHub();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search settings' }), { target: { value: 'Data' } });
  act(() => useAppStore.setState({ user: { ...useAppStore.getState().user!, permissions: [] } }));
  expect(screen.queryByRole('link', { name: /Data & Forms/ })).toBeNull(); expect(screen.getByRole('searchbox', { name: 'Search settings' })).toHaveProperty('value', '');
});
it('workspace replacement uses new server-returned context and never retains the old label/search', () => {
  mountHub(); fireEvent.change(screen.getByRole('searchbox', { name: 'Search settings' }), { target: { value: 'security' } });
  act(() => useAppStore.setState({ activeTenantId: 'new', user: { ...useAppStore.getState().user!, memberships: [{ organizationId: 'new', orgName: 'QA new workspace', branches: [] }] as never } }));
  expect(screen.queryByText('QA workspace')).toBeNull(); expect(screen.getByText('QA new workspace')).toBeTruthy(); expect(screen.getByRole('searchbox', { name: 'Search settings' })).toHaveProperty('value', '');
});
it('organization readers can reach canonical administration without management authority', () => {
  useAppStore.setState({ user: { ...useAppStore.getState().user!, permissions: ['organization.read'] } });
  render(<QueryClientProvider client={new QueryClient()}><MemoryRouter initialEntries={['/settings?section=organization']}><SettingsPage /></MemoryRouter></QueryClientProvider>);
  expect(screen.getByRole('link', { name: 'Open organization administration' }).getAttribute('href')).toBe('/admin');
});
const schema = (): FormSchema => ({ entity: 'customer', version: 3, builtins: [{ key: 'name', label: 'Customer name', required: true }], definitions: [{ ...blankDefinition(), id: 'note', key: 'note', label: 'QA note' }], sections: [{ id: 'general', title: 'General', fields: [{ key: 'name', visible: true }, { key: 'note', visible: true }] }] });
it('placement discovery groups canonical/custom metadata and never changes the supplied layout', () => {
  const source = schema(), before = JSON.stringify(source), locate = vi.fn(); render(<FieldPlacementCatalogue schema={source} sections={source.sections} onLocate={locate} />);
  expect(screen.getByRole('region', { name: 'Built-in fields' })).toBeTruthy(); expect(screen.getByRole('region', { name: 'Custom fields' })).toBeTruthy();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search field placements' }), { target: { value: 'required' } });
  expect(screen.queryByRole('button', { name: 'Find placement for QA note' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Find placement for Customer name' })); expect(locate).toHaveBeenCalledWith('name'); expect(JSON.stringify(source)).toBe(before);
});
it('source and text discovery combine, with a meaningful empty state and reset', () => {
  const source = schema(); render(<FieldPlacementCatalogue schema={source} sections={source.sections} onLocate={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Placement source'), { target: { value: 'Custom' } });
  expect(screen.queryByRole('button', { name: 'Find placement for Customer name' })).toBeNull();
  fireEvent.change(screen.getByRole('searchbox', { name: 'Search field placements' }), { target: { value: 'missing' } }); expect(screen.getByText(/No matching placements/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Clear placement filters' })); expect(screen.getByRole('button', { name: 'Find placement for Customer name' })).toBeTruthy();
});
it('preview width switching retains disposable samples and never writes records or layouts', () => {
  const source = schema(); render(<LayoutPreview schema={source} sections={source.sections} mode="desktop" dirty onClose={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('QA note'), { target: { value: 'Synthetic sample' } }); fireEvent.click(screen.getByRole('button', { name: 'Mobile width' }));
  expect(screen.getByRole('dialog').textContent).toContain('Mobile form preview'); expect(screen.getByLabelText('QA note')).toHaveProperty('value', 'Synthetic sample');
  fireEvent.click(screen.getByRole('button', { name: 'Clear preview samples' })); expect(screen.getByLabelText('QA note')).toHaveProperty('value', '');
  expect(client.put).not.toHaveBeenCalled(); expect(client.post).not.toHaveBeenCalled();
});
it('all existing field types receive explanations without adding a type or capability', () => { expect(Object.keys(fieldTypeGuidance).sort()).toEqual([...types].sort()); });
