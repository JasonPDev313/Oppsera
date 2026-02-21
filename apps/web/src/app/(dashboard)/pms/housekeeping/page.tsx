'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const HousekeepingContent = dynamic(() => import('./housekeeping-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function HousekeepingPage() {
  return <HousekeepingContent />;
}
