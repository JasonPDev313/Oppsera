'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const GolfReportsContent = dynamic(() => import('./golf-reports-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function GolfReportsPage() {
  return <GolfReportsContent />;
}
