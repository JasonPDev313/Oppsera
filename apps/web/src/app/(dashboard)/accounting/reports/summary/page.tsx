'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const GLSummaryContent = dynamic(() => import('./gl-summary-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function GLSummaryPage() {
  return <GLSummaryContent />;
}
