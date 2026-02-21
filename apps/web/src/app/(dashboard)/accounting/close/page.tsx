'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const CloseContent = dynamic(() => import('./close-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function PeriodClosePage() {
  return <CloseContent />;
}
