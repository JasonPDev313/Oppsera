'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const BankReconciliationContent = dynamic(() => import('./bank-reconciliation-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function BankReconciliationPage() {
  return <BankReconciliationContent />;
}
