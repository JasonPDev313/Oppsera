'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const AgedTrialBalanceContent = dynamic(() => import('./aged-trial-balance-content'), {
  loading: () => <PageSkeleton rows={10} />,
  ssr: false,
});

export default function AgedTrialBalancePage() {
  return <AgedTrialBalanceContent />;
}
