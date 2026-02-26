'use client';

import { CheckCircle, AlertTriangle, XCircle, ArrowLeft, RotateCcw, Loader2 } from 'lucide-react';

interface ImportResultsCardProps {
  status: 'completed' | 'failed' | 'partial';
  totalRows: number;
  successRows: number;
  errorRows: number;
  updatedRows?: number;
  skippedRows?: number;
  entityLabel: string;
  extraStats?: Array<{ label: string; value: string | number }>;
  errors?: Array<{ row?: number; message: string }>;
  actions?: React.ReactNode;
  /** Navigate back to preview/mapping step with data intact */
  onGoBack?: () => void;
  /** Roll back all created records */
  onRollback?: () => void;
  /** Whether a rollback is currently in progress */
  isRollingBack?: boolean;
}

export function ImportResultsCard({
  status,
  totalRows,
  successRows,
  errorRows,
  updatedRows,
  skippedRows,
  entityLabel,
  extraStats,
  errors,
  actions,
  onGoBack,
  onRollback,
  isRollingBack,
}: ImportResultsCardProps) {
  const StatusIcon = status === 'completed' ? CheckCircle : status === 'partial' ? AlertTriangle : XCircle;
  const statusColor = status === 'completed'
    ? 'text-green-500'
    : status === 'partial'
      ? 'text-amber-500'
      : 'text-red-500';
  const statusLabel = status === 'completed'
    ? 'Import Complete!'
    : status === 'partial'
      ? 'Import Completed with Issues'
      : 'Import Failed';

  const stats = [
    { label: 'Total', value: totalRows },
    { label: 'Created', value: successRows },
    ...(updatedRows != null ? [{ label: 'Updated', value: updatedRows }] : []),
    ...(skippedRows != null ? [{ label: 'Skipped', value: skippedRows }] : []),
    { label: 'Errors', value: errorRows },
    ...(extraStats ?? []),
  ];

  return (
    <div className="space-y-4 text-center">
      <StatusIcon className={`mx-auto h-12 w-12 ${statusColor}`} />
      <h3 className="text-lg font-semibold text-foreground">
        {statusLabel}
      </h3>

      {successRows > 0 && (
        <p className="text-sm text-muted-foreground">
          {successRows.toLocaleString()} {entityLabel} imported successfully
        </p>
      )}

      {/* Stats grid */}
      <div className="mx-auto grid max-w-md grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-border bg-muted px-3 py-2"
          >
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="text-lg font-semibold text-foreground">
              {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Error list (collapsible if > 5) */}
      {errors && errors.length > 0 && (
        <details className="mx-auto max-w-md text-left">
          <summary className="cursor-pointer text-sm font-medium text-red-500">
            {errors.length} error{errors.length !== 1 ? 's' : ''}
          </summary>
          <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-red-500/30 bg-red-500/10 p-3">
            {errors.map((err, i) => (
              <p key={i} className="text-xs text-red-500">
                {err.row ? `Row ${err.row}: ` : ''}{err.message}
              </p>
            ))}
          </div>
        </details>
      )}

      {/* Inline action cards for Go Back & Fix / Roll Back Import */}
      {errorRows > 0 && (onGoBack || onRollback) && (
        <div className="mx-auto flex max-w-lg flex-col gap-3 pt-2 sm:flex-row">
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
                  Return to preview to fix errors
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
                  Delete all newly created {entityLabel}
                </p>
              </div>
            </button>
          )}
        </div>
      )}

      {/* Additional custom actions */}
      {actions && (
        <div className="flex items-center justify-center gap-3 pt-2">
          {actions}
        </div>
      )}
    </div>
  );
}
