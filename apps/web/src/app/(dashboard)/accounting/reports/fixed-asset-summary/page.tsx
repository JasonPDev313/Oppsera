'use client';

import dynamic from 'next/dynamic';

const FixedAssetSummaryContent = dynamic(() => import('./fixed-asset-summary-content'), {
  loading: () => (
    <div className="space-y-6 p-6">
      <div className="h-8 w-72 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg border border-border bg-surface" />
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-lg border border-border bg-surface" />
      ))}
    </div>
  ),
  ssr: false,
});

export default function FixedAssetSummaryPage() {
  return <FixedAssetSummaryContent />;
}
