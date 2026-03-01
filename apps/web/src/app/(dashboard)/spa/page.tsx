'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const SpaContent = dynamic(() => import('./spa-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function SpaPage() {
  return <SpaContent />;
}
