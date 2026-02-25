'use client';

import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const AiToolsContent = dynamic(() => import('./ai-tools-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function AiToolsPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={6} />}>
      <AiToolsContent />
    </Suspense>
  );
}
