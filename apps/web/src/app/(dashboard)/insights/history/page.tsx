'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const HistoryContent = dynamic(() => import('./history-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function InsightsHistoryPage() {
  return <HistoryContent />;
}
