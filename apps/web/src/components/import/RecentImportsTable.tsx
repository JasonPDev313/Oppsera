'use client';

import { FileText, Inbox } from 'lucide-react';
import type { ImportLogEntry } from '@/types/import-dashboard';

interface RecentImportsTableProps {
  imports: ImportLogEntry[];
  isLoading: boolean;
  /** Map of importType key → display label (e.g. { customers: 'Customers' }) */
  typeLabels?: Record<string, string>;
}

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  completed: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', label: 'Completed' },
  failed: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-400', label: 'Failed' },
  partial: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', label: 'Partial' },
  processing: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', label: 'Processing' },
  pending: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-500 dark:text-gray-400', label: 'Pending' },
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function RecentImportsTable({
  imports,
  isLoading,
  typeLabels = {},
}: RecentImportsTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
    );
  }

  if (imports.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <Inbox className="h-8 w-8 text-gray-300 dark:text-gray-600" />
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No imports yet. Choose a data type above to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-xs font-medium uppercase text-gray-500 dark:border-gray-700 dark:text-gray-400">
            <th className="pb-2 pr-4">Type</th>
            <th className="pb-2 pr-4">File</th>
            <th className="pb-2 pr-4">Status</th>
            <th className="pb-2 pr-4 text-right">Records</th>
            <th className="pb-2">Date</th>
          </tr>
        </thead>
        <tbody>
          {imports.map((entry) => {
            const badge = STATUS_BADGE[entry.status] ?? STATUS_BADGE.pending!;
            return (
              <tr
                key={entry.id}
                className="border-b border-gray-100 last:border-0 dark:border-gray-800"
              >
                <td className="py-2.5 pr-4">
                  <span className="font-medium">
                    {typeLabels[entry.importType] ?? entry.importType}
                  </span>
                </td>
                <td className="py-2.5 pr-4">
                  <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    <span className="max-w-[200px] truncate">{entry.fileName}</span>
                  </span>
                </td>
                <td className="py-2.5 pr-4">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badge.bg} ${badge.text}`}>
                    {badge.label}
                  </span>
                </td>
                <td className="py-2.5 pr-4 text-right tabular-nums">
                  {entry.successRows.toLocaleString()}
                  {entry.errorRows > 0 && (
                    <span className="ml-1 text-xs text-red-500">
                      ({entry.errorRows} err)
                    </span>
                  )}
                </td>
                <td className="py-2.5 text-xs text-gray-500 dark:text-gray-400">
                  {formatDate(entry.createdAt)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
