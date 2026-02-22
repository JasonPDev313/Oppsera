'use client';

import dynamic from 'next/dynamic';

const OperationsContent = dynamic(() => import('./operations-content'), {
  ssr: false,
  loading: () => (
    <div className="space-y-6 p-6">
      <div className="h-8 w-48 animate-pulse rounded bg-gray-100" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
    </div>
  ),
});

export default function OperationsDashboardPage() {
  return <OperationsContent />;
}
