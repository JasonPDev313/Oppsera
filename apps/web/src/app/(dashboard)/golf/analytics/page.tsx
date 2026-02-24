'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const GolfAnalyticsContent = dynamic(() => import('./golf-analytics-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function GolfAnalyticsPage() {
  return <GolfAnalyticsContent />;
}
