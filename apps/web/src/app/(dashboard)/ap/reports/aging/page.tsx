'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const APAgingContent = dynamic(() => import('./ap-aging-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function APAgingPage() {
  return <APAgingContent />;
}
