import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Plus } from 'lucide-react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';
import { ErrorState, Pagination, SearchField, Skeleton } from './WorkspacePrimitives';

export interface Column<T> {
  header: string;
  accessor: keyof T | string;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  cell?: (props: { value: unknown; row: T; index: number }) => ReactNode;
}
export type TableSort = { key: string; direction: 'asc' | 'desc' } | null;
export interface ServerTableState {
  search: string;
  onSearch?: (value: string) => void;
  sort?: TableSort;
  onSort?: (sort: TableSort) => void;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPage: (page: number) => void;
  onPageSize?: (size: number) => void;
}
interface TablePresentation<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  retryLabel?: string;
  title?: string;
  description?: string;
  onRowClick?: (row: T) => void;
  onAdd?: () => void;
  emptyState?: ReactNode;
  searchPlaceholder?: string;
  className?: string;
  rowKey?: (row: T) => string;
  rowLabel?: (row: T) => string;
  mobileCard?: (row: T) => ReactNode;
  filters?: ReactNode;
}
// Server mode cannot accidentally run local operations over a paginated subset.
export type AdvancedTableProps<T> = TablePresentation<T> & (
  { mode: 'server'; server: ServerTableState } | { mode?: 'local'; server?: never }
);
const cellValue = <T extends object>(row: T, key: keyof T | string) => (row as Record<string, unknown>)[String(key)];
const compare = (a: unknown, b: unknown) => typeof a === 'number' && typeof b === 'number' ? a - b : typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b) : 0;

export function AdvancedTable<T extends object>(props: AdvancedTableProps<T>) {
  const { columns, data, loading, error, title, description, onRowClick, onAdd, emptyState, className = '', rowKey, rowLabel, mobileCard, filters } = props;
  const [localSort, setLocalSort] = useState<TableSort>(null);
  const [localSearch, setLocalSearch] = useState('');
  const server = props.mode === 'server' ? props.server : undefined;
  const sort = server ? server.sort : localSort;
  const rows = useMemo(() => {
    if (server) return data;
    const matching = localSearch ? data.filter(row => columns.some(column => String(cellValue(row, column.accessor) ?? '').toLowerCase().includes(localSearch.toLowerCase()))) : [...data];
    if (localSort) matching.sort((a, b) => compare(cellValue(a, localSort.key), cellValue(b, localSort.key)) * (localSort.direction === 'asc' ? 1 : -1));
    return matching;
  }, [server, data, localSearch, localSort, columns]);
  const handleSort = (key: string) => {
    const next: TableSort = { key, direction: sort?.key === key && sort.direction === 'asc' ? 'desc' : 'asc' };
    if (server) server.onSort?.(next); else setLocalSort(next);
  };
  const showSearch = server ? Boolean(server.onSearch) : true;
  return <section className={`data-table ${className}`} aria-label={title ?? 'Records'} aria-busy={loading || undefined}>
    {(title || description || onAdd || showSearch) && <header className="table-toolbar"><div>{title && <h2>{title}</h2>}{description && <p className="muted">{description}</p>}</div><div className="table-toolbar-actions">{showSearch && <SearchField aria-label={server ? 'Search all records' : 'Search received records'} placeholder={props.searchPlaceholder ?? (server ? 'Search all records…' : 'Search received records…')} value={server ? server.search : localSearch} onChange={e => server ? server.onSearch?.(e.target.value) : setLocalSearch(e.target.value)} />}{onAdd && <Button onClick={onAdd}><Plus size={18} aria-hidden="true" />Add New</Button>}</div></header>}
    {filters}
    {error ? <ErrorState title="Records could not be loaded" message={error} retry={props.onRetry} retryLabel={props.retryLabel} /> : loading ? <Skeleton label="Loading records…" rows={4} /> : rows.length === 0 ? emptyState ?? <EmptyState title="No results found" description="Try adjusting your search or filters." /> : <>
      <div className={mobileCard ? 'table-desktop table-scroll' : 'table-scroll'}><table><thead><tr>{columns.map(column => {
        const sortable = Boolean(column.sortable && (!server || server.onSort));
        const selected = sort?.key === column.accessor;
        return <th key={String(column.accessor)} scope="col" style={{ textAlign: column.align ?? 'left' }} aria-sort={sortable ? selected ? sort?.direction === 'asc' ? 'ascending' : 'descending' : 'none' : undefined}>{sortable ? <button className="table-sort" onClick={() => handleSort(String(column.accessor))}>{column.header}{selected && (sort?.direction === 'asc' ? <ArrowUp size={16} aria-hidden="true" /> : <ArrowDown size={16} aria-hidden="true" />)}</button> : column.header}</th>;
      })}</tr></thead><tbody>{rows.map((row, index) => <tr key={rowKey?.(row) ?? index} onClick={onRowClick ? e => { if (!(e.target as HTMLElement).closest('button,a,input,select')) onRowClick(row); } : undefined} className={onRowClick ? 'clickable-row' : ''}>{columns.map((column, columnIndex) => <td key={String(column.accessor)} style={{ textAlign: column.align ?? 'left' }}>{column.cell ? column.cell({ value: cellValue(row, column.accessor), row, index }) : columnIndex === 0 && onRowClick ? <button className="record-open" onClick={() => onRowClick(row)} aria-label={`Open ${rowLabel?.(row) ?? String(cellValue(row, column.accessor))}`}>{String(cellValue(row, column.accessor) ?? '—')}</button> : String(cellValue(row, column.accessor) ?? '—')}</td>)}</tr>)}</tbody></table></div>
      {mobileCard && <div className="table-mobile">{rows.map((row, index) => <div key={rowKey?.(row) ?? index}>{mobileCard(row)}</div>)}</div>}
    </>}
    {server && !error && <Pagination page={server.page} totalPages={server.totalPages} total={server.total} pageSize={server.pageSize} onPage={server.onPage} onPageSize={server.onPageSize} busy={loading} />}
    {!server && <p className="table-scope muted">Search and sort apply to received rows only.</p>}
  </section>;
}
export default AdvancedTable;
