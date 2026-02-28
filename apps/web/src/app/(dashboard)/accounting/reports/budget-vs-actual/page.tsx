'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const BudgetVsActualContent = dynamic(() => import('./budget-vs-actual-content'), {
  loading: () => <PageSkeleton rows={10} />,
  ssr: false,
});

export default function BudgetVsActualPage() {
  return <BudgetVsActualContent />;
}
