'use client';

import dynamic from 'next/dynamic';

const StaffImportContent = dynamic(
  () => import('./staff-import-content'),
  {
    ssr: false,
    loading: () => (
      <div className="p-6 space-y-4">
        <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
      </div>
    ),
  },
);

export default function StaffImportPage() {
  return <StaffImportContent />;
}
