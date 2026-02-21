'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const InsightsContent = dynamic(() => import('./insights-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function InsightsPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={6} />}>
      <InsightsContent />
    </Suspense>
  );
}
