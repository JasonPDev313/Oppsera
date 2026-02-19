'use client';

import dynamic from 'next/dynamic';
import { PageSkeleton } from '@/components/ui/page-skeleton';

const VendorsContent = dynamic(() => import('./vendors-content'), {
  loading: () => <PageSkeleton rows={8} />,
  ssr: false,
});

export default function VendorsPage() {
  return <VendorsContent />;
}
