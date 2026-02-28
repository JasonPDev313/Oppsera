'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const RoomTypesContent = dynamic(() => import('./room-types-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function RoomTypesPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={6} />}>
      <RoomTypesContent />
    </Suspense>
  );
}
