'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const OrderDetailContent = dynamic(() => import('./order-detail-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function OrderDetailPage() {
  return <OrderDetailContent />;
}
