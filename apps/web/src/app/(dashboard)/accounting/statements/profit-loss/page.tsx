'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const PnlContent = dynamic(() => import('./pnl-content'), {
  loading: () => <PageSkeleton rows={10} />,
  ssr: false,
});

export default function ProfitLossPage() {
  return <PnlContent />;
}
