'use client';

import { CheckCircle2, AlertTriangle, Download, ArrowRight, RotateCcw } from 'lucide-react';
import type { ImportJobDetail } from '@/hooks/use-import-jobs';

interface ImportResultsSummaryProps {
  job: ImportJobDetail;
  onDownloadErrors?: () => void;
  onViewOrders?: () => void;
  /** Callback to retry failed rows with a corrected file */
  onRetryErrors?: () => void;
}

export function ImportResultsSummary({ job, onDownloadErrors, onViewOrders, onRetryErrors }: ImportResultsSummaryProps) {
  const isSuccess = job.status === 'completed';
  const isPartial = isSuccess && job.errorRows > 0;
  const hasErrors = job.errorRows > 0;

  // Determine status variant
  const statusVariant = !isSuccess
    ? 'failed'
    : isPartial
      ? 'partial'
      : 'success';

  const statusConfig = {
    success: {
      border: 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20',
      icon: <CheckCircle2 className="h-6 w-6 text-green-600" />,
      title: 'Import Complete',
      titleColor: 'text-green-700 dark:text-green-400',
    },
    partial: {
      border: 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20',
      icon: <AlertTriangle className="h-6 w-6 text-amber-600" />,
      title: 'Import Completed with Issues',
      titleColor: 'text-amber-700 dark:text-amber-400',
    },
    failed: {
      border: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20',
      icon: <AlertTriangle className="h-6 w-6 text-red-600" />,
      title: 'Import Failed',
      titleColor: 'text-red-700 dark:text-red-400',
    },
  }[statusVariant];

  return (
    <div className="space-y-4">
      {/* Overall Status */}
      <div className={`flex items-center gap-3 rounded-lg border p-4 ${statusConfig.border}`}>
        {statusConfig.icon}
        <div>
          <p className={`text-sm font-medium ${statusConfig.titleColor}`}>
            {statusConfig.title}
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {job.importedRows.toLocaleString()} orders imported
            {hasErrors && `, ${job.errorRows} errors`}
            {job.skippedRows > 0 && `, ${job.skippedRows} skipped`}
          </p>
        </div>
      </div>

      {/* Partial import guidance */}
      {isPartial && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {job.importedRows.toLocaleString()} records were imported successfully.
            The {job.errorRows.toLocaleString()} errored rows were skipped — download the error
            report to see what needs fixing, then re-import with a corrected file.
          </p>
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ResultCard label="Total Rows" value={job.totalRows.toLocaleString()} />
        <ResultCard label="Imported" value={job.importedRows.toLocaleString()} color="green" />
        <ResultCard label="Skipped" value={job.skippedRows.toLocaleString()} color="yellow" />
        <ResultCard label="Errors" value={job.errorRows.toLocaleString()} color={hasErrors ? 'red' : undefined} />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {hasErrors && onDownloadErrors && (
          <button
            type="button"
            onClick={onDownloadErrors}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800"
          >
            <Download className="h-4 w-4" />
            Download Error Report
          </button>
        )}
        {hasErrors && onRetryErrors && (
          <button
            type="button"
            onClick={onRetryErrors}
            className="inline-flex items-center gap-2 rounded-md border border-amber-300 px-4 py-2 text-sm text-amber-700 hover:bg-amber-50 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-900/20"
          >
            <RotateCcw className="h-4 w-4" />
            Re-import Error Rows
          </button>
        )}
        {onViewOrders && (
          <button
            type="button"
            onClick={onViewOrders}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-700"
          >
            View Imported Orders
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function ResultCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: 'green' | 'yellow' | 'red';
}) {
  const textColor =
    color === 'green'
      ? 'text-green-600'
      : color === 'yellow'
        ? 'text-yellow-600'
        : color === 'red'
          ? 'text-red-600'
          : '';

  return (
    <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${textColor}`}>{value}</p>
    </div>
  );
}
