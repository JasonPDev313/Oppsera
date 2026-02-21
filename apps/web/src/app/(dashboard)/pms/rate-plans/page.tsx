'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const RatePlansContent = dynamic(() => import('./rate-plans-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function RatePlansPage() {
  return <RatePlansContent />;
}
