'use client';

import dynamic from 'next/dynamic';

const HealthContent = dynamic(() => import('./health-content'), {
  ssr: false,
  loading: () => (
    <div className="space-y-4 p-6">
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={`skeleton-${i}`} className="h-24 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  ),
});

export default function HealthPage() {
  return <HealthContent />;
}
