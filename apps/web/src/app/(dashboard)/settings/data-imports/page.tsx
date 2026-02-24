'use client';

import dynamic from 'next/dynamic';

const DataImportsContent = dynamic(
  () => import('./data-imports-content').then((m) => m.DataImportsContent),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-6 p-6">
        <div className="h-8 w-48 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
        <div className="h-20 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-52 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      </div>
    ),
  },
);

export default function DataImportsPage() {
  return <DataImportsContent />;
}
