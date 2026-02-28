'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const BudgetsContent = dynamic(() => import('./budgets-content'), {
  loading: () => <PageSkeleton rows={10} />,
  ssr: false,
});

export default function BudgetsPage() {
  return <BudgetsContent />;
}
