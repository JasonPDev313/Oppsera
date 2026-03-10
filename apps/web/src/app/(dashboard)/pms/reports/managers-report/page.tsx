'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const ManagersReportContent = dynamic(() => import('./managers-report-content'), {
  loading: () => <PageSkeleton rows={12} />,
  ssr: false,
});

export default function ManagersReportPage() {
  return <ManagersReportContent />;
}
