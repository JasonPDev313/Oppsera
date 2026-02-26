'use client';

import dynamic from 'next/dynamic';

const ImportWizardContent = dynamic(() => import('../import-wizard-content'), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-8 w-64 rounded bg-muted" />
      <div className="h-96 rounded bg-muted" />
    </div>
  ),
});

export default function ImportDetailPage() {
  return <ImportWizardContent />;
}
