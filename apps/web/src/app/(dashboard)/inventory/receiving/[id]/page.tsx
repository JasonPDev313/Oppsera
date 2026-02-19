'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const ReceiptDetailContent = dynamic(() => import('./receipt-detail-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function ReceiptDetailPage() {
  return <ReceiptDetailContent />;
}
