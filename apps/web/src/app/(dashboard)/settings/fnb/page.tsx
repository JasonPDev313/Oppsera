'use client';

import dynamic from 'next/dynamic';

const FnbSettingsContent = dynamic(() => import('./fnb-settings-content'), {
  ssr: false,
  loading: () => (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-64 rounded-lg bg-gray-200 dark:bg-gray-700" />
    </div>
  ),
});

export default function FnbSettingsPage() {
  return <FnbSettingsContent />;
}
