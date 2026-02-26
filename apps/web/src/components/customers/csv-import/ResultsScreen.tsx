'use client';

import { CheckCircle2, XCircle, ArrowUpCircle, SkipForward, Download } from 'lucide-react';
import type { ImportResult } from '@/hooks/use-customer-import';

interface ResultsScreenProps {
  result: ImportResult;
  onClose: () => void;
  onViewCustomers: () => void;
}

export function ResultsScreen({ result, onClose, onViewCustomers }: ResultsScreenProps) {
  const allFailed = result.successRows === 0 && result.updatedRows === 0;
  const hasErrors = result.errorRows > 0;

  return (
    <div className="space-y-4">
      {/* Success / failure header */}
      <div className="flex flex-col items-center py-4">
        {allFailed ? (
          <XCircle className="h-12 w-12 text-red-500" />
        ) : (
          <CheckCircle2 className="h-12 w-12 text-green-500" />
        )}
        <h3 className="mt-3 text-lg font-semibold text-foreground">
          {allFailed ? 'Import Failed' : 'Import Complete'}
        </h3>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex items-center gap-2 rounded-lg border border-green-500/30 bg-green-500/10 p-3">
          <CheckCircle2 className="h-5 w-5 text-green-500" />
          <div>
            <p className="text-xl font-bold text-green-500">{result.successRows}</p>
            <p className="text-xs text-green-500">Created</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
          <ArrowUpCircle className="h-5 w-5 text-blue-500" />
          <div>
            <p className="text-xl font-bold text-blue-500">{result.updatedRows}</p>
            <p className="text-xs text-blue-500">Updated</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border p-3">
          <SkipForward className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-xl font-bold text-foreground">{result.skippedRows}</p>
            <p className="text-xs text-muted-foreground">Skipped</p>
          </div>
        </div>
        {hasErrors && (
          <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <XCircle className="h-5 w-5 text-red-500" />
            <div>
              <p className="text-xl font-bold text-red-500">{result.errorRows}</p>
              <p className="text-xs text-red-500">Errors</p>
            </div>
          </div>
        )}
      </div>

      {/* Error details */}
      {hasErrors && result.errors.length > 0 && (
        <details className="rounded-lg border border-red-500/30">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-red-500">
            {result.errors.length} error{result.errors.length !== 1 ? 's' : ''} during import
          </summary>
          <ul className="max-h-40 overflow-y-auto px-4 pb-3">
            {result.errors.map((err, i) => (
              <li key={i} className="py-1 text-xs text-red-500">
                Row {err.row}: {err.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Actions */}
      <div className="flex justify-between">
        <a
          href={`/api/v1/customers/import/${result.importLogId}/report`}
          download
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          <Download className="h-4 w-4" />
          Download Report
        </a>
        <div className="flex gap-2">
          <button
            onClick={onViewCustomers}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            View Customers
          </button>
          <button
            onClick={onClose}
            className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
