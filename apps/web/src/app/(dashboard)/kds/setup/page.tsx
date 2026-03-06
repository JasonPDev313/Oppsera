'use client';

import dynamic from 'next/dynamic';
import { PermissionGate } from '@/components/permission-gate';

const KdsSetupContent = dynamic(() => import('./setup-content'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-24">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-indigo-500" />
    </div>
  ),
});

export default function KdsSetupPage() {
  return (
    <PermissionGate permission="kds.manage">
      <KdsSetupContent />
    </PermissionGate>
  );
}
