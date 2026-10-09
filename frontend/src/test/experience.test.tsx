import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AdvancedTable, type ServerTableState } from '../components/ui/AdvancedTable';
import { Input } from '../components/ui/Input';
import { AdvancedSearchSelect } from '../components/ui/AdvancedSearchSelect';

afterEach(cleanup);
const rows = [{ id: 'z', name: 'Zulu', privateNote: 'hidden' }, { id: 'a', name: 'Alpha', privateNote: 'hidden' }];
const columns = [{ header: 'Name', accessor: 'name', sortable: true }];
const server = (overrides: Partial<ServerTableState> = {}): ServerTableState => ({ search: 'not present on this page', sort: { key: 'name', direction: 'asc' }, page: 2, pageSize: 20, total: 45, totalPages: 3, onPage: vi.fn(), ...overrides });

it('server mode preserves response order and every received row despite controlled search/sort', () => {
  render(<AdvancedTable mode="server" columns={columns} data={rows} server={server()} />);
  expect(screen.getAllByRole('cell').map(cell => cell.textContent)).toEqual(['Zulu', 'Alpha']);
  expect(screen.queryByRole('button', { name: 'Name' })).toBeNull();
  expect(screen.queryByRole('searchbox')).toBeNull();
});
it('controlled sorting/search/pagination emit requests without mutating or filtering the page', () => {
  const onSort = vi.fn(), onSearch = vi.fn(), onPage = vi.fn(), onPageSize = vi.fn();
  render(<AdvancedTable mode="server" columns={columns} data={rows} server={server({ onSort, onSearch, onPage, onPageSize })} />);
  fireEvent.click(screen.getByRole('button', { name: 'Name' }));
  expect(onSort).toHaveBeenCalledWith({ key: 'name', direction: 'desc' });
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'global query' } });
  expect(onSearch).toHaveBeenCalledWith('global query');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  expect(onPage).toHaveBeenCalledWith(3);
  fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '50' } });
  expect(onPageSize).toHaveBeenCalledWith(50);
  expect(screen.getAllByRole('cell').map(cell => cell.textContent)).toEqual(['Zulu', 'Alpha']);
  expect(rows.map(row => row.id)).toEqual(['z', 'a']);
});
it('local mode honestly limits search to visible declared columns and sorts an immutable copy', () => {
  render(<AdvancedTable columns={columns} data={rows} />);
  expect(screen.getByText('Search and sort apply to received rows only.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Name' }));
  expect(screen.getAllByRole('cell').map(cell => cell.textContent)).toEqual(['Alpha', 'Zulu']);
  expect(rows.map(row => row.id)).toEqual(['z', 'a']);
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'hidden' } });
  expect(screen.getByRole('heading', { name: 'No results found' })).toBeTruthy();
});
it('server error exposes a genuine retry and loading disables paging', () => {
  const retry = vi.fn();
  const view = render(<AdvancedTable mode="server" columns={columns} data={[]} error="Temporary failure" onRetry={retry} retryLabel="Reload customers" server={server()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Reload customers' })); expect(retry).toHaveBeenCalledOnce();
  view.rerender(<AdvancedTable mode="server" columns={columns} data={[]} loading server={server()} />);
  expect((screen.getByRole('button', { name: 'Next' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('status').textContent).toContain('Loading records');
});
it('same named required inputs have unique IDs, stable labels, and composed helper/error references', () => {
  render(<><p id="external">Additional context</p><Input label="Name" required helper="Choose a name" error="Required" aria-describedby="external" /><Input label="Name" required /></>);
  const controls = screen.getAllByLabelText('Name', { exact: true }); expect(controls[0].id).not.toBe(controls[1].id);
  const references = controls[0].getAttribute('aria-describedby')!.split(' '); expect(references).toHaveLength(3);
  expect(references.every(id => document.getElementById(id))).toBe(true);
  expect(controls[0].getAttribute('aria-invalid')).toBe('true');
});
it('received-options selector supports keyboard selection, Escape return and bounded search', () => {
  const change = vi.fn(); render(<AdvancedSearchSelect options={rows} value={null} onChange={change} displayKey="name" label="Customer" required />);
  const trigger = screen.getByRole('button', { name: 'Customer' }); fireEvent.click(trigger);
  fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'ArrowDown' }); expect(document.activeElement).toBe(screen.getAllByRole('option')[0]);
  fireEvent.click(screen.getByRole('option', { name: 'Zulu' })); expect(change).toHaveBeenCalledWith(rows[0]); expect(document.activeElement).toBe(trigger);
  fireEvent.click(trigger); fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Alpha' } }); expect(screen.getAllByRole('option')).toHaveLength(1);
  fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' }); expect(screen.queryByRole('listbox')).toBeNull(); expect(document.activeElement).toBe(trigger);
});
