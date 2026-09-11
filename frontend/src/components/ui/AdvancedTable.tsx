import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, AlertCircle, Plus, Search } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Button } from './Button';
import { Input } from './Input';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface Column<T> {
  header: string;
  accessor: keyof T | string;
  sortable?: boolean;
  cell?: (props: { value: any; row: T; index: number }) => React.ReactNode;
}

export interface AdvancedTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  error?: string | null;
  title?: string;
  description?: string;
  onRowClick?: (row: T) => void;
  onAdd?: () => void;
  emptyState?: React.ReactNode;
  searchPlaceholder?: string;
  className?: string;
}

export const AdvancedTable = <T extends Record<string, any>>({
  columns,
  data,
  loading = false,
  error,
  title,
  description,
  onRowClick,
  onAdd,
  emptyState,
  searchPlaceholder = 'Search...',
  className,
}: AdvancedTableProps<T>) => {
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [searchValue, setSearchValue] = useState('');

  const handleSort = (accessor: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === accessor && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key: accessor, direction });
  };

  const sortedAndFilteredData = useMemo(() => {
    let result = [...data];

    if (searchValue) {
      const lowerSearch = searchValue.toLowerCase();
      result = result.filter((item) =>
        Object.values(item).some((val) => String(val).toLowerCase().includes(lowerSearch))
      );
    }

    if (sortConfig) {
      result.sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return result;
  }, [data, sortConfig, searchValue]);

  return (
    <div className={cn("w-full bg-slate-900 rounded-2xl border border-slate-800 shadow-xl overflow-hidden", className)}>
      {/* Header section */}
      {(title || description || onAdd || searchPlaceholder) && (
        <div className="p-4 sm:p-6 border-b border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            {title && <h2 className="text-xl font-bold text-white truncate">{title}</h2>}
            {description && <p className="text-sm text-slate-400 mt-1">{description}</p>}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 w-full lg:w-auto">
            <Input
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              icon={<Search className="w-4 h-4" />}
              className="min-w-[240px]"
            />
            {onAdd && (
              <Button onClick={onAdd} className="shrink-0">
                <Plus className="w-4 h-4" />
                <span>Add New</span>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="p-4 m-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-3 text-rose-400">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[600px]">
          <thead>
            <tr className="bg-slate-800/50">
              {columns.map((col, idx) => (
                <th
                  key={idx}
                  onClick={() => col.sortable && handleSort(col.accessor as string)}
                  className={cn(
                    "px-6 py-4 text-xs font-semibold tracking-wider text-slate-300 uppercase whitespace-nowrap sticky top-0",
                    col.sortable && "cursor-pointer hover:bg-slate-800/80 transition-colors"
                  )}
                >
                  <div className="flex items-center gap-2">
                    {col.header}
                    {col.sortable && (
                      <div className="flex flex-col opacity-50">
                        <ChevronUp className={cn("w-3 h-3 -mb-1", sortConfig?.key === col.accessor && sortConfig.direction === 'asc' && "text-indigo-400 opacity-100")} />
                        <ChevronDown className={cn("w-3 h-3", sortConfig?.key === col.accessor && sortConfig.direction === 'desc' && "text-indigo-400 opacity-100")} />
                      </div>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-12 text-center text-slate-400">
                  <div className="flex justify-center items-center gap-3">
                    <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                    <span>Loading data...</span>
                  </div>
                </td>
              </tr>
            ) : sortedAndFilteredData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-6 py-16 text-center">
                  {emptyState || (
                    <div className="flex flex-col items-center justify-center text-slate-400">
                      <AlertCircle className="w-10 h-10 mb-4 opacity-50" />
                      <p className="text-sm font-medium">No results found</p>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              sortedAndFilteredData.map((row, rowIdx) => (
                <tr
                  key={rowIdx}
                  onClick={() => onRowClick && onRowClick(row)}
                  className={cn(
                    "transition-colors duration-150",
                    onRowClick ? "cursor-pointer hover:bg-slate-800/50" : "hover:bg-slate-800/30"
                  )}
                >
                  {columns.map((col, colIdx) => (
                    <td key={colIdx} className="px-6 py-4 text-sm text-slate-300 whitespace-nowrap">
                      {col.cell
                        ? col.cell({ value: (row as any)[col.accessor], row, index: rowIdx })
                        : (row as any)[col.accessor] ?? <span className="text-slate-500">--</span>}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdvancedTable;
