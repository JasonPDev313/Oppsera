'use client';

import dynamic from 'next/dynamic';

const FnbInventoryContent = dynamic(() => import('./fnb-inventory-content'), {
  loading: () => (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="h-7 w-48 rounded bg-accent" />
        <div className="h-10 w-32 rounded bg-accent" />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="h-10 w-64 rounded bg-accent" />
        <div className="h-10 w-48 rounded bg-accent" />
        <div className="h-10 w-48 rounded bg-accent" />
        <div className="h-10 w-48 rounded bg-accent" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-12 rounded bg-accent" />
        ))}
      </div>
    </div>
  ),
  ssr: false,
});

export default function FnbInventoryPage() {
  return <FnbInventoryContent />;
}
