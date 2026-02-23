'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const BillingContent = dynamic(() => import('./billing-content'), {
  loading: () => <PageSkeleton />,
  ssr: false,
});

export default function BillingPage() {
  return <BillingContent />;
}
