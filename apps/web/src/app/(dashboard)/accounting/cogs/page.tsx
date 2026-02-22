'use client';

import dynamic from 'next/dynamic';

const CogsContent = dynamic(() => import('./cogs-content'), {
  ssr: false,
  loading: () => (
    <div className="space-y-6 p-6">
      <div className="h-8 w-48 animate-pulse rounded bg-gray-100" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
    </div>
  ),
});

export default function CogsPage() {
  return <CogsContent />;
}
