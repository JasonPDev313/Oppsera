'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const ModifierReportsContent = dynamic(
  () => import('./modifier-reports-content'),
  {
    loading: () => <PageSkeleton rows={8} />,
    ssr: false,
  },
);

export default function ModifierReportsPage() {
  return <ModifierReportsContent />;
}
