'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const TrialBalanceContent = dynamic(() => import('./trial-balance-content'), {
  loading: () => <PageSkeleton rows={10} />,
  ssr: false,
});

export default function TrialBalancePage() {
  return <TrialBalanceContent />;
}
