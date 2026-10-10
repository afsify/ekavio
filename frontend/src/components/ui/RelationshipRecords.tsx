import type { ReactNode } from 'react';
import { AdvancedTable, type Column } from './AdvancedTable';
import { EmptyState } from './EmptyState';
import { getErrorMessage } from '../../api/errors';

/** A server-page consumer of the one shared table; never local search/sort. */
export function RelationshipRecords<T extends { id: string }>({ title, data, total, page, onPage, columns, card, pending, error, retry, emptyTitle, emptyDescription }: {
  title: string; data: T[]; total: number; page: number; onPage: (page: number) => void;
  columns: Column<T>[]; card: (row: T) => ReactNode; pending: boolean; error: unknown;
  retry: () => void; emptyTitle: string; emptyDescription: string;
}) {
  return <AdvancedTable mode="server" title={title} description="Search, filters and ordering apply on the server. Pages contain at most 20 records."
    data={data} rowKey={row => row.id} columns={columns} mobileCard={card}
    loading={pending} error={error ? getErrorMessage(error, 'Records could not be loaded.') : null} onRetry={retry}
    emptyState={<EmptyState title={emptyTitle} description={emptyDescription} />}
    server={{ search: '', page, pageSize: 20, total, totalPages: Math.min(200, Math.max(1, Math.ceil(total / 20))), onPage }} />;
}
