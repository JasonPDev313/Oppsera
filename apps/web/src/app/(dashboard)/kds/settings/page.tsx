'use client';

import dynamic from 'next/dynamic';
import { PermissionGate } from '@/components/permission-gate';

const KdsSettingsContent = dynamic(() => import('./kds-settings-content'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center py-24">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground border-t-indigo-500" />
    </div>
  ),
});

export default function KdsSettingsPage() {
  return (
    <PermissionGate permission="kds.settings.manage">
      <KdsSettingsContent />
    </PermissionGate>
  );
}
