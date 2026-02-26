'use client';

import dynamic from 'next/dynamic';

const DepositsContent = dynamic(() => import('./deposits-content'), {
  ssr: false,
  loading: () => (
    <div className="space-y-6 p-6">
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="h-64 animate-pulse rounded-lg bg-muted" />
    </div>
  ),
});

export default function DepositsPage() {
  return <DepositsContent />;
}
