'use client';

import dynamic from 'next/dynamic';

const ReturnContent = dynamic(() => import('./return-content'), {
  ssr: false,
  loading: () => (
    <div className="space-y-6">
      <div className="h-5 w-48 animate-pulse rounded bg-gray-200" />
      <div className="space-y-4 rounded-lg border border-gray-200 bg-surface p-6">
        <div className="h-4 w-64 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-48 animate-pulse rounded bg-gray-200" />
        <div className="h-4 w-32 animate-pulse rounded bg-gray-200" />
      </div>
    </div>
  ),
});

export default function ReturnPage() {
  return <ReturnContent />;
}
