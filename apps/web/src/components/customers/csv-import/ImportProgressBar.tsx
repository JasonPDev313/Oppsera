'use client';

import { Loader2 } from 'lucide-react';

interface ImportProgressBarProps {
  totalRows: number;
}

export function ImportProgressBar({ totalRows }: ImportProgressBarProps) {
  return (
    <div className="flex flex-col items-center justify-center space-y-4 py-12">
      <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
      <div className="text-center">
        <p className="text-lg font-semibold text-foreground">
          Importing customers...
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Processing {totalRows.toLocaleString()} record{totalRows !== 1 ? 's' : ''}. Please don&apos;t close this window.
        </p>
      </div>
      <div className="h-2 w-64 overflow-hidden rounded-full bg-muted">
        <div className="h-full animate-pulse rounded-full bg-indigo-600" style={{ width: '60%' }} />
      </div>
    </div>
  );
}
