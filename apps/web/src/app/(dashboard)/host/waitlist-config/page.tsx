'use client';

import dynamic from 'next/dynamic';
import { PermissionGate } from '@/components/permission-gate';

const WaitlistConfigContent = dynamic(() => import('./waitlist-config-content'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[calc(100vh-64px)] items-center justify-center bg-muted/80">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
    </div>
  ),
});

export default function WaitlistConfigPage() {
  return (
    <PermissionGate permission="pos_fnb.host.manage">
      <WaitlistConfigContent />
    </PermissionGate>
  );
}
