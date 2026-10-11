import { it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { FieldCatalogue } from '../components/forms/FieldCatalogue';
import { FieldDefinitionEditor } from '../components/forms/FieldDefinitionEditor';
import { blankDefinition, definitionErrors, entityNames, filterDefinitions, moveOption, typeNames } from '../components/forms/fieldDefinitionUtils';
import { entities, types, type Definition } from '../components/forms/formSchema';
import { client } from '../api/client';
vi.mock('../api/client', () => ({ client: { post: vi.fn(), put: vi.fn() } }));
beforeEach(() => vi.clearAllMocks());
const sample = (): Definition => ({ ...blankDefinition(), id: 'saved-field', key: 'reference', label: 'Reference', version: 7, reportable: true });
function editor(initial = sample(), manage = true) {
  const onClose = vi.fn(), onSaved = vi.fn(async () => undefined);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}><FieldDefinitionEditor entity="customer" initial={initial} manage={manage} definitions={initial.id ? [initial] : []} onClose={onClose} onSaved={onSaved} /></QueryClientProvider>);
  return { onClose, onSaved };
}
it('names all six entities and thirteen types without adding capabilities', () => {
  expect(Object.keys(entityNames)).toEqual([...entities]); expect(Object.keys(typeNames).sort()).toEqual([...types].sort());
});
it('filters only the supplied catalogue and combines supported metadata', () => {
  const fields = [sample(), { ...sample(), id: 'old', key: 'old', label: 'Historic', status: 'archived' as const }];
  expect(filterDefinitions(fields, { search: 'reference', status: 'active', type: 'text', capability: 'reportable' })).toEqual([fields[0]]);
  expect(filterDefinitions(fields, { search: '', status: 'archived', type: '', capability: '' })).toEqual([fields[1]]);
});
it('catalogue permits inspection but no writes for a read-only manager', () => {
  const inspect = vi.fn(); render(<FieldCatalogue definitions={[sample()]} manage={false} onInspect={inspect} onEdit={vi.fn()} onAdd={vi.fn()} />);
  expect(screen.queryByRole('button', { name: 'Add field' })).toBeNull(); expect(screen.queryByRole('button', { name: 'Edit Reference' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Inspect Reference' })); expect(inspect).toHaveBeenCalledWith(sample());
  fireEvent.change(screen.getByLabelText('Search loaded field catalogue'), { target: { value: 'absent' } }); expect(screen.getByText('No matching fields')).toBeTruthy();
});
it('catalogue enforces the active creation limit even with a filtered view', () => {
  render(<FieldCatalogue definitions={Array.from({ length: 40 }, (_, index) => ({ ...sample(), id: String(index) }))} manage onInspect={vi.fn()} onEdit={vi.fn()} onAdd={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Add field' }).hasAttribute('disabled')).toBe(true);
});
it('validates choice lifecycle and default without coercing exact strings or false', () => {
  const field = { ...sample(), field_type: 'select' as const, options: [{ id: 'old', key: 'old', label: 'Old', status: 'archived' as const }], default_value: 'old' };
  expect(definitionErrors(field)).toHaveProperty('options'); expect(definitionErrors(field)).toHaveProperty('default');
  expect(definitionErrors({ ...sample(), field_type: 'number', default_value: '123456789012345678.123456' })).toEqual({});
  expect(definitionErrors({ ...sample(), field_type: 'checkbox', required: true, default_value: false })).toEqual({});
  expect(definitionErrors({ ...sample(), field_type: 'number', default_value: '1e6' })).toHaveProperty('default');
});
it('moving options retains their identities and does not mutate the source', () => {
  const options = [{ id: 'one' }, { id: 'two' }]; expect(moveOption(options, 1, -1).map(option => option.id)).toEqual(['two', 'one']); expect(options[0].id).toBe('one');
});
it('editor protects immutable identities and dirty cancellation', () => {
  const { onClose } = editor(); expect(screen.getByLabelText('Field key').hasAttribute('disabled')).toBe(true); expect(screen.getByLabelText('Field type').hasAttribute('disabled')).toBe(true);
  fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'Changed' } }); fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.getByRole('dialog').getAttribute('aria-labelledby')).toBeTruthy(); expect(screen.getByText('Discard unsaved changes?')).toBeTruthy(); expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Keep editing' })); expect((screen.getByLabelText('Field label') as HTMLInputElement).value).toBe('Changed');
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); fireEvent.click(screen.getByRole('button', { name: 'Discard changes' })); expect(onClose).toHaveBeenCalledTimes(1);
});
it('creation shows inline validation before any API write', () => {
  editor(blankDefinition()); fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'A field' } }); fireEvent.click(screen.getByRole('button', { name: 'Review field' }));
  expect(screen.getByLabelText('Field key').getAttribute('aria-invalid')).toBe('true'); expect(screen.getByText('Check the marked settings before reviewing.')).toBeTruthy(); expect(client.post).not.toHaveBeenCalled();
});
it('review submits the original version exactly once while pending', async () => {
  let complete!: (value: unknown) => void; vi.mocked(client.put).mockReturnValue(new Promise(resolve => { complete = resolve; }));
  const { onSaved } = editor(); fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'Changed' } }); fireEvent.click(screen.getByRole('button', { name: 'Review field' }));
  const save = screen.getByRole('button', { name: 'Save field' }); fireEvent.click(save); fireEvent.click(save);
  await waitFor(() => expect(client.put).toHaveBeenCalledTimes(1)); expect(client.put).toHaveBeenCalledWith('/forms/customer/definitions/saved-field', expect.objectContaining({ version: 7, key: 'reference', fieldType: 'text' }));
  expect(screen.getByRole('button', { name: 'Cancel' }).hasAttribute('disabled')).toBe(true); complete({}); await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
});
it('version conflict preserves the draft and never silently updates its version', async () => {
  vi.mocked(client.put).mockRejectedValue(new AxiosError('Layout changed', 'ERR_BAD_REQUEST', undefined, undefined, { status: 409, data: { message: 'Field changed; reload before saving' }, statusText: '', headers: {}, config: {} as never }));
  editor(); fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'Frozen draft' } }); fireEvent.click(screen.getByRole('button', { name: 'Review field' })); fireEvent.click(screen.getByRole('button', { name: 'Save field' }));
  await screen.findByRole('alert'); fireEvent.click(screen.getByRole('button', { name: 'Back to settings' })); expect((screen.getByLabelText('Field label') as HTMLInputElement).value).toBe('Frozen draft');
  expect(client.put).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ version: 7 }));
});
it('uncertain creation cannot be replayed', async () => {
  vi.mocked(client.post).mockRejectedValue(new Error('Response lost'));
  editor(blankDefinition()); fireEvent.change(screen.getByLabelText('Field key'), { target: { value: 'category' } }); fireEvent.change(screen.getByLabelText('Field label'), { target: { value: 'Category' } }); fireEvent.click(screen.getByRole('button', { name: 'Review field' })); fireEvent.click(screen.getByRole('button', { name: 'Save field' }));
  await screen.findByRole('alert'); expect(screen.getByRole('button', { name: 'Save field' }).hasAttribute('disabled')).toBe(true); expect(client.post).toHaveBeenCalledTimes(1);
});
