'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const CashFlowForecastContent = dynamic(() => import('./cash-flow-forecast-content'), {
  loading: () => <PageSkeleton rows={10} />,
  ssr: false,
});

export default function CashFlowForecastPage() {
  return <CashFlowForecastContent />;
}
