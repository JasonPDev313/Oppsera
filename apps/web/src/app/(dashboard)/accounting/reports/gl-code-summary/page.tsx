'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const GlCodeSummaryContent = dynamic(() => import('./gl-code-summary-content'), {
  loading: () => <PageSkeleton rows={10} />,
  ssr: false,
});

export default function GlCodeSummaryPage() {
  return <GlCodeSummaryContent />;
}
