import { it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Link } from 'react-router-dom';
import { AxiosError } from 'axios';
import { FormLayoutStudio } from '../components/forms/FormLayoutStudio';
import { LayoutPreview } from '../components/forms/LayoutPreview';
import { OperationForm } from '../components/ui/OperationForm';
import { cloneSections, layoutChanges, layoutErrors, sameLayout, startLayoutDraft } from '../components/forms/layoutDraft';
import { blankDefinition } from '../components/forms/fieldDefinitionUtils';
import type { FormSchema } from '../components/forms/formSchema';
import { currentLayoutAuthority, useLayoutStudio } from '../hooks/useLayoutStudio';
import { useAppStore } from '../store/useAppStore';
import { client } from '../api/client';
vi.mock('../api/client', () => ({ client: { put: vi.fn(), post: vi.fn() } }));
const schema = (): FormSchema => ({ entity: 'customer', version: 7, builtins: [{ key: 'name', label: 'Customer name', required: true }], definitions: [{ ...blankDefinition(), id: 'field', key: 'note', label: 'QA note' }], sections: [{ id: 'main', title: 'General', fields: [{ key: 'name', visible: true }, { key: 'note', visible: true }] }] });
beforeEach(() => { vi.clearAllMocks(); useAppStore.setState({ user: { id: 'qa-user', permissions: ['fields.read', 'fields.manage'] } as never, activeTenantId: 'qa-org', activeBranchId: 'qa-branch' }); });
it('shared review rejects Escape immediately after confirmation before pending props commit', () => {
  const confirm = vi.fn(), close = vi.fn();
  render(<OperationForm open title="QA review" review={<p>Disposable facts</p>} valid busy={false} dirty confirmLabel="Confirm QA" onConfirm={confirm} onClose={close}><p>Disposable editor</p></OperationForm>);
  fireEvent.click(screen.getByRole('button', { name: /^Review$/ }));
  fireEvent.click(screen.getByRole('button', { name: /^Confirm QA$/ }));
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.getByRole('dialog').textContent).toContain('Review · QA review');
  expect(screen.queryByText('Discard unsaved changes?')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /^Confirm QA$/ }));
  expect(confirm).toHaveBeenCalledTimes(1); expect(close).not.toHaveBeenCalled();
});
it('captures an independent schema, authority and version before edits', () => {
  const initial = schema(), draft = startLayoutDraft(initial, 'authority'); initial.version = 9; initial.sections[0].fields[0].visible = false;
  expect(draft.schema.version).toBe(7); expect(draft.original[0].fields[0].visible).toBe(true); expect(draft.authority).toBe('authority');
  draft.sections[0].title = 'Draft'; expect(draft.original[0].title).toBe('General');
});
it('compares ordered layout semantics, not object property order or optional defaults', () => {
  const a = schema().sections, b = cloneSections(a); expect(sameLayout(a, b)).toBe(true);
  b[0].fields.reverse(); expect(sameLayout(a, b)).toBe(false); b[0].fields.reverse(); b[0].fields[1].visible = false; expect(sameLayout(a, b)).toBe(false);
});
it('enforces required placement, empty archival and bounded sections', () => {
  const s = schema(), sections = cloneSections(s.sections); sections[0].fields[0].visible = false; expect(layoutErrors(s, sections)).toContain('Customer name is required and must stay placed and visible.');
  sections[0].status = 'archived'; expect(layoutErrors(s, sections)).toContain('Move all fields before archiving a section.');
  expect(layoutErrors(s, Array.from({ length: 21 }, () => s.sections[0]))).toContain('Use 1–20 sections, including retained archived sections.');
  expect(layoutErrors(s, [{ ...s.sections[0], fields: Array.from({ length: 101 }, () => s.sections[0].fields[0]) }])).toContain('Use at most 100 placements per section.');
});
it('reports actual local section/placement/visibility changes', () => {
  const s = schema(), next = cloneSections(s.sections); next[0].title = 'Details'; next[0].fields[1].visible = false;
  expect(layoutChanges(s.sections, next, s)).toEqual(['Rename section: General → Details', 'Hide QA note; stored values are preserved']);
});
function mount(initial = schema(), manage = true) {
  const refresh = vi.fn(async () => undefined);
  function Harness({ value }: { value: FormSchema }) { const studio = useLayoutStudio(value, currentLayoutAuthority(), manage, refresh); return <><Link to="/settings">Leave studio</Link><FormLayoutStudio studio={studio} manage={manage} /></>; }
  const wrap = (value: FormSchema) => <QueryClientProvider client={cache}><MemoryRouter><Harness value={value} /></MemoryRouter></QueryClientProvider>;
  const cache = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const result = render(wrap(initial)); return { ...result, refresh, replace: (value: FormSchema) => result.rerender(wrap(value)) };
}
const changeTitle = (value = 'QA revised') => fireEvent.change(screen.getByLabelText('Section 1 title'), { target: { value } });
const confirmSave = () => { fireEvent.click(screen.getByRole('button', { name: 'Save layout' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm layout save' })); };
it('layout review rejects Escape immediately after confirmation before pending notification', () => {
  vi.mocked(client.put).mockReturnValue(new Promise(() => undefined)); mount(); changeTitle(); confirmSave();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.getByRole('dialog').textContent).toContain('Review layout changes');
});
it('disables unchanged save and restores the original snapshot after reviewed discard', () => {
  const view = mount(); expect(screen.getByRole('button', { name: 'Save layout' }).hasAttribute('disabled')).toBe(true); changeTitle();
  view.replace({ ...schema(), version: 8, sections: [{ ...schema().sections[0], title: 'Server winner' }] });
  fireEvent.click(screen.getByRole('button', { name: 'Discard layout draft' })); fireEvent.click(screen.getByRole('button', { name: 'Discard and continue' }));
  expect((screen.getByLabelText('Section 1 title') as HTMLInputElement).value).toBe('General'); expect(screen.getByRole('button', { name: 'Save layout' }).hasAttribute('disabled')).toBe(true);
});
it('moves and archives only eligible empty sections, preserving required visibility', () => {
  mount(); fireEvent.click(screen.getByRole('button', { name: 'Add section' }));
  expect(screen.getByLabelText('Section 2 status').hasAttribute('disabled')).toBe(false); fireEvent.change(screen.getByLabelText('Section 2 status'), { target: { value: 'archived' } }); expect((screen.getByLabelText('Section 2 status') as HTMLSelectElement).value).toBe('archived'); fireEvent.change(screen.getByLabelText('Section 2 status'), { target: { value: 'active' } });
  fireEvent.change(screen.getByLabelText('Section for QA note'), { target: { value: (screen.getByLabelText('Section for QA note') as HTMLSelectElement).options[1].value } });
  expect(screen.getByLabelText('Section 2 status').hasAttribute('disabled')).toBe(true); expect(screen.getByLabelText('Visible (required)').hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Move section 2 up' })); expect((screen.getByLabelText('Section 1 title') as HTMLInputElement).value).toBe('New section');
});
it('submits the frozen original version once while pending, then refreshes', async () => {
  let done!: (value: unknown) => void; vi.mocked(client.put).mockReturnValue(new Promise(resolve => { done = resolve; }));
  const view = mount(); changeTitle(); view.replace({ ...schema(), version: 8 }); fireEvent.click(screen.getByRole('button', { name: 'Save layout' })); const submit = screen.getByRole('button', { name: 'Confirm layout save' }); fireEvent.click(submit); fireEvent.click(submit);
  await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1)); expect(client.put).toHaveBeenCalledWith('/forms/customer/layout', expect.objectContaining({ version: 7 }), expect.any(Object));
  expect(screen.getByRole('button', { name: 'Back to layout' }).hasAttribute('disabled')).toBe(true); done({}); await waitFor(() => expect(view.refresh).toHaveBeenCalledTimes(1));
});
function rejected(status: number) { return new AxiosError('Rejected', 'ERR_BAD_REQUEST', undefined, undefined, { status, data: { message: status === 409 ? 'Layout changed; reload before saving' : 'Validation rejected' }, statusText: '', headers: {}, config: {} as never }); }
for (const status of [400, 409]) it(`retains editable draft after server ${status} without rebasing`, async () => {
  vi.mocked(client.put).mockRejectedValue(rejected(status)); mount(); changeTitle(); confirmSave(); await waitFor(() => expect(screen.getByRole('button', { name: 'Back to layout' }).hasAttribute('disabled')).toBe(false));
  fireEvent.click(screen.getByRole('button', { name: 'Back to layout' })); expect((screen.getByLabelText('Section 1 title') as HTMLInputElement).value).toBe('QA revised');
  expect(client.put).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ version: 7 }), expect.any(Object));
});
it('blocks blind replay after uncertain write and offers explicit reload', async () => {
  vi.mocked(client.put).mockRejectedValue(new Error('Response lost')); const view = mount(); changeTitle(); confirmSave();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm layout save' }).hasAttribute('disabled')).toBe(true));
  fireEvent.click(screen.getByRole('button', { name: 'Back to layout' })); expect(screen.getByRole('button', { name: 'Save layout' }).hasAttribute('disabled')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Reload current layout' })); fireEvent.click(screen.getByRole('button', { name: 'Discard and continue' })); await waitFor(() => expect(view.refresh).toHaveBeenCalledTimes(1));
});
it('failed verification after an uncertain write keeps editing and reset locked', async () => {
  vi.mocked(client.put).mockRejectedValue(new Error('Response lost')); const view = mount(); view.refresh.mockRejectedValue(new Error('Read unavailable')); changeTitle(); confirmSave();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm layout save' }).hasAttribute('disabled')).toBe(true));
  fireEvent.click(screen.getByRole('button', { name: 'Back to layout' })); fireEvent.click(screen.getByRole('button', { name: 'Reload current layout' })); fireEvent.click(screen.getByRole('button', { name: 'Discard and continue' }));
  await waitFor(() => expect(screen.getByText(/Reload failed/)).toBeTruthy()); expect(screen.getByLabelText('Section 1 title').hasAttribute('disabled')).toBe(true); expect(screen.getByRole('button', { name: 'Reset default layout' }).hasAttribute('disabled')).toBe(true); expect(client.put).toHaveBeenCalledTimes(1);
});
it('reset reviews dirty consequences and delegates defaults to the server', async () => {
  vi.mocked(client.post).mockResolvedValue({}); mount(); changeTitle(); fireEvent.click(screen.getByRole('button', { name: 'Reset default layout' }));
  expect(screen.getByText(/You have unsaved changes. Confirming explicitly/)).toBeTruthy(); fireEvent.click(screen.getByRole('button', { name: 'Confirm default reset' }));
  await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1)); expect(client.post).toHaveBeenCalledWith('/forms/customer/layout/reset', expect.objectContaining({ version: 7, sections: [expect.objectContaining({ title: 'Reset request', fields: [] })] }), expect.any(Object));
});
it('read-only users inspect/preview without configuration actions', () => { mount(schema(), false); expect(screen.queryByRole('button', { name: 'Save layout' })).toBeNull(); expect(screen.getByLabelText('Section 1 title').hasAttribute('disabled')).toBe(true); });
it('guards route departure and retains the draft when cancelled', () => { mount(); changeTitle(); fireEvent.click(screen.getByRole('link', { name: 'Leave studio' })); expect(screen.getByRole('dialog').textContent).toContain('Discard unsaved layout'); fireEvent.click(screen.getByRole('button', { name: 'Keep layout draft' })); expect((screen.getByLabelText('Section 1 title') as HTMLInputElement).value).toBe('QA revised'); });
it('late write success after unmount cannot refresh or restore old context', async () => {
  let done!: (value: unknown) => void; vi.mocked(client.put).mockReturnValue(new Promise(resolve => { done = resolve; })); const view = mount(); changeTitle(); confirmSave(); await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1)); view.unmount(); useAppStore.setState({ activeTenantId: 'other-org' }); done({}); await new Promise(resolve => setTimeout(resolve, 20)); expect(view.refresh).not.toHaveBeenCalled();
});
it('preview samples are disposable and never invoke layout or record APIs', () => {
  const s = schema(), close = vi.fn(); const view = render(<LayoutPreview schema={s} sections={s.sections} mode="mobile" dirty onClose={close} />);
  fireEvent.change(screen.getByLabelText('QA note'), { target: { value: 'Disposable sample' } }); expect(client.put).not.toHaveBeenCalled(); expect(client.post).not.toHaveBeenCalled(); expect(s.definitions[0].default_value).toBeNull();
  view.unmount(); render(<LayoutPreview schema={s} sections={s.sections} mode="desktop" dirty={false} onClose={close} />); expect((screen.getByLabelText('QA note') as HTMLInputElement).value).toBe('');
});
it('hydrates new schema placements without using an untitled section as save authority', () => {
  const s = { ...schema(), sections: [] }; const draft = startLayoutDraft(s, 'qa'); expect(draft.original[0].title).toBe('General'); expect(layoutErrors(s, draft.sections)).toEqual([]); expect(s.sections).toEqual([]);
});
it('moves a saved field into the generated unplaced section on the first edit', () => {
  const s = schema(); s.sections[0].fields = [{ key: 'name', visible: true }]; mount(s);
  fireEvent.change(screen.getByLabelText('Section for Customer name'), { target: { value: 'unplaced' } });
  expect((screen.getByLabelText('Section for Customer name') as HTMLSelectElement).selectedOptions[0].textContent).toBe('Additional information'); expect(screen.getByRole('button', { name: 'Save layout' }).hasAttribute('disabled')).toBe(false);
});
it('a saved 20-section layout can place a new field without retaining an empty synthetic 21st section', () => {
  const s = schema(); s.sections = Array.from({ length: 20 }, (_, i) => ({ id: 'saved-' + i, title: 'Saved ' + i, fields: i === 0 ? [{ key: 'name', visible: true }] : [] })); mount(s);
  fireEvent.change(screen.getByLabelText('Section for QA note'), { target: { value: 'saved-0' } }); expect(screen.getAllByLabelText(/^Section \d+ title$/)).toHaveLength(20); expect(screen.getByRole('button', { name: 'Save layout' }).hasAttribute('disabled')).toBe(false);
});
for (const replacement of ['organization', 'branch', 'account', 'permissions'] as const) it(`forced ${replacement} replacement immediately isolates a dirty workspace`, async () => {
  const cache = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  function Workspace() { const studio = useLayoutStudio(schema(), currentLayoutAuthority(), true, async () => undefined); return <FormLayoutStudio studio={studio} manage />; }
  function Scoped() { const state = useAppStore(); const key = JSON.stringify([state.user?.id, state.activeTenantId, state.activeBranchId, state.user?.permissions]); return <Workspace key={key} />; }
  render(<QueryClientProvider client={cache}><MemoryRouter><Scoped /></MemoryRouter></QueryClientProvider>); changeTitle(); fireEvent.click(screen.getByRole('button', { name: 'Discard layout draft' }));
  const { user } = useAppStore.getState();
  if (replacement === 'organization') useAppStore.setState({ activeTenantId: 'replacement' });
  if (replacement === 'branch') useAppStore.setState({ activeBranchId: 'replacement' });
  if (replacement === 'account') useAppStore.setState({ user: user ? { ...user, id: 'replacement' } : { id: 'replacement', permissions: [] } as never });
  if (replacement === 'permissions') useAppStore.setState({ user: user ? { ...user, permissions: [] } : { id: 'qa-user', permissions: [] } as never });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull()); expect((screen.getByLabelText('Section 1 title') as HTMLInputElement).value).toBe('General'); expect(client.put).not.toHaveBeenCalled();
});
