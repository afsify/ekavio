import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { AdvancedSearchSelect } from '../components/ui/AdvancedSearchSelect';
import { OptionSelect } from '../components/ui/OptionSelect';

const options = Array.from({ length: 8 }, (_, index) => ({ id: String(index), name: `Staff ${index}` }));
it('typing never changes a canonical selection; Enter commits and Escape restores', () => {
  function Example() { const [value, setValue] = useState<string>('2'); return <OptionSelect options={options} value={value} onChange={setValue} label="Assignee" required />; }
  render(<Example />);
  const input = screen.getByRole('combobox', { name: 'Assignee' });
  expect((input as HTMLInputElement).value).toBe('Staff 2');
  act(() => input.focus()); fireEvent.change(input, { target: { value: '7' } });
  expect(screen.getAllByRole('option')).toHaveLength(1);
  fireEvent.keyDown(input, { key: 'Escape' }); expect((input as HTMLInputElement).value).toBe('Staff 2');
  fireEvent.click(input); fireEvent.change(input, { target: { value: '7' } });
  fireEvent.keyDown(input, { key: 'ArrowDown' }); fireEvent.keyDown(input, { key: 'Enter' });
  expect((input as HTMLInputElement).value).toBe('Staff 7'); expect(document.activeElement).toBe(input);
  expect(screen.queryByRole('button', { name: /Clear/ })).toBeNull();
});
it('empty, disabled and invalid controls retain their accessible semantics', () => {
  const change = vi.fn(); const view = render(<AdvancedSearchSelect label="Customer" options={options} value={options[0]} displayKey="name" onChange={change} error="Choose an active customer" />);
  const input = screen.getByRole('combobox'); act(() => input.focus());
  fireEvent.change(input, { target: { value: 'Missing' } });
  expect(screen.getByRole('status').textContent).toBe('No matching options');
  fireEvent.keyDown(input, { key: 'Enter' }); expect(change).not.toHaveBeenCalled();
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(input.getAttribute('aria-describedby')!.split(' ').every(id => document.getElementById(id))).toBe(true);
  view.rerender(<AdvancedSearchSelect label="Customer" options={options} value={options[0]} displayKey="name" onChange={change} disabled />);
  expect((input as HTMLInputElement).disabled).toBe(true); expect(screen.queryByRole('listbox')).toBeNull();
});
it('multi selection toggles only chosen IDs and optional clearing is explicit', () => {
  function Example() { const [value, setValue] = useState<typeof options>([options[0]]); return <AdvancedSearchSelect label="Recipients" multiple options={options} value={value} displayKey="name" onChange={next => setValue(Array.isArray(next) ? next : [])} />; }
  render(<Example />); const input = screen.getByRole('combobox'); act(() => input.focus());
  fireEvent.click(screen.getByRole('option', { name: 'Staff 1' }));
  expect(screen.getByRole('option', { name: 'Staff 0' }).getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('option', { name: 'Staff 1' }).getAttribute('aria-selected')).toBe('true');
  fireEvent.click(screen.getByRole('option', { name: 'Staff 0' }));
  expect(screen.getByRole('option', { name: 'Staff 0' }).getAttribute('aria-selected')).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: 'Clear Recipients' }));
  expect((input as HTMLInputElement).value).toBe('');
});
it('small fixed lists remain native and do not create search requests', () => {
  const change = vi.fn(); render(<OptionSelect label="Stage" options={options.slice(0, 3)} value="1" onChange={change} />);
  const input = screen.getByRole('combobox'); expect(input.tagName).toBe('SELECT');
  fireEvent.change(input, { target: { value: '2' } }); expect(change).toHaveBeenCalledWith('2');
});
it('disabled received records cannot be selected with pointer or keyboard', () => {
  const change = vi.fn(); render(<AdvancedSearchSelect label="Inventory" options={options} value={null} displayKey="name" onChange={change} isOptionDisabled={option => option.id === '0'} />);
  const input = screen.getByRole('combobox'); act(() => input.focus());
  const disabled = screen.getByRole('option', { name: 'Staff 0' });
  expect(disabled.getAttribute('aria-disabled')).toBe('true'); fireEvent.click(disabled); expect(change).not.toHaveBeenCalled();
  fireEvent.keyDown(input, { key: 'ArrowDown' }); expect(input.getAttribute('aria-activedescendant')).toBe(screen.getByRole('option', { name: 'Staff 1' }).id);
  fireEvent.keyDown(input, { key: 'Enter' }); expect(change).toHaveBeenCalledWith(options[1]);
});
