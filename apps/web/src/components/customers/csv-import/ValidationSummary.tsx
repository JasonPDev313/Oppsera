'use client';

import { AlertCircle, AlertTriangle, CheckCircle2, Users } from 'lucide-react';
import type { ValidationMessage, MappedCustomerRow } from '@/hooks/use-customer-import';

interface ValidationSummaryProps {
  totalRows: number;
  validRowCount: number;
  errors: ValidationMessage[];
  warnings: ValidationMessage[];
  duplicateCount: number;
  preview: MappedCustomerRow[];
  onContinue: () => void;
  onBack: () => void;
  hasDuplicates: boolean;
}

export function ValidationSummary({
  totalRows,
  validRowCount,
  errors,
  warnings,
  duplicateCount,
  preview,
  onContinue,
  onBack,
  hasDuplicates,
}: ValidationSummaryProps) {
  const errorCount = errors.length;
  const warningCount = warnings.length;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Validation Results
      </h3>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{totalRows}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Records</p>
        </div>
        <div className="rounded-lg border border-green-200 bg-green-50/50 p-3 dark:border-green-800 dark:bg-green-900/10">
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <p className="text-2xl font-bold text-green-700 dark:text-green-300">{validRowCount}</p>
          </div>
          <p className="text-xs text-green-600 dark:text-green-400">Valid</p>
        </div>
        {errorCount > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 dark:border-red-800 dark:bg-red-900/10">
            <div className="flex items-center gap-1">
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              <p className="text-2xl font-bold text-red-700 dark:text-red-300">{errorCount}</p>
            </div>
            <p className="text-xs text-red-600 dark:text-red-400">Errors</p>
          </div>
        )}
        {duplicateCount > 0 && (
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-900/10">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{duplicateCount}</p>
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400">Duplicates</p>
          </div>
        )}
      </div>

      {/* Errors list */}
      {errorCount > 0 && (
        <details className="rounded-lg border border-red-200 dark:border-red-800">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-red-700 dark:text-red-300">
            {errorCount} error{errorCount !== 1 ? 's' : ''} found
          </summary>
          <ul className="max-h-40 overflow-y-auto px-4 pb-3">
            {errors.slice(0, 50).map((err, i) => (
              <li key={i} className="flex items-start gap-2 py-1 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>Row {err.row}: {err.message}</span>
              </li>
            ))}
            {errorCount > 50 && (
              <li className="py-1 text-xs text-red-500">...and {errorCount - 50} more</li>
            )}
          </ul>
        </details>
      )}

      {/* Warnings */}
      {warningCount > 0 && (
        <details className="rounded-lg border border-amber-200 dark:border-amber-800">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-300">
            {warningCount} warning{warningCount !== 1 ? 's' : ''}
          </summary>
          <ul className="max-h-40 overflow-y-auto px-4 pb-3">
            {warnings.slice(0, 50).map((w, i) => (
              <li key={i} className="flex items-start gap-2 py-1 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{w.row ? `Row ${w.row}: ` : ''}{w.message}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Preview table */}
      {preview.length > 0 && (
        <div>
          <h4 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            Preview (first {Math.min(preview.length, 10)} rows)
          </h4>
          <div className="max-h-48 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="min-w-full divide-y divide-gray-200 text-xs dark:divide-gray-700">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium text-gray-500">Row</th>
                  <th className="px-3 py-1.5 text-left font-medium text-gray-500">Name</th>
                  <th className="px-3 py-1.5 text-left font-medium text-gray-500">Email</th>
                  <th className="px-3 py-1.5 text-left font-medium text-gray-500">Phone</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {preview.slice(0, 10).map((row) => (
                  <tr key={row.rowIndex}>
                    <td className="px-3 py-1 text-gray-500">{row.rowIndex + 1}</td>
                    <td className="px-3 py-1 text-gray-900 dark:text-gray-100">
                      {String(row.customer.displayName ?? row.customer.firstName ?? '—')}
                    </td>
                    <td className="px-3 py-1 text-gray-600 dark:text-gray-300">
                      {String(row.customer.email ?? '—')}
                    </td>
                    <td className="px-3 py-1 text-gray-600 dark:text-gray-300">
                      {String(row.customer.phone ?? '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <button
          onClick={onBack}
          className="rounded-md border border-gray-300 bg-surface px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Adjust Mappings
        </button>
        <button
          onClick={onContinue}
          disabled={validRowCount === 0}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {hasDuplicates ? 'Review Duplicates' : 'Import Now'}
        </button>
      </div>
    </div>
  );
}
