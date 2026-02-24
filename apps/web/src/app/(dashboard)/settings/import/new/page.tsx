'use client';

import dynamic from 'next/dynamic';

const ImportWizardContent = dynamic(() => import('../import-wizard-content'), {
  ssr: false,
  loading: () => (
    <div className="animate-pulse space-y-4 p-6">
      <div className="h-8 w-64 rounded bg-gray-200 dark:bg-gray-700" />
      <div className="h-96 rounded bg-gray-200 dark:bg-gray-700" />
    </div>
  ),
});

export default function NewImportPage() {
  return <ImportWizardContent />;
}
