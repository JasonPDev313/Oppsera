'use client';

interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  emptyMessage?: string;
  emptyAction?: { label: string; onClick: () => void };
  onRowClick?: (row: T) => void;
  rowClassName?: (row: T) => string;
}

function SkeletonRow({ colCount }: { colCount: number }) {
  return (
    <tr className="border-b border-gray-100">
      {Array.from({ length: colCount }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 animate-pulse rounded bg-gray-200" style={{ width: `${60 + Math.random() * 30}%` }} />
        </td>
      ))}
    </tr>
  );
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  isLoading = false,
  emptyMessage = 'No data found',
  emptyAction,
  onRowClick,
  rowClassName,
}: DataTableProps<T>) {
  if (isLoading) {
    return (
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
        {/* Desktop skeleton */}
        <div className="hidden md:block">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500"
                    style={col.width ? { width: col.width } : undefined}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} colCount={columns.length} />
              ))}
            </tbody>
          </table>
        </div>
        {/* Mobile skeleton */}
        <div className="space-y-3 p-4 md:hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-gray-100 p-4">
              <div className="h-4 w-3/4 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-1/3 animate-pulse rounded bg-gray-200" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-gray-200 bg-surface py-12">
        <p className="text-sm text-gray-500">{emptyMessage}</p>
        {emptyAction && (
          <button
            type="button"
            onClick={emptyAction.onClick}
            className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
          >
            {emptyAction.label}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-surface">
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500"
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, idx) => (
              <tr
                key={(row.id as string) ?? idx}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-gray-100 transition-colors last:border-0 ${
                  onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''
                } ${rowClassName ? rowClassName(row) : ''}`}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-sm text-gray-900">
                    {col.render ? col.render(row) : (row[col.key] as React.ReactNode)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card layout */}
      <div className="space-y-3 p-4 md:hidden">
        {data.map((row, idx) => (
          <div
            key={(row.id as string) ?? idx}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={`rounded-lg border border-gray-100 p-4 ${
              onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''
            } ${rowClassName ? rowClassName(row) : ''}`}
          >
            {columns.map((col) => (
              <div key={col.key} className="flex items-baseline justify-between py-1">
                <span className="text-xs font-medium text-gray-500">{col.header}</span>
                <span className="text-sm text-gray-900">
                  {col.render ? col.render(row) : (row[col.key] as React.ReactNode)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
