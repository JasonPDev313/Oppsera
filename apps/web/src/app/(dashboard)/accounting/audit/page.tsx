'use client';

import dynamic from 'next/dynamic';

const AuditContent = dynamic(() => import('./audit-content'), {
  ssr: false,
  loading: () => (
    <div className="space-y-4 p-6">
      <div className="h-8 w-48 animate-pulse rounded bg-gray-100" />
      <div className="h-64 animate-pulse rounded bg-gray-100" />
    </div>
  ),
});

export default function AuditPage() {
  return <AuditContent />;
}
