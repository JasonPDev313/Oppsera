'use client';

import { useParams } from 'next/navigation';
import { DashboardViewer } from '@/components/dashboards/dashboard-viewer';

export default function ViewDashboardPage() {
  const params = useParams();
  const dashboardId = params.dashboardId as string;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <DashboardViewer dashboardId={dashboardId} />
    </div>
  );
}
