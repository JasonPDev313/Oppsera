'use client';

import dynamic from 'next/dynamic';

const FixedAssetsContent = dynamic(() => import('./fixed-assets-content'), {
  loading: () => (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-9 w-32 animate-pulse rounded bg-muted" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-surface" />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-lg border border-border bg-surface" />
    </div>
  ),
  ssr: false,
});

export default function FixedAssetsPage() {
  return <FixedAssetsContent />;
}
