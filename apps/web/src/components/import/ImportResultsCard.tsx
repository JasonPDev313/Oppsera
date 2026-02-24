'use client';

import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

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
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        {statusLabel}
      </h3>

      {successRows > 0 && (
        <p className="text-sm text-gray-600 dark:text-gray-400">
          {successRows.toLocaleString()} {entityLabel} imported successfully
        </p>
      )}

      {/* Stats grid */}
      <div className="mx-auto grid max-w-md grid-cols-3 gap-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/50"
          >
            <p className="text-xs text-gray-500 dark:text-gray-400">{stat.label}</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
            </p>
          </div>
        ))}
      </div>

      {/* Error list (collapsible if > 5) */}
      {errors && errors.length > 0 && (
        <details className="mx-auto max-w-md text-left">
          <summary className="cursor-pointer text-sm font-medium text-red-600 dark:text-red-400">
            {errors.length} error{errors.length !== 1 ? 's' : ''}
          </summary>
          <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
            {errors.map((err, i) => (
              <p key={i} className="text-xs text-red-700 dark:text-red-300">
                {err.row ? `Row ${err.row}: ` : ''}{err.message}
              </p>
            ))}
          </div>
        </details>
      )}

      {/* Actions */}
      {actions && (
        <div className="flex items-center justify-center gap-3 pt-2">
          {actions}
        </div>
      )}
    </div>
  );
}
