'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const ProfitCentersContent = dynamic(() => import('./profit-centers-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function ProfitCentersPage() {
  return <ProfitCentersContent />;
}
