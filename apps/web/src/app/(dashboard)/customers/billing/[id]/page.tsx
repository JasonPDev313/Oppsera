'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const BillingDetailContent = dynamic(() => import('./billing-detail-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function BillingAccountDetailPage() {
  return <BillingDetailContent />;
}
