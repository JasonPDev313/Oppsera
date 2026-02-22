'use client';

import dynamic from 'next/dynamic';

const BreakageContent = dynamic(() => import('./breakage-content'), {
  loading: () => (
    <div className="p-6 space-y-4">
      <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
      <div className="h-64 bg-gray-100 rounded animate-pulse" />
    </div>
  ),
  ssr: false,
});

export default function BreakagePage() {
  return <BreakageContent />;
}
