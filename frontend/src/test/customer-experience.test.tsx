import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CustomerFormFields } from '../components/forms/CustomerFormFields';
import type { useDynamicForm } from '../hooks/useDynamicForm';
import type { FormSchema } from '../components/forms/formSchema';
import { blankCustomer, customerPhoneError } from '../utils/customerDraft';

afterEach(cleanup);
const schema: FormSchema = { entity: 'customer', version: 1, builtins: [{ key: 'name', label: 'name', required: true }, { key: 'phone', label: 'phone', required: false }, { key: 'notes', label: 'notes', required: false }, { key: 'status', label: 'status', required: false }], definitions: [{ id: 'qa-field', key: 'qa_note', label: 'QA field', help: 'Organization-defined help', field_type: 'text', status: 'active', required: true, searchable: false, filterable: false, reportable: false, default_value: null, version: 0, options: [] }], sections: [{ id: 'custom', title: 'Organization section', fields: [{ key: 'qa_note', visible: true }] }, { id: 'canonical', title: 'Essentials', fields: [{ key: 'name', visible: false }, { key: 'phone', visible: true }, { key: 'notes', visible: true }, { key: 'status', visible: true }] }] };
const fields = (overrides = {}) => ({ schema, values: {}, change: vi.fn(), ...overrides }) as unknown as ReturnType<typeof useDynamicForm>;
it('retains configured section order, required canonical visibility and dynamic validation', () => {
  render(<CustomerFormFields form={blankCustomer} setForm={vi.fn()} fields={fields()} />);
  expect(screen.getAllByRole('heading').map(node => node.textContent)).toEqual(['Organization section', 'Essentials']);
  expect((screen.getByLabelText('Customer name', { exact: true }) as HTMLInputElement).required).toBe(true);
  expect(screen.getByLabelText('QA field *').getAttribute('aria-invalid')).toBe('true');
  expect(screen.queryByRole('combobox', { name: 'Status' })).toBeNull();
});
it('announces blank canonical name after interaction without changing its draft', () => {
  const setForm = vi.fn(); render(<CustomerFormFields form={{ ...blankCustomer, name: ' ' }} setForm={setForm} fields={fields({ values: { qa_note: 'QA value' } })} />);
  const input = screen.getByLabelText('Customer name', { exact: true });
  expect(input.getAttribute('aria-invalid')).toBe('false'); fireEvent.blur(input);
  expect(input.getAttribute('aria-invalid')).toBe('true'); expect(screen.getByRole('alert').textContent).toBe('Enter a customer name.');
  expect(setForm).not.toHaveBeenCalled();
});
it('composes accessible phone and notes guidance with stable control references', () => {
  render(<CustomerFormFields form={blankCustomer} setForm={vi.fn()} fields={fields({ values: { qa_note: 'QA value' } })} />);
  for (const label of ['Customer phone (optional)', 'Notes (optional)']) {
    const input = screen.getByLabelText(label, { exact: true });
    expect(input.getAttribute('aria-describedby')!.split(' ').every(id => document.getElementById(id)?.textContent)).toBe(true);
  }
});
it('retains canonical phone legacy compatibility and exact status editing', () => {
  expect(customerPhoneError('legacy number', 'legacy number')).toBeUndefined();
  expect(customerPhoneError('12', 'legacy number')).toContain('valid phone');
  const setForm = vi.fn(); render(<CustomerFormFields editing form={{ ...blankCustomer, name: 'QA customer', status: 'inactive' }} setForm={setForm} fields={fields()} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Status' }), { target: { value: 'active' } });
  expect(setForm).toHaveBeenCalledWith({ ...blankCustomer, name: 'QA customer', status: 'active' });
});
it('dynamic changes remain delegated to the existing engine, without a field-definition editor', () => {
  const change = vi.fn(); render(<CustomerFormFields form={blankCustomer} setForm={vi.fn()} fields={fields({ change })} />);
  fireEvent.change(screen.getByLabelText('QA field *'), { target: { value: 'QA changed' } });
  expect(change).toHaveBeenCalledWith('qa_note', 'QA changed'); expect(screen.queryByRole('button', { name: /Create field/ })).toBeNull();
});
