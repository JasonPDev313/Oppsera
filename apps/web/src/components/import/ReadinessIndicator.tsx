'use client';

import { CheckCircle2, AlertTriangle, Download } from 'lucide-react';

interface ReadinessIndicatorProps {
  readyCount: number;
  attentionCount: number;
  totalCount: number;
  /** When true, shows option to proceed with partial import */
  allowPartialImport?: boolean;
  /** Callback to download errors as CSV */
  onDownloadErrors?: () => void;
  /** Label for the entity being imported (e.g. "records", "transactions") */
  entityLabel?: string;
}

export function ReadinessIndicator({
  readyCount,
  attentionCount,
  totalCount,
  allowPartialImport = true,
  onDownloadErrors,
  entityLabel = 'records',
}: ReadinessIndicatorProps) {
  const readyPct = totalCount > 0 ? (readyCount / totalCount) * 100 : 0;
  const attentionPct = totalCount > 0 ? (attentionCount / totalCount) * 100 : 0;

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700">
      {/* Counts */}
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <span className="inline-flex items-center gap-1.5 text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          <strong>{readyCount.toLocaleString()}</strong> {entityLabel} ready to import
        </span>
        {attentionCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4" />
            <strong>{attentionCount.toLocaleString()}</strong> need attention
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
        {readyPct > 0 && (
          <div
            className="bg-green-500 transition-all"
            style={{ width: `${readyPct}%` }}
          />
        )}
        {attentionPct > 0 && (
          <div
            className="bg-amber-400 transition-all"
            style={{ width: `${attentionPct}%` }}
          />
        )}
      </div>

      {/* Help text + actions */}
      {attentionCount > 0 && (
        <div className="space-y-2">
          {allowPartialImport ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              You can import the {readyCount.toLocaleString()} valid {entityLabel} now and
              fix the remaining {attentionCount.toLocaleString()} later, or resolve all issues first.
              Skipped rows won&apos;t be lost — you can re-import them with a corrected file.
            </p>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Please resolve the {attentionCount.toLocaleString()} issues before importing.
            </p>
          )}
          {onDownloadErrors && (
            <button
              type="button"
              onClick={onDownloadErrors}
              className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              <Download className="h-3.5 w-3.5" />
              Download error report
            </button>
          )}
        </div>
      )}
    </div>
  );
}
