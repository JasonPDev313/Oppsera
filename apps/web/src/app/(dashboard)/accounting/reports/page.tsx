'use client';

import dynamic from 'next/dynamic';

const ReportsHubContent = dynamic(() => import('./reports-hub-content'), {
  ssr: false,
  loading: () => (
    <div className="space-y-6 p-6">
      <div className="h-8 w-64 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  ),
});

export default function ReportsHubPage() {
  return <ReportsHubContent />;
}
