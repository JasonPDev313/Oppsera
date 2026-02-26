'use client';

import type { StaffImportResult } from '@oppsera/core/import/staff-import-types';
import {
  CheckCircle2,
  XCircle,
  UserPlus,
  UserCog,
  UserX,
  RotateCcw,
  Download,
  AlertTriangle,
  ArrowLeft,
  Loader2,
} from 'lucide-react';

interface ResultsStepProps {
  result: StaffImportResult;
  onReset: () => void;
  onGoBack?: () => void;
  onRollback?: () => void;
  isRollingBack?: boolean;
}

export function ResultsStep({ result, onReset, onGoBack, onRollback, isRollingBack }: ResultsStepProps) {
  const total = result.createdCount + result.updatedCount + result.skippedCount + result.errorCount;
  const successCount = result.createdCount + result.updatedCount;
  const hasErrors = result.errorCount > 0;

  const downloadErrorReport = () => {
    if (result.errors.length === 0) return;
    const lines = ['Row,Error'];
    for (const e of result.errors) {
      const escaped = e.message.replace(/"/g, '""');
      lines.push(`${e.rowNumber},"${escaped}"`);
    }
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `staff-import-errors-${result.jobId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Status banner */}
      <div
        className={`rounded-lg border px-5 py-4 flex items-center gap-3 ${
          hasErrors
            ? 'border-yellow-500/40 bg-yellow-500/10'
            : 'border-green-500/40 bg-green-500/10'
        }`}
      >
        {hasErrors ? (
          <AlertTriangle className="w-6 h-6 text-yellow-500 shrink-0" />
        ) : (
          <CheckCircle2 className="w-6 h-6 text-green-500 shrink-0" />
        )}
        <div>
          <p className={`font-semibold ${hasErrors ? 'text-yellow-500' : 'text-green-500'}`}>
            {hasErrors
              ? `Import completed with ${result.errorCount} error${result.errorCount === 1 ? '' : 's'}`
              : 'Import completed successfully'}
          </p>
          <p className="text-sm text-muted-foreground mt-0.5">
            {successCount} user{successCount === 1 ? '' : 's'} imported out of {total} total rows
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ResultCard label="Created" value={result.createdCount} icon={UserPlus} color="text-green-500" />
        <ResultCard label="Updated" value={result.updatedCount} icon={UserCog} color="text-blue-500" />
        <ResultCard label="Skipped" value={result.skippedCount} icon={UserX} color="text-muted-foreground" />
        <ResultCard label="Errors" value={result.errorCount} icon={XCircle} color="text-red-500" />
      </div>

      {/* Error details */}
      {result.errors.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">
              Errors ({result.errors.length})
            </h3>
            <button
              onClick={downloadErrorReport}
              className="flex items-center gap-1.5 text-xs text-indigo-500 hover:underline"
            >
              <Download className="w-3.5 h-3.5" />
              Download Error Report
            </button>
          </div>
          <div className="max-h-[300px] overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-border text-left">
                  <th className="px-3 py-2 font-medium text-muted-foreground w-16">Row</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {result.errors.map((e, idx) => (
                  <tr key={idx} className="bg-red-500/5">
                    <td className="px-3 py-2 text-muted-foreground text-xs">{e.rowNumber}</td>
                    <td className="px-3 py-2 text-red-500 text-xs">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Job ID */}
      <p className="text-xs text-muted-foreground">
        Import Job ID: <span className="font-mono">{result.jobId}</span>
      </p>

      {/* Next steps — inline options when there are errors */}
      {hasErrors && (onGoBack || onRollback) && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <p className="text-sm font-medium text-foreground">
            What would you like to do?
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {onGoBack && (
              <button
                onClick={onGoBack}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent text-left transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-indigo-500 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">Go Back & Fix</p>
                  <p className="text-xs text-muted-foreground">
                    Return to preview, fix the errors, and re-import only the failed rows
                  </p>
                </div>
              </button>
            )}
            {onRollback && (
              <button
                onClick={onRollback}
                disabled={isRollingBack}
                className="flex items-center gap-3 p-3 rounded-lg border border-red-500/30 hover:bg-red-500/10 text-left transition-colors disabled:opacity-50"
              >
                {isRollingBack ? (
                  <Loader2 className="w-5 h-5 text-red-500 shrink-0 animate-spin" />
                ) : (
                  <RotateCcw className="w-5 h-5 text-red-500 shrink-0" />
                )}
                <div>
                  <p className="text-sm font-medium text-red-500">
                    {isRollingBack ? 'Rolling back...' : 'Roll Back Import'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Undo all {successCount} imported user{successCount === 1 ? '' : 's'} and start over
                  </p>
                </div>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end pt-4 border-t border-border">
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-500"
        >
          <RotateCcw className="w-4 h-4" />
          Import Another File
        </button>
      </div>
    </div>
  );
}

function ResultCard({ label, value, icon: Icon, color }: {
  label: string;
  value: number;
  icon: typeof UserPlus;
  color: string;
}) {
  return (
    <div className="rounded-lg border border-border p-4 text-center">
      <Icon className={`w-6 h-6 mx-auto mb-2 ${color}`} />
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
