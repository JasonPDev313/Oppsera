'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const ReportsContent = dynamic(() => import('./reports-content'), {
  loading: () => <PageSkeleton rows={4} />,
  ssr: false,
});

export default function InsightsReportsPage() {
  return <ReportsContent />;
}
