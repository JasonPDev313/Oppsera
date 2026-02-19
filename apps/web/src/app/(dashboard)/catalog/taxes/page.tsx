'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const TaxesContent = dynamic(() => import('./taxes-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function TaxesPage() {
  return <TaxesContent />;
}
