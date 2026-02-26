'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const UtilizationContent = dynamic(() => import('./utilization-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function PmsUtilizationPage() {
  return <UtilizationContent />;
}
