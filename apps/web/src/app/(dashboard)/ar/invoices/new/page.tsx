'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const InvoiceFormContent = dynamic(() => import('./invoice-form-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function NewARInvoicePage() {
  return <InvoiceFormContent />;
}
