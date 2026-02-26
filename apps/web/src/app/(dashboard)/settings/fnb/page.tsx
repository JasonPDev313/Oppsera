'use client';

import dynamic from 'next/dynamic';

const FnbSettingsContent = dynamic(() => import('./fnb-settings-content'), {
  ssr: false,
  loading: () => (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded bg-muted" />
      <div className="h-64 rounded-lg bg-muted" />
    </div>
  ),
});

export default function FnbSettingsPage() {
  return <FnbSettingsContent />;
}
