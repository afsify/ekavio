import type { ReactNode } from 'react';
import { AdvancedTable, type Column } from './AdvancedTable';
import { EmptyState } from './EmptyState';
/** Server-ordered bounded projections with no invented total, paging or sort. */
export function BoundedDirectory<T extends { id: string }>({ title, description, rows, columns, card, loading, error, retry, empty }: {
  title: string; description: string; rows: T[]; columns: Column<T>[];
  card: (record: T) => ReactNode; loading?: boolean; error?: string;
  retry?: () => void; empty: string;
}) {
  return <AdvancedTable mode="server" title={title} description={description} data={rows}
    columns={columns} rowKey={row => row.id} mobileCard={card} loading={loading}
    error={error} onRetry={retry} showPagination={false}
    emptyState={<EmptyState title={empty} description="Adjust the supported search or ask an authorized administrator about setup." />}
    server={{ search: '', page: 1, pageSize: Math.max(1, rows.length), total: rows.length, totalPages: 1, onPage: () => {} }} />;
}
