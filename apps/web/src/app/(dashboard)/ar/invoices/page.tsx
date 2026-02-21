'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const InvoicesContent = dynamic(() => import('./invoices-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function ARInvoicesPage() {
  return <InvoicesContent />;
}
