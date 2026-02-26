'use client';

import { Loader2 } from 'lucide-react';

interface ImportProgressStepProps {
  label?: string;
  sublabel?: string;
}

export function ImportProgressStep({
  label = 'Importing...',
  sublabel = 'This may take a moment',
}: ImportProgressStepProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
      <p className="mt-4 text-sm font-medium text-foreground">
        {label}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {sublabel}
      </p>
    </div>
  );
}
