'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const MaintenanceContent = dynamic(() => import('./maintenance-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function PMSMaintenancePage() {
  return <MaintenanceContent />;
}
