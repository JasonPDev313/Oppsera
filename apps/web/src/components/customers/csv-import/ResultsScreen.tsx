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
        <h3 className="mt-3 text-lg font-semibold text-gray-900 dark:text-gray-100">
          {allFailed ? 'Import Failed' : 'Import Complete'}
        </h3>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50/50 p-3 dark:border-green-800 dark:bg-green-900/10">
          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
          <div>
            <p className="text-xl font-bold text-green-700 dark:text-green-300">{result.successRows}</p>
            <p className="text-xs text-green-600 dark:text-green-400">Created</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-900/10">
          <ArrowUpCircle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <div>
            <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{result.updatedRows}</p>
            <p className="text-xs text-blue-600 dark:text-blue-400">Updated</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
          <SkipForward className="h-5 w-5 text-gray-400" />
          <div>
            <p className="text-xl font-bold text-gray-600 dark:text-gray-300">{result.skippedRows}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Skipped</p>
          </div>
        </div>
        {hasErrors && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50/50 p-3 dark:border-red-800 dark:bg-red-900/10">
            <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            <div>
              <p className="text-xl font-bold text-red-700 dark:text-red-300">{result.errorRows}</p>
              <p className="text-xs text-red-600 dark:text-red-400">Errors</p>
            </div>
          </div>
        )}
      </div>

      {/* Error details */}
      {hasErrors && result.errors.length > 0 && (
        <details className="rounded-lg border border-red-200 dark:border-red-800">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-red-700 dark:text-red-300">
            {result.errors.length} error{result.errors.length !== 1 ? 's' : ''} during import
          </summary>
          <ul className="max-h-40 overflow-y-auto px-4 pb-3">
            {result.errors.map((err, i) => (
              <li key={i} className="py-1 text-xs text-red-600 dark:text-red-400">
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
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-surface px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
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
            className="rounded-md border border-gray-300 bg-surface px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
