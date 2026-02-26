'use client';

import dynamic from 'next/dynamic';

const ErpConfigContent = dynamic(() => import('./erp-config-content'), {
  loading: () => (
    <div className="space-y-6">
      <div className="h-8 w-48 animate-pulse rounded bg-muted" />
      <div className="h-4 w-80 animate-pulse rounded bg-muted" />
      <div className="h-10 w-full animate-pulse rounded bg-muted" />
      <div className="h-64 w-full animate-pulse rounded-lg bg-muted" />
    </div>
  ),
  ssr: false,
});

export default function ErpConfigPage() {
  return <ErpConfigContent />;
}
