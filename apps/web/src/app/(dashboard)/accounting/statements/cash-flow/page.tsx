'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const CashFlowContent = dynamic(() => import('./cash-flow-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function CashFlowPage() {
  return <CashFlowContent />;
}
