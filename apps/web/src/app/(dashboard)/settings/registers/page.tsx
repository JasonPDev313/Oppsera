'use client';

import dynamic from 'next/dynamic';
import { PermissionGate } from '@/components/permission-gate';

const RegistersContent = dynamic(() => import('./registers-content'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-24">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-indigo-500" />
    </div>
  ),
});

export default function RegistersPage() {
  return (
    <PermissionGate permission="settings.manage">
      <RegistersContent />
    </PermissionGate>
  );
}
