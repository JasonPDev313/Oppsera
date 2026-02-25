'use client';

import dynamic from 'next/dynamic';
import { PermissionGate } from '@/components/permission-gate';

const HostContent = dynamic(() => import('./host-content'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[calc(100vh-64px)] items-center justify-center" style={{ backgroundColor: 'var(--fnb-bg-primary)' }}>
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-current border-t-transparent" style={{ color: 'var(--fnb-text-muted)' }} />
    </div>
  ),
});

export default function HostPage() {
  return (
    <PermissionGate permission="pos_fnb.floor_plan.view">
      <HostContent />
    </PermissionGate>
  );
}
