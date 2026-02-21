'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const SalesTaxContent = dynamic(() => import('./sales-tax-content'), {
  loading: () => <PageSkeleton rows={6} />,
  ssr: false,
});

export default function SalesTaxPage() {
  return <SalesTaxContent />;
}
