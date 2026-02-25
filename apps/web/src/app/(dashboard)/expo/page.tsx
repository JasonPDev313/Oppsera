'use client';

import dynamic from 'next/dynamic';
import { PermissionGate } from '@/components/permission-gate';

const ExpoContent = dynamic(() => import('./expo-content'), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
      <div className="h-8 w-8 border-2 rounded-full animate-spin"
        style={{ borderColor: 'var(--fnb-text-muted)', borderTopColor: 'var(--fnb-status-seated)' }} />
    </div>
  ),
});

export default function ExpoPage() {
  return (
    <PermissionGate permission="pos_fnb.kds.view">
      <ExpoContent />
    </PermissionGate>
  );
}
