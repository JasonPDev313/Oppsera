'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';

const ImportContent = dynamic(() => import('./import-content'), {
  ssr: false,
  loading: () => <ImportSkeleton />,
});

function ImportSkeleton() {
  return (
    <div className="animate-pulse space-y-8 p-6 max-w-5xl mx-auto">
      <div className="space-y-2">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="h-4 w-96 rounded bg-muted" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-20 rounded-lg bg-muted" />
        ))}
      </div>
      <div className="h-48 rounded-lg bg-muted" />
    </div>
  );
}

export default function ImportPage() {
  return (
    <Suspense fallback={<ImportSkeleton />}>
      <ImportContent />
    </Suspense>
  );
}
