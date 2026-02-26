'use client';

import { useParams } from 'next/navigation';
import { useDashboard } from '@/hooks/use-dashboards';
import { DashboardBuilder } from '@/components/dashboards/dashboard-builder';
import { LoadingSpinner } from '@/components/ui/loading-spinner';

export default function EditDashboardPage() {
  const params = useParams();
  const dashboardId = params.dashboardId as string;

  const { data: dashboard, isLoading } = useDashboard(dashboardId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <LoadingSpinner size="lg" label="Loading dashboard..." />
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Dashboard not found
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <DashboardBuilder dashboardId={dashboardId} initialData={dashboard} />
    </div>
  );
}
