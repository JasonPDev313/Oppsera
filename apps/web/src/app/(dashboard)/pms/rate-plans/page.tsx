'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const RatePlansContent = dynamic(() => import('./rate-plans-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function RatePlansPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={6} />}>
      <RatePlansContent />
    </Suspense>
  );
}
