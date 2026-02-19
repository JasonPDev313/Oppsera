'use client';

import { SavedReportsList } from '@/components/reports/custom/saved-reports-list';

export default function CustomReportsPage() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <SavedReportsList />
    </div>
  );
}
