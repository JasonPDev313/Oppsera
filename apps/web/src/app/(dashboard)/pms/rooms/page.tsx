'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const RoomsContent = dynamic(() => import('./rooms-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function RoomsPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={8} />}>
      <RoomsContent />
    </Suspense>
  );
}
