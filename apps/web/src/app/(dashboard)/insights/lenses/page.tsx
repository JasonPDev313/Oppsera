'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const LensesContent = dynamic(() => import('./lenses-content'), {
  loading: () => <PageSkeleton rows={4} />,
  ssr: false,
});

export default function LensesPage() {
  return <LensesContent />;
}
