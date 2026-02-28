'use client';

import dynamic from 'next/dynamic';

const CustomerSpendingContent = dynamic(
  () => import('./customer-spending-content'),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-6 p-6">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    ),
  },
);

export default function CustomerSpendingPage() {
  return <CustomerSpendingContent />;
}
