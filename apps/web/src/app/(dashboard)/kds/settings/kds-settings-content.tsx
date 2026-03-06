'use client';

import { useAuthContext } from '@/components/auth-provider';
import { KdsSettingsPanel } from '@/components/fnb/kds-settings-panel';
import Link from 'next/link';
import { Wand2 } from 'lucide-react';

export default function KdsSettingsContent() {
  const { locations } = useAuthContext();
  const locationId = locations?.[0]?.id;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">KDS Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage kitchen stations, routing rules, bump bar profiles, and alert configurations.
          </p>
        </div>
        <Link
          href="/kds/setup"
          className="inline-flex items-center gap-2 rounded-lg border border-input px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-accent"
        >
          <Wand2 className="h-4 w-4" />
          Setup Wizard
        </Link>
      </div>
      <KdsSettingsPanel locationId={locationId} />
    </div>
  );
}
