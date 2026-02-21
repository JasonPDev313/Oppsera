'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const InsightsContent = dynamic(() => import('./insights-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function InsightsPage() {
  return <InsightsContent />;
}
