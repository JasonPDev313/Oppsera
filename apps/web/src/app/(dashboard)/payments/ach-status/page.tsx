'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const AchStatusContent = dynamic(() => import('./ach-status-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function AchStatusPage() {
  return <AchStatusContent />;
}
