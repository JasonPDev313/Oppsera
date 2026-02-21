'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const ReceiptFormContent = dynamic(() => import('./receipt-form-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function NewARReceiptPage() {
  return <ReceiptFormContent />;
}
