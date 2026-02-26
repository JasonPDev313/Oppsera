'use client';

import dynamic from 'next/dynamic';

const SettlementsContent = dynamic(() => import('./settlements-content'), {
  loading: () => (
    <div className="p-6 space-y-4">
      <div className="h-8 w-48 bg-muted rounded animate-pulse" />
      <div className="h-64 bg-muted rounded animate-pulse" />
    </div>
  ),
  ssr: false,
});

export default function SettlementsPage() {
  return <SettlementsContent />;
}
