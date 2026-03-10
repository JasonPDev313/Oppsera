'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const MappingsContent = dynamic(() => import('./mappings-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function MappingsPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={8} />}>
      <MappingsContent />
    </Suspense>
  );
}
