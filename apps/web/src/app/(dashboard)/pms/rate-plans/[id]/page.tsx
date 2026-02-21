'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const RatePlanDetailContent = dynamic(
  () => import('./rate-plan-detail-content'),
  {
    loading: () => <PageSkeleton rows={8} />,
    ssr: false,
  },
);

export default function RatePlanDetailPage() {
  return <RatePlanDetailContent />;
}
