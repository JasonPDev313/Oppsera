'use client';

import { CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import type { ImportJobDetail, ImportError } from '@/hooks/use-import-jobs';

function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface ValidationSummaryProps {
  job: ImportJobDetail;
  errors: ImportError[];
  errorCount: { error: number; warning: number; info: number };
}

export function ValidationSummary({ job, errors, errorCount }: ValidationSummaryProps) {
  const hasErrors = errorCount.error > 0;
  const hasWarnings = errorCount.warning > 0;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard
          label="Total Orders"
          value={job.legacyRowCount?.toLocaleString() ?? '-'}
        />
        <SummaryCard
          label="Total Revenue"
          value={job.legacyRevenueCents != null ? formatCents(job.legacyRevenueCents) : '-'}
        />
        <SummaryCard
          label="Total Tax"
          value={job.legacyTaxCents != null ? formatCents(job.legacyTaxCents) : '-'}
        />
        <SummaryCard
          label="Total Payments"
          value={job.legacyPaymentCents != null ? formatCents(job.legacyPaymentCents) : '-'}
        />
      </div>

      {/* Validation Status */}
      <div className="flex items-center gap-3 rounded-lg border p-3">
        {hasErrors ? (
          <>
            <XCircle className="h-5 w-5 text-red-500" />
            <span className="text-sm font-medium text-red-600">
              {errorCount.error} error{errorCount.error !== 1 ? 's' : ''} found
            </span>
          </>
        ) : hasWarnings ? (
          <>
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            <span className="text-sm font-medium text-yellow-600">
              {errorCount.warning} warning{errorCount.warning !== 1 ? 's' : ''} — review recommended
            </span>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <span className="text-sm font-medium text-green-600">All checks passed</span>
          </>
        )}
      </div>

      {/* Error List */}
      {errors.length > 0 && (
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-3">
          {errors.slice(0, 50).map((e) => (
            <div key={e.id} className="flex items-start gap-2 text-sm">
              {e.severity === 'error' && <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" />}
              {e.severity === 'warning' && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-500" />}
              {e.severity === 'info' && <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />}
              <span>
                <span className="font-mono text-xs text-gray-500">Row {e.rowNumber}:</span>{' '}
                {e.message}
              </span>
            </div>
          ))}
          {errors.length > 50 && (
            <p className="pt-2 text-center text-xs text-gray-500">
              Showing first 50 of {errors.length} issues
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
