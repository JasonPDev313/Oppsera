'use client';

import { useAuthContext } from '@/components/auth-provider';
import { KdsSettingsPanel } from '@/components/fnb/kds-settings-panel';

export default function KdsSettingsContent() {
  const { locations } = useAuthContext();
  const locationId = locations?.[0]?.id;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">KDS Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage kitchen stations, routing rules, bump bar profiles, and alert configurations.
        </p>
      </div>
      <KdsSettingsPanel locationId={locationId} />
    </div>
  );
}
