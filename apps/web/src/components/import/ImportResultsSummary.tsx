'use client';

import { CheckCircle2, AlertTriangle, Download, ArrowRight, ArrowLeft, RotateCcw, Loader2 } from 'lucide-react';
import type { ImportJobDetail } from '@/hooks/use-import-jobs';

interface ImportResultsSummaryProps {
  job: ImportJobDetail;
  onDownloadErrors?: () => void;
  onViewOrders?: () => void;
  /** Callback to retry failed rows with a corrected file */
  onRetryErrors?: () => void;
  /** Navigate back to reconciliation step with data intact */
  onGoBack?: () => void;
  /** Roll back all created records */
  onRollback?: () => void;
  /** Whether a rollback is currently in progress */
  isRollingBack?: boolean;
}

export function ImportResultsSummary({ job, onDownloadErrors, onViewOrders, onRetryErrors, onGoBack, onRollback, isRollingBack }: ImportResultsSummaryProps) {
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
      border: 'border-green-500/30 bg-green-500/10',
      icon: <CheckCircle2 className="h-6 w-6 text-green-500" />,
      title: 'Import Complete',
      titleColor: 'text-green-500',
    },
    partial: {
      border: 'border-amber-500/30 bg-amber-500/10',
      icon: <AlertTriangle className="h-6 w-6 text-amber-500" />,
      title: 'Import Completed with Issues',
      titleColor: 'text-amber-500',
    },
    failed: {
      border: 'border-red-500/30 bg-red-500/10',
      icon: <AlertTriangle className="h-6 w-6 text-red-500" />,
      title: 'Import Failed',
      titleColor: 'text-red-500',
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
          <p className="text-xs text-muted-foreground">
            {job.importedRows.toLocaleString()} orders imported
            {hasErrors && `, ${job.errorRows} errors`}
            {job.skippedRows > 0 && `, ${job.skippedRows} skipped`}
          </p>
        </div>
      </div>

      {/* Partial import guidance */}
      {isPartial && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <p className="text-xs text-amber-500">
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

      {/* Inline action cards for Go Back & Fix / Roll Back Import */}
      {hasErrors && (onGoBack || onRollback) && (
        <div className="flex flex-col gap-3 sm:flex-row">
          {onGoBack && (
            <button
              type="button"
              onClick={onGoBack}
              disabled={isRollingBack}
              className="flex flex-1 items-center gap-3 rounded-lg border border-border bg-surface p-4 text-left transition-colors hover:bg-accent disabled:opacity-50"
            >
              <ArrowLeft className="h-5 w-5 shrink-0 text-indigo-500" />
              <div>
                <p className="text-sm font-medium text-foreground">Go Back &amp; Fix</p>
                <p className="text-xs text-muted-foreground">
                  Return to review to fix errors
                </p>
              </div>
            </button>
          )}
          {onRollback && (
            <button
              type="button"
              onClick={onRollback}
              disabled={isRollingBack}
              className="flex flex-1 items-center gap-3 rounded-lg border border-red-500/30 bg-surface p-4 text-left transition-colors hover:bg-red-500/10 disabled:opacity-50"
            >
              {isRollingBack ? (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin text-red-500" />
              ) : (
                <RotateCcw className="h-5 w-5 shrink-0 text-red-500" />
              )}
              <div>
                <p className="text-sm font-medium text-foreground">
                  {isRollingBack ? 'Rolling Back...' : 'Roll Back Import'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Delete all newly created records
                </p>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        {hasErrors && onDownloadErrors && (
          <button
            type="button"
            onClick={onDownloadErrors}
            className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
          >
            <Download className="h-4 w-4" />
            Download Error Report
          </button>
        )}
        {hasErrors && onRetryErrors && (
          <button
            type="button"
            onClick={onRetryErrors}
            className="inline-flex items-center gap-2 rounded-md border border-amber-500/30 px-4 py-2 text-sm text-amber-500 hover:bg-amber-500/10"
          >
            <RotateCcw className="h-4 w-4" />
            Re-import Error Rows
          </button>
        )}
        {onViewOrders && (
          <button
            type="button"
            onClick={onViewOrders}
            className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm text-white hover:bg-indigo-500"
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
      ? 'text-green-500'
      : color === 'yellow'
        ? 'text-yellow-500'
        : color === 'red'
          ? 'text-red-500'
          : '';

  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${textColor}`}>{value}</p>
    </div>
  );
}
