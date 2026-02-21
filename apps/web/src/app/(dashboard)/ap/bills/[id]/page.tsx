'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const BillDetailContent = dynamic(() => import('./bill-detail-content'), {
  loading: () => <PageSkeleton />,
  ssr: false,
});

export default function BillDetailPage() {
  return <BillDetailContent />;
}
