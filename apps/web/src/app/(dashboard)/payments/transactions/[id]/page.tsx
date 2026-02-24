'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const TransactionDetailContent = dynamic(
  () => import('./transaction-detail-content'),
  {
    loading: () => <PageSkeleton rows={6} />,
    ssr: false,
  },
);

export default function TransactionDetailPage() {
  return <TransactionDetailContent />;
}
