'use client';

import dynamic from 'next/dynamic';

const TipPayoutsContent = dynamic(() => import('./tip-payouts-content'), {
  ssr: false,
  loading: () => (
    <div className="p-6 space-y-4">
      <div className="h-8 w-48 bg-muted rounded animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
      <div className="h-96 bg-muted rounded-lg animate-pulse" />
    </div>
  ),
});

export default function TipPayoutsPage() {
  return <TipPayoutsContent />;
}
