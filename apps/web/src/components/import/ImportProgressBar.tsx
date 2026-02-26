'use client';

import { Loader2 } from 'lucide-react';
import type { ImportProgress } from '@/hooks/use-import-progress';

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remainS = s % 60;
  return `${m}m ${remainS}s`;
}

interface ImportProgressBarProps {
  progress: ImportProgress | null;
  onCancel?: () => void;
}

export function ImportProgressBar({ progress, onCancel }: ImportProgressBarProps) {
  if (!progress) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
        <p className="mt-3 text-sm text-muted-foreground">Starting import...</p>
      </div>
    );
  }

  const pct = progress.percentage;

  return (
    <div className="space-y-4">
      {/* Progress Bar */}
      <div>
        <div className="mb-1 flex justify-between text-sm">
          <span className="font-medium">Importing...</span>
          <span>{pct}%</span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Processed" value={`${progress.processedRows} / ${progress.totalRows}`} />
        <StatCard label="Imported" value={progress.importedRows.toLocaleString()} />
        <StatCard label="Errors" value={progress.errorRows.toLocaleString()} warn={progress.errorRows > 0} />
        <StatCard label="Elapsed" value={formatElapsed(progress.elapsedMs)} />
      </div>

      {/* Cancel */}
      {!progress.isComplete && onCancel && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-red-500/30 px-4 py-2 text-sm text-red-500 hover:bg-red-500/10"
          >
            Cancel Import
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${warn ? 'text-red-600' : ''}`}>{value}</p>
    </div>
  );
}
