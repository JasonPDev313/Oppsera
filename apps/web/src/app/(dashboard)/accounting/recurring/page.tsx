'use client';

import dynamic from 'next/dynamic';

const RecurringContent = dynamic(() => import('./recurring-content'), {
  loading: () => (
    <div className="p-6 space-y-4">
      <div className="h-8 w-64 bg-muted rounded animate-pulse" />
      <div className="h-64 bg-muted rounded animate-pulse" />
    </div>
  ),
  ssr: false,
});

export default function RecurringPage() {
  return <RecurringContent />;
}
