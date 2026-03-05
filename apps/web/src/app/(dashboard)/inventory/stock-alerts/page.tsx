'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const StockAlertsContent = dynamic(() => import('./stock-alerts-content'), {
  loading: () => <PageSkeleton />,
  ssr: false,
});

export default function StockAlertsPage() {
  return <StockAlertsContent />;
}
