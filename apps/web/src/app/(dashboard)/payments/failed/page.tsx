'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const FailedPaymentsContent = dynamic(() => import('./failed-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function FailedPaymentsPage() {
  return <FailedPaymentsContent />;
}
