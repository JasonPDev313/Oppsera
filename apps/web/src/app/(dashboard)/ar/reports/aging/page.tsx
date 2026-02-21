'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const ARAgingContent = dynamic(() => import('./ar-aging-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function ARAgingPage() {
  return <ARAgingContent />;
}
