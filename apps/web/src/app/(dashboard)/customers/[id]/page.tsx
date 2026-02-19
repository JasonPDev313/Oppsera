'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const CustomerDetailContent = dynamic(() => import('./customer-detail-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function CustomerDetailPage() {
  return <CustomerDetailContent />;
}
