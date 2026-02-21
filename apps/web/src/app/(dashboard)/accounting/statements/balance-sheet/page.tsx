'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const BalanceSheetContent = dynamic(() => import('./balance-sheet-content'), {
  loading: () => <PageSkeleton rows={10} />,
  ssr: false,
});

export default function BalanceSheetPage() {
  return <BalanceSheetContent />;
}
