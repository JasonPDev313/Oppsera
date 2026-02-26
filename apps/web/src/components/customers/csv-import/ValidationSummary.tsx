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
      <h3 className="text-lg font-semibold text-foreground">
        Validation Results
      </h3>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border p-3">
          <p className="text-2xl font-bold text-foreground">{totalRows}</p>
          <p className="text-xs text-muted-foreground">Total Records</p>
        </div>
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3">
          <div className="flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <p className="text-2xl font-bold text-green-500">{validRowCount}</p>
          </div>
          <p className="text-xs text-green-500">Valid</p>
        </div>
        {errorCount > 0 && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            <div className="flex items-center gap-1">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <p className="text-2xl font-bold text-red-500">{errorCount}</p>
            </div>
            <p className="text-xs text-red-500">Errors</p>
          </div>
        )}
        {duplicateCount > 0 && (
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3">
            <div className="flex items-center gap-1">
              <Users className="h-4 w-4 text-blue-500" />
              <p className="text-2xl font-bold text-blue-500">{duplicateCount}</p>
            </div>
            <p className="text-xs text-blue-500">Duplicates</p>
          </div>
        )}
      </div>

      {/* Errors list */}
      {errorCount > 0 && (
        <details className="rounded-lg border border-red-500/30">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-red-500">
            {errorCount} error{errorCount !== 1 ? 's' : ''} found
          </summary>
          <ul className="max-h-40 overflow-y-auto px-4 pb-3">
            {errors.slice(0, 50).map((err, i) => (
              <li key={i} className="flex items-start gap-2 py-1 text-xs text-red-500">
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
        <details className="rounded-lg border border-amber-500/30">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-amber-500">
            {warningCount} warning{warningCount !== 1 ? 's' : ''}
          </summary>
          <ul className="max-h-40 overflow-y-auto px-4 pb-3">
            {warnings.slice(0, 50).map((w, i) => (
              <li key={i} className="flex items-start gap-2 py-1 text-xs text-amber-500">
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
          <h4 className="mb-2 text-sm font-medium text-foreground">
            Preview (first {Math.min(preview.length, 10)} rows)
          </h4>
          <div className="max-h-48 overflow-auto rounded-lg border border-border">
            <table className="min-w-full divide-y divide-border text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Row</th>
                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-3 py-1.5 text-left font-medium text-muted-foreground">Phone</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {preview.slice(0, 10).map((row) => (
                  <tr key={row.rowIndex}>
                    <td className="px-3 py-1 text-muted-foreground">{row.rowIndex + 1}</td>
                    <td className="px-3 py-1 text-foreground">
                      {String(row.customer.displayName ?? row.customer.firstName ?? '—')}
                    </td>
                    <td className="px-3 py-1 text-muted-foreground">
                      {String(row.customer.email ?? '—')}
                    </td>
                    <td className="px-3 py-1 text-muted-foreground">
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
          className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          Adjust Mappings
        </button>
        <button
          onClick={onContinue}
          disabled={validRowCount === 0}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          {hasDuplicates ? 'Review Duplicates' : 'Import Now'}
        </button>
      </div>
    </div>
  );
}
