'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const PaymentFormContent = dynamic(() => import('./payment-form-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function NewAPPaymentPage() {
  return <PaymentFormContent />;
}
