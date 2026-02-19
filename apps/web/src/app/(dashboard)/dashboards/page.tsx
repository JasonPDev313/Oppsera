'use client';

import { SavedDashboardsList } from '@/components/dashboards/saved-dashboards-list';

export default function DashboardsPage() {
  return (
    <div className="space-y-6 p-4 md:p-6">
      <SavedDashboardsList />
    </div>
  );
}
