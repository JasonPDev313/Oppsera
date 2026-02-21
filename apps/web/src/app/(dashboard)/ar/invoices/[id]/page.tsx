'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const InvoiceDetailContent = dynamic(() => import('./invoice-detail-content'), {
  loading: () => <PageSkeleton rows={5} />,
  ssr: false,
});

export default function ARInvoiceDetailPage() {
  return <InvoiceDetailContent />;
}
