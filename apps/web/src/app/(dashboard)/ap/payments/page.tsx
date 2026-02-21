'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const PaymentsContent = dynamic(() => import('./payments-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function APPaymentsPage() {
  return <PaymentsContent />;
}
