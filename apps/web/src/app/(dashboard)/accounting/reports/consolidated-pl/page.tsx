'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const ConsolidatedPLContent = dynamic(() => import('./consolidated-pl-content'), {
  loading: () => <PageSkeleton rows={10} />,
  ssr: false,
});

export default function ConsolidatedPLPage() {
  return <ConsolidatedPLContent />;
}
