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
} from 'lucide-react';

interface ResultsStepProps {
  result: StaffImportResult;
  onReset: () => void;
}

export function ResultsStep({ result, onReset }: ResultsStepProps) {
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
          <AlertTriangle className="w-6 h-6 text-yellow-600 dark:text-yellow-400 shrink-0" />
        ) : (
          <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400 shrink-0" />
        )}
        <div>
          <p className={`font-semibold ${hasErrors ? 'text-yellow-700 dark:text-yellow-300' : 'text-green-700 dark:text-green-300'}`}>
            {hasErrors
              ? `Import completed with ${result.errorCount} error${result.errorCount === 1 ? '' : 's'}`
              : 'Import completed successfully'}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
            {successCount} user{successCount === 1 ? '' : 's'} imported out of {total} total rows
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ResultCard label="Created" value={result.createdCount} icon={UserPlus} color="text-green-600 dark:text-green-400" />
        <ResultCard label="Updated" value={result.updatedCount} icon={UserCog} color="text-blue-600 dark:text-blue-400" />
        <ResultCard label="Skipped" value={result.skippedCount} icon={UserX} color="text-gray-500 dark:text-gray-400" />
        <ResultCard label="Errors" value={result.errorCount} icon={XCircle} color="text-red-600 dark:text-red-400" />
      </div>

      {/* Error details */}
      {result.errors.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Errors ({result.errors.length})
            </h3>
            <button
              onClick={downloadErrorReport}
              className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              <Download className="w-3.5 h-3.5" />
              Download Error Report
            </button>
          </div>
          <div className="max-h-[300px] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white dark:bg-gray-900">
                <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                  <th className="px-3 py-2 font-medium text-gray-500 dark:text-gray-400 w-16">Row</th>
                  <th className="px-3 py-2 font-medium text-gray-500 dark:text-gray-400">Error</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {result.errors.map((e, idx) => (
                  <tr key={idx} className="bg-red-500/5">
                    <td className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs">{e.rowNumber}</td>
                    <td className="px-3 py-2 text-red-600 dark:text-red-400 text-xs">{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Job ID */}
      <p className="text-xs text-gray-400 dark:text-gray-500">
        Import Job ID: <span className="font-mono">{result.jobId}</span>
      </p>

      {/* Actions */}
      <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
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
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 text-center">
      <Icon className={`w-6 h-6 mx-auto mb-2 ${color}`} />
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{label}</p>
    </div>
  );
}
