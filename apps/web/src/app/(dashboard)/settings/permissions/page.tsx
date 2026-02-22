'use client';

import dynamic from 'next/dynamic';

const PermissionsContent = dynamic(() => import('./permissions-content'), {
  ssr: false,
  loading: () => (
    <div className="space-y-4 p-6">
      <div className="h-8 w-48 animate-pulse rounded bg-gray-100" />
      <div className="h-96 animate-pulse rounded bg-gray-100" />
    </div>
  ),
});

export default function PermissionsPage() {
  return <PermissionsContent />;
}
