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
  completed: { bg: 'bg-green-500/20', text: 'text-green-500', label: 'Completed' },
  failed: { bg: 'bg-red-500/20', text: 'text-red-500', label: 'Failed' },
  partial: { bg: 'bg-amber-500/20', text: 'text-amber-500', label: 'Partial' },
  processing: { bg: 'bg-blue-500/20', text: 'text-blue-500', label: 'Processing' },
  pending: { bg: 'bg-muted', text: 'text-muted-foreground', label: 'Pending' },
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
          <div key={i} className="h-10 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  if (imports.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          No imports yet. Choose a data type above to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs font-medium uppercase text-muted-foreground">
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
                className="border-b border-border last:border-0"
              >
                <td className="py-2.5 pr-4">
                  <span className="font-medium">
                    {typeLabels[entry.importType] ?? entry.importType}
                  </span>
                </td>
                <td className="py-2.5 pr-4">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
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
                <td className="py-2.5 text-xs text-muted-foreground">
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
